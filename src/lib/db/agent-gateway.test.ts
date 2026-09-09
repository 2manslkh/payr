import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_SCOPES, type GatewayRepository, type RegistrationChallenge } from "../agent-api/contracts";
import { createGatewayRepository } from "./agent-gateway";
import type { RpcResult } from "./repositories";

const id = "aaaaaaaa-1111-4111-8111-111111111111";
const otherId = "bbbbbbbb-2222-4222-8222-222222222222";
const wallet = `0x${"1".repeat(40)}`;
const auth = { serviceId: "bazantic", id, tokenHash: "a".repeat(64) };
const ipHash = "b".repeat(64);
const challenge: RegistrationChallenge = {
  id, serviceId: auth.serviceId, wallet, challenge: "A".repeat(43), domain: "payr.example", uri: "https://payr.example",
  chainId: 5042002, issuedAt: "2026-09-09T00:00:00.000Z", expiresAt: "2026-09-09T00:05:00.000Z",
  consumedAt: null, scopes: [...ACCOUNT_SCOPES], expiresInDays: 7,
};
const account = {
  workspaceId: otherId, ownerWallet: wallet, senderSetupRequired: true,
  credential: { id, createdAt: "2026-09-09T00:00:00.123456+00:00", expiresAt: "2026-09-16T00:00:00.123000+00:00",
    revokedAt: null, lastUsedAt: null, scopes: [...ACCOUNT_SCOPES] },
};
const completion = { challengeId: id, serviceId: auth.serviceId, verifiedWallet: wallet, connectorId: id, tokenHash: auth.tokenHash };

function setup(data: unknown = account, error: RpcResult["error"] = null) {
  const rpc = vi.fn(async (): Promise<RpcResult> => ({ data, error }));
  return { rpc, repository: createGatewayRepository({ rpc }) };
}

