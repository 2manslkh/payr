import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPrivyProvider } from "./provider";

const mocks = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), quorum: vi.fn(), verify: vi.fn() }));
vi.mock("@privy-io/node", () => ({ PrivyClient: class {
  wallets() { return { get: mocks.get, create: mocks.create }; }
  keyQuorums() { return { get: mocks.quorum }; }
  utils() { return { auth: () => ({ verifyAccessToken: mocks.verify }) }; }
} }));
let wallet: { id: string; address: string; external_id: string; chain_type: string; owner_id: string; policy_ids: string[]; additional_signers: unknown[] };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "app"); vi.stubEnv("PRIVY_APP_SECRET", "test-secret"); vi.stubEnv("PRIVY_WALLET_POLICY_ID", "policy");
  wallet = { id: "wallet", address: `0x${"1".repeat(40)}`, external_id: "", chain_type: "ethereum", owner_id: "quorum", policy_ids: ["policy"], additional_signers: [] };
  mocks.get.mockImplementation(async (id: string) => ({ ...wallet, external_id: id.slice("ext_wal_".length) }));
  mocks.quorum.mockResolvedValue({ authorization_threshold: 1, user_ids: ["did:privy:owner"], authorization_keys: [], key_quorum_ids: [] });
});
afterEach(() => vi.unstubAllEnvs());
it("reuses the stable external ID and verifies the owner's quorum", async () => {
  const provider = createPrivyProvider();
  await provider.ensureWallet("did:privy:owner"); await provider.ensureWallet("did:privy:owner");
  expect(mocks.get.mock.calls[0]).toEqual(mocks.get.mock.calls[1]);
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.quorum).toHaveBeenCalledWith("quorum");
});
it("creates only on not-found with a fixed user owner, policy and no delegated signers", async () => {
  mocks.get.mockRejectedValueOnce(Object.assign(new Error("missing"), { status: 404 }));
  mocks.create.mockImplementation(async (input) => ({ ...wallet, external_id: input.external_id }));
  await createPrivyProvider().ensureWallet("did:privy:owner");
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ owner: { user_id: "did:privy:owner" }, policy_ids: ["policy"], additional_signers: [] }));
  const input = mocks.create.mock.calls[0][0]; expect(input.external_id).toBe(input.idempotency_key);
});
it("recovers creation after an uncertain response without minting a second wallet", async () => {
  mocks.get.mockRejectedValueOnce(Object.assign(new Error("missing"), { status: 404 }));
  mocks.create.mockRejectedValueOnce(new Error("timeout"));
  await expect(createPrivyProvider().ensureWallet("did:privy:owner")).resolves.toMatchObject({ id: "wallet" });
  expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.get).toHaveBeenCalledTimes(2);
});
it("does not create on an upstream outage or authorization error", async () => {
  mocks.get.mockRejectedValueOnce(Object.assign(new Error("outage"), { status: 503 }));
  await expect(createPrivyProvider().ensureWallet("did:privy:owner")).rejects.toMatchObject({ code: "WALLET_UNAVAILABLE" });
  expect(mocks.create).not.toHaveBeenCalled();
});
it("fails closed on changed wallet controls or a different owner", async () => {
  for (const change of [{ policy_ids: ["unknown"] }, { owner_id: "" }, { additional_signers: [{}] }, { chain_type: "solana" }]) {
    const original = { ...wallet }; Object.assign(wallet, change);
    await expect(createPrivyProvider().ensureWallet("did:privy:owner")).rejects.toMatchObject({ code: "WALLET_CONTROL_MISMATCH" });
    wallet = original;
  }
  mocks.quorum.mockResolvedValueOnce({ authorization_threshold: 1, user_ids: ["did:privy:attacker"], authorization_keys: [] });
  await expect(createPrivyProvider().ensureWallet("did:privy:owner")).rejects.toMatchObject({ code: "WALLET_CONTROL_MISMATCH" });
});
it("retains explicitly approved historical policies during rotation", async () => {
  wallet.policy_ids = ["old-policy"];
  vi.stubEnv("PRIVY_ACCEPTED_WALLET_POLICY_IDS", "old-policy");
  await expect(createPrivyProvider().ensureWallet("did:privy:owner")).resolves.toMatchObject({ id: "wallet" });
});
