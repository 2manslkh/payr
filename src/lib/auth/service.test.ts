// @vitest-environment node
import { expect, it, vi } from "vitest";
import { IdentityError, type AuthNonce } from "../identity/contracts";
import { buildAuthMessage } from "./message";
import { createAuthService } from "./service";
import { config, createAuthRepository, identity, newPayee, owner, payee } from "./test-support";

it("logs in a real EOA using only a nonce ID and signature over a fresh five-minute challenge", async () => {
  const { state, repository } = createAuthRepository();
  const auth = createAuthService(repository, config, () => state.now);
  const nonce = await auth.issue({ purpose: "payr-login-v1", wallet: owner.address });
  expect(nonce.expiresAt).toBe("2026-09-05T00:05:00.000Z");
  const stored = state.nonces.get(nonce.nonceId)!;
  expect(stored.wallet).toBe(identity.ownerWallet);
  expect(stored.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(Buffer.from(stored.challenge, "base64url")).toHaveLength(32);
  const second = await auth.issue({ purpose: "payr-login-v1", wallet: owner.address });
  expect(second.nonceId).not.toBe(nonce.nonceId);
  expect(state.nonces.get(second.nonceId)!.challenge).not.toBe(stored.challenge);
  const signature = await owner.signMessage({ message: nonce.message });
  await expect(auth.verify({ nonceId: nonce.nonceId, signature })).resolves.toEqual({ session: identity });
});

it.each([
  { id: "00000000-0000-4000-8000-000000000099" },
  { domain: "evil.test" }, { uri: "https://evil.test" }, { chainId: 1 },
  { purpose: "payr-payout-change-v1" }, { purpose: "other-purpose" },
  { challenge: "A".repeat(42) }, { challenge: `${"A".repeat(42)}B` },
  { issuedAt: "2026-09-05T00:00:00.001Z" }, { issuedAt: "invalid" },
  { expiresAt: "2026-09-05T00:00:00.000Z" }, { expiresAt: "2026-09-05T00:05:00.001Z" },
  { consumedAt: "2026-09-05T00:00:00.000Z" },
  { workspaceId: identity.workspaceId }, { payoutFrom: payee.address.toLowerCase() },
  { payoutTo: newPayee.address.toLowerCase() }, { profileRevision: 1 },
  { wallet: owner.address },
])("denies invalid stored login facts even if the owner signs them: %j", async (patch) => {
  const { state, repository } = createAuthRepository();
  const complete = vi.spyOn(repository, "completeLogin");
  const auth = createAuthService(repository, config, () => state.now);
  const issued = await auth.issue({ purpose: "payr-login-v1", wallet: owner.address });
  const hostile = { ...state.nonces.get(issued.nonceId)!, ...patch } as AuthNonce;
  state.nonces.set(issued.nonceId, hostile);
  let message = issued.message;
  try { message = buildAuthMessage(hostile); } catch { /* Malformed records have no signable layout. */ }
  await expect(auth.verify({ nonceId: issued.nonceId, signature: await owner.signMessage({ message }) })).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
  expect(complete).not.toHaveBeenCalled();
});

it.each([
  { challenge: "B".repeat(42) + "A" }, { wallet: payee.address.toLowerCase() },
  { issuedAt: "2026-09-04T23:59:59.000Z" }, { expiresAt: "2026-09-05T00:04:59.000Z" },
])("rejects changes to signed login facts: %j", async (patch) => {
  const { state, repository } = createAuthRepository();
  const auth = createAuthService(repository, config, () => state.now);
  const nonce = await auth.issue({ purpose: "payr-login-v1", wallet: owner.address });
  state.nonces.set(nonce.nonceId, { ...state.nonces.get(nonce.nonceId)!, ...patch });
  await expect(auth.verify({ nonceId: nonce.nonceId, signature: await owner.signMessage({ message: nonce.message }) })).rejects.toBeInstanceOf(IdentityError);
});

it.each(["payr-login-v1", "payr-payout-change-v1"] as const)("allows exactly one concurrent %s completion and denies replay and exact expiry", async (purpose) => {
  const { state, repository } = createAuthRepository();
  const auth = createAuthService(repository, config, () => state.now);
  const nonce = await auth.issue(purpose === "payr-login-v1" ? { purpose, wallet: owner.address }
    : { purpose, newPayoutWallet: newPayee.address, expectedRevision: 1 }, identity);
  const input = { nonceId: nonce.nonceId, signature: await owner.signMessage({ message: nonce.message }) };
  const results = await Promise.allSettled([auth.verify(input, identity), auth.verify(input, identity)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  await expect(auth.verify(input, identity)).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
  const expired = await auth.issue({ purpose: "payr-login-v1", wallet: owner.address });
  state.now = new Date(expired.expiresAt);
  await expect(auth.verify({ nonceId: expired.nonceId, signature: await owner.signMessage({ message: expired.message }) }))
    .rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
});

it.each([
  { payoutFrom: newPayee.address.toLowerCase() }, { payoutTo: payee.address.toLowerCase() },
  { profileRevision: 2 }, { profileRevision: null }, { payoutTo: null },
  { workspaceId: "00000000-0000-4000-8000-000000000099" }, { purpose: "payr-login-v1" },
  { wallet: payee.address.toLowerCase() },
])("rejects tampered payout scope: %j", async (patch) => {
  const { state, repository } = createAuthRepository();
  const apply = vi.spyOn(repository, "applyPayoutChange");
  const auth = createAuthService(repository, config, () => state.now);
  const nonce = await auth.issue({ purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 1 }, identity);
  state.nonces.set(nonce.nonceId, { ...state.nonces.get(nonce.nonceId)!, ...patch } as AuthNonce);
  await expect(auth.verify({ nonceId: nonce.nonceId, signature: await owner.signMessage({ message: nonce.message }) }, identity)).rejects.toBeInstanceOf(IdentityError);
  expect(apply).not.toHaveBeenCalled();
});

it("rejects a stale payout revision both at issuance and after signing", async () => {
  const { state, repository } = createAuthRepository();
  const auth = createAuthService(repository, config, () => state.now);
  await expect(auth.issue({ purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 2 }, identity))
    .rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  const nonce = await auth.issue({ purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 1 }, identity);
  state.profile = { ...state.profile, revision: 2 };
  await expect(auth.verify({ nonceId: nonce.nonceId, signature: await owner.signMessage({ message: nonce.message }) }, identity))
    .rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
});

it("changes the snapshotted payout only with the owner's signature and current session", async () => {
  const { state, repository } = createAuthRepository();
  state.profile = { ...state.profile, payoutWallet: payee.address.toLowerCase() };
  const auth = createAuthService(repository, config, () => state.now);
  await expect(auth.issue({ purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 1 }))
    .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  const nonce = await auth.issue({ purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 1 }, identity);
  expect(state.nonces.get(nonce.nonceId)).toMatchObject({
    workspaceId: identity.workspaceId, wallet: identity.ownerWallet, payoutFrom: payee.address.toLowerCase(),
    payoutTo: newPayee.address.toLowerCase(), profileRevision: 1,
  });
  for (const signer of [payee, newPayee]) {
    await expect(auth.verify({ nonceId: nonce.nonceId, signature: await signer.signMessage({ message: nonce.message }) }, identity))
      .rejects.toMatchObject({ code: "SIGNATURE_INVALID" });
  }
  const input = { nonceId: nonce.nonceId, signature: await owner.signMessage({ message: nonce.message }) };
  await expect(auth.verify(input)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  await expect(auth.verify(input, { ...identity, workspaceId: "00000000-0000-4000-8000-000000000099" }))
    .rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
  await expect(auth.verify(input, { ...identity, ownerWallet: payee.address.toLowerCase() }))
    .rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
  await expect(auth.verify(input, identity)).resolves.toEqual({ session: identity, profile: { ...state.profile, revision: 2, payoutWallet: newPayee.address.toLowerCase() } });
});

it.each([
  ["payrlink.xyz wants", "evil.test wants"], [owner.address, payee.address],
  ["URI: https://payrlink.xyz", "URI: https://evil.test"], ["Version: 1", "Version: 2"],
  ["Chain ID: 5042002", "Chain ID: 1"], ["Nonce: ", "Nonce: X"],
  ["Issued At: 2026-09-05T00:00:00.000Z", "Issued At: 2026-09-04T23:59:59.000Z"],
  ["Expiration Time: 2026-09-05T00:05:00.000Z", "Expiration Time: 2026-09-05T00:04:59.000Z"],
  ["Request ID: ", "Request ID: X"], ["Purpose: payr-login-v1", "Purpose: payr-payout-change-v1"],
])("rejects signatures over a client-modified message line: %s", async (original, replacement) => {
  const { state, repository } = createAuthRepository();
  const auth = createAuthService(repository, config, () => state.now);
  const nonce = await auth.issue({ purpose: "payr-login-v1", wallet: owner.address });
  const signature = await owner.signMessage({ message: nonce.message.replace(original, replacement) });
  await expect(auth.verify({ nonceId: nonce.nonceId, signature })).rejects.toMatchObject({ code: "SIGNATURE_INVALID" });
});

it("fails closed on missing nonces and unrecoverable EOA signatures", async () => {
  const { state, repository } = createAuthRepository();
  const auth = createAuthService(repository, config, () => state.now);
  const signature = `0x${"0".repeat(130)}`;
  await expect(auth.verify({ nonceId: identity.workspaceId, signature })).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
  const nonce = await auth.issue({ purpose: "payr-login-v1", wallet: owner.address });
  await expect(auth.verify({ nonceId: nonce.nonceId, signature })).rejects.toMatchObject({ code: "SIGNATURE_INVALID" });
  expect(state.nonces.get(nonce.nonceId)!.consumedAt).toBeNull();
});

it("keeps the payout compare-and-swap at atomic completion when the profile changes after the service read", async () => {
  const { state, repository } = createAuthRepository();
  const auth = createAuthService(repository, config, () => state.now);
  const nonce = await auth.issue({ purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 1 }, identity);
  const originalGet = repository.getProfile;
  const racingAuth = createAuthService({
    ...repository,
    async getProfile(session) {
      const snapshot = await originalGet(session);
      state.profile = { ...state.profile, revision: 2 };
      return snapshot;
    },
  }, config, () => state.now);
  await expect(racingAuth.verify({ nonceId: nonce.nonceId, signature: await owner.signMessage({ message: nonce.message }) }, identity))
    .rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
  expect(state.profile.payoutWallet).toBe(identity.ownerWallet);
  expect(state.nonces.get(nonce.nonceId)!.consumedAt).toBeNull();
});