describe("gateway repository", () => {
  it("implements exactly the frozen six-method interface, without admin or owner capabilities", () => {
    expect(Object.keys(setup().repository).sort()).toEqual([
      "admitAccount", "admitService", "completeRegistration", "findChallenge", "issueChallenge", "revokeAccount",
    ]);
  });

  it("uses fixed RPC names and only scoped parameters for every method", async () => {
    const { rpc, repository } = setup();
    rpc.mockResolvedValueOnce({ data: { serviceId: auth.serviceId }, error: null });
    expect(await repository.admitService({ id, tokenHash: auth.tokenHash, operation: "get_account", ipHash })).toEqual({ serviceId: auth.serviceId });
    expect(rpc).toHaveBeenLastCalledWith("payr_admit_gateway_service_v1", { p_id: id, p_token_hash: auth.tokenHash, p_operation: "get_account", p_ip_hash: ipHash });
    rpc.mockResolvedValueOnce({ data: { issued: true }, error: null });
    expect(await repository.issueChallenge({ challenge, walletHash: ipHash, ipHash })).toBeUndefined();
    expect(rpc).toHaveBeenLastCalledWith("payr_issue_agent_challenge_v1", { p_challenge: challenge, p_wallet_hash: ipHash, p_ip_hash: ipHash });
    rpc.mockResolvedValueOnce({ data: challenge, error: null });
    expect(await repository.findChallenge({ id, serviceId: auth.serviceId })).toEqual(challenge);
    expect(rpc).toHaveBeenLastCalledWith("payr_find_agent_challenge_v1", { p_id: id, p_service_id: auth.serviceId });
    expect(await repository.completeRegistration(completion)).toEqual(account);
    expect(rpc).toHaveBeenLastCalledWith("payr_complete_agent_registration_v1", { p_challenge_id: id, p_service_id: auth.serviceId,
      p_verified_wallet: wallet, p_connector_id: id, p_token_hash: auth.tokenHash });
    expect(await repository.admitAccount({ ...auth, action: "sender:write", ipHash })).toEqual(account);
    expect(rpc).toHaveBeenLastCalledWith("payr_admit_agent_account_v1", { p_service_id: auth.serviceId, p_id: id,
      p_token_hash: auth.tokenHash, p_action: "sender:write", p_ip_hash: ipHash });
    rpc.mockResolvedValueOnce({ data: { credentialId: id, revoked: true }, error: null });
    expect(await repository.revokeAccount(auth)).toEqual({ credentialId: id, revoked: true });
    expect(rpc).toHaveBeenLastCalledWith("payr_revoke_agent_account_v1", { p_service_id: auth.serviceId, p_id: id, p_token_hash: auth.tokenHash });
  });

  it("accepts nullable lookup but rejects foreign signed facts", async () => {
    expect(await setup(null).repository.findChallenge({ id, serviceId: auth.serviceId })).toBeNull();
    for (const value of [{ ...challenge, id: otherId }, { ...challenge, serviceId: "foreign" }, { ...challenge, purpose: "payr-login-v1" },
      { ...challenge, scopes: ["invoice:status", "invoice:void"] }, { ...challenge, expiresInDays: 8 },
      { ...challenge, consumedAt: challenge.expiresAt }, { ...challenge, uri: "https://attacker.test" }]) {
      await expect(setup(value).repository.findChallenge({ id, serviceId: auth.serviceId }))
        .rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", status: 503 });
    }
  });

  it("normalizes uppercase UUID inputs before RPC and response identity checks", async () => {
    const { rpc, repository } = setup();
    const upperId = id.toUpperCase();
    rpc.mockResolvedValueOnce({ data: { serviceId: auth.serviceId }, error: null });
    await repository.admitService({ id: upperId, tokenHash: auth.tokenHash, operation: "get_account", ipHash });
    expect(rpc).toHaveBeenLastCalledWith("payr_admit_gateway_service_v1", expect.objectContaining({ p_id: id }));
    rpc.mockResolvedValueOnce({ data: { issued: true }, error: null });
    await repository.issueChallenge({ challenge: { ...challenge, id: upperId }, walletHash: ipHash, ipHash });
    expect(rpc).toHaveBeenLastCalledWith("payr_issue_agent_challenge_v1", expect.objectContaining({ p_challenge: challenge }));
    rpc.mockResolvedValueOnce({ data: challenge, error: null });
    expect(await repository.findChallenge({ id: upperId, serviceId: auth.serviceId })).toEqual(challenge);
    expect(rpc).toHaveBeenLastCalledWith("payr_find_agent_challenge_v1", { p_id: id, p_service_id: auth.serviceId });
    expect(await repository.completeRegistration({ ...completion, challengeId: upperId, connectorId: upperId })).toEqual(account);
    expect(rpc).toHaveBeenLastCalledWith("payr_complete_agent_registration_v1", expect.objectContaining({ p_challenge_id: id, p_connector_id: id }));
    expect(await repository.admitAccount({ ...auth, id: upperId, action: "invoice:status", ipHash })).toEqual(account);
    expect(rpc).toHaveBeenLastCalledWith("payr_admit_agent_account_v1", expect.objectContaining({ p_id: id }));
    rpc.mockResolvedValueOnce({ data: { credentialId: id, revoked: true }, error: null });
    expect(await repository.revokeAccount({ ...auth, id: upperId })).toEqual({ credentialId: id, revoked: true });
    expect(rpc).toHaveBeenLastCalledWith("payr_revoke_agent_account_v1", expect.objectContaining({ p_id: id }));
  });

  it.each([
    [{ outcome: "denied", code: "UNAUTHORIZED" }, { code: "UNAUTHORIZED", status: 401, retryAfterSeconds: undefined }],
    [{ outcome: "denied", code: "FORBIDDEN" }, { code: "FORBIDDEN", status: 403, retryAfterSeconds: undefined }],
    [{ outcome: "rate_limited", retryAfterSeconds: 1 }, { code: "RATE_LIMITED", status: 429, retryAfterSeconds: 1 }],
    [{ outcome: "rate_limited", retryAfterSeconds: 60 }, { code: "RATE_LIMITED", status: 429, retryAfterSeconds: 60 }],
  ])("translates committed admission failure JSON %j outside the RPC", async (data, error) => {
    const { repository, rpc } = setup(data);
    await expect(repository.admitAccount({ ...auth, action: "invoice:status", ipHash })).rejects.toMatchObject(error);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await rpc.mock.results[0].value).toEqual({ data, error: null });
  });

  it.each([
    { outcome: "denied" }, { outcome: "denied", code: "DATABASE_ERROR" },
    { outcome: "denied", code: "UNAUTHORIZED", workspaceId: otherId },
    { outcome: "denied", code: "FORBIDDEN", retryAfterSeconds: 1 },
    { outcome: "rate_limited" }, { outcome: "rate_limited", retryAfterSeconds: 0 },
    { outcome: "rate_limited", retryAfterSeconds: 61 }, { outcome: "rate_limited", retryAfterSeconds: 1.5 },
    { outcome: "rate_limited", retryAfterSeconds: "1" }, { outcome: "rate_limited", retryAfterSeconds: 1, code: "RATE_LIMITED" },
    { outcome: "allowed" }, { ...account, outcome: "denied", code: "UNAUTHORIZED" },
  ])("rejects malformed or mixed admission failure JSON %j", async (data) => {
    await expect(setup(data).repository.admitAccount({ ...auth, action: "invoice:status", ipHash }))
      .rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", status: 503, retryAfterSeconds: undefined });
  });

  it.each([
    null, {}, [], { ...account, tokenHash: auth.tokenHash }, { ...account, ownerWallet: "not-a-wallet" },
    { ...account, senderSetupRequired: "true" }, { ...account, credential: { ...account.credential, id: otherId } },
    { ...account, credential: { ...account.credential, scopes: ["invoice:status", "invoice:void"] } },
    { ...account, credential: { ...account.credential, scopes: ["sender:read"] } },
    { ...account, credential: { ...account.credential, scopes: ["invoice:status", "invoice:status"] } },
    { ...account, credential: { ...account.credential, expiresAt: "infinity" } },
    { ...account, credential: { ...account.credential, expiresAt: "2026-09-17T00:00:00Z" } },
    { ...account, credential: { ...account.credential, revokedAt: "2026-09-10T00:00:00Z" } },
  ])("fails closed on malformed account DTO %j", async (value) => {
    const { repository } = setup(value);
    await expect(repository.admitAccount({ ...auth, action: "invoice:status", ipHash })).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", status: 503 });
    await expect(repository.completeRegistration(completion)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", status: 503 });
  });

  it("rejects a completion for a different verified wallet and an admission without the requested scope", async () => {
    await expect(setup({ ...account, ownerWallet: `0x${"2".repeat(40)}` }).repository.completeRegistration(completion))
      .rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
    await expect(setup({ ...account, credential: { ...account.credential, scopes: ["invoice:status"] } }).repository
      .admitAccount({ ...auth, action: "sender:read", ipHash })).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  });

  it("validates service, issuance and revocation responses instead of accepting arbitrary successful JSON", async () => {
    for (const value of [null, {}, { issued: false }, { serviceId: "bad\n" }, { credentialId: otherId, revoked: true }]) {
      const { repository } = setup(value);
      await expect(repository.admitService({ id, tokenHash: auth.tokenHash, operation: "get_account", ipHash })).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
      await expect(repository.issueChallenge({ challenge, walletHash: ipHash, ipHash })).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
      await expect(repository.revokeAccount(auth)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
    }
  });

  it("rejects malformed hashes, raw credentials, actor injection and unsupported actions before RPC", async () => {
    const { repository, rpc } = setup();
    for (const change of [{ tokenHash: `pac_${id}.${"A".repeat(43)}` }, { tokenHash: "a".repeat(64) + "\n" },
      { tokenHash: "A".repeat(64) }, { id: "x" }, { serviceId: "bazantic\n" }, { serviceId: "" },
      { action: "invoice:void" }, { action: "payr_admin_provision_gateway_key_v1" }, { ipHash: "127.0.0.1" },
      { ownerWallet: wallet }, { workspaceId: otherId }]) {
      await expect(repository.admitAccount({ ...auth, action: "invoice:status", ipHash, ...change } as Parameters<GatewayRepository["admitAccount"]>[0]))
        .rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects mutable/invalid registration facts and lifetime/scopes injection before RPC", async () => {
    const { repository, rpc } = setup();
    for (const change of [{ scopes: ["invoice:void", "invoice:status"] }, { scopes: ["sender:write"] },
      { scopes: ["invoice:status", "invoice:status"] }, { expiresInDays: 0 }, { expiresInDays: 8 }, { expiresInDays: 1.5 },
      { consumedAt: challenge.issuedAt }, { expiresAt: challenge.issuedAt }, { chainId: 0 },
      { expiresAt: "2026-09-09T00:05:00.001Z" }]) {
      await expect(repository.issueChallenge({ challenge: { ...challenge, ...change } as RegistrationChallenge, walletHash: ipHash, ipHash }))
        .rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    }
    await expect(repository.completeRegistration({ ...completion, scopes: ["invoice:void"] } as typeof completion)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["UNAUTHORIZED", 401], ["FORBIDDEN", 403], ["INVALID_INPUT", 400], ["NONCE_INVALID_OR_USED", 400],
    ["CONNECTOR_CONFLICT", 409], ["GATEWAY_KEY_CONFLICT", 409], ["NOT_FOUND", 404]] as const)("maps sanitized %s errors", async (message, status) => {
    await expect(setup(null, { code: message === "INVALID_INPUT" ? "22023" : "P0001", message, details: "private" })
      .repository.revokeAccount(auth)).rejects.toMatchObject({ code: message, status, message });
  });

  it("exposes only bounded retry metadata", async () => {
    for (const retryAfterSeconds of [1, 60]) {
      await expect(setup(null, { code: "P0001", message: "RATE_LIMITED", details: JSON.stringify({ retryAfterSeconds }) })
        .repository.revokeAccount(auth)).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429, retryAfterSeconds });
    }
    for (const details of [undefined, "private SQL", "{}", '{"retryAfterSeconds":0}', '{"retryAfterSeconds":61}',
      '{"retryAfterSeconds":1.5}', '{"retryAfterSeconds":"2"}', '{"retryAfterSeconds":2,"secret":"private"}']) {
      await expect(setup(null, { code: "P0001", message: "RATE_LIMITED", details }).repository.revokeAccount(auth))
        .rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", status: 503, retryAfterSeconds: undefined });
    }
  });

  it("sanitizes unexpected and thrown database failures", async () => {
    for (const error of [{ code: "42501", message: "UNAUTHORIZED" }, { code: "P0001", message: "private SQL" },
      { code: "P0001", message: "__proto__" }, { message: "FORBIDDEN" }]) {
      await expect(setup(null, error).repository.revokeAccount(auth)).rejects.toMatchObject({ code: "DATABASE_ERROR", status: 503, message: "DATABASE_ERROR" });
    }
    const { repository, rpc } = setup();
    rpc.mockRejectedValue(new Error("private connection string"));
    await expect(repository.revokeAccount(auth)).rejects.toMatchObject({ code: "DATABASE_ERROR", status: 503 });
  });
});
