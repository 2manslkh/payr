// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { IdentityError, type IdentityConfig, type IdentityRepository } from "../identity/contracts";
import { createConnectorAuthenticator } from "../connectors/auth";
import type { DraftRepository } from "../invoices/contracts";
import type { McpServices } from "../mcp/server";
import { ACCOUNT_SCOPES, operationNames, type AgentAccount, type AgentOperation, type GatewayRepository, type RegistrationChallenge } from "./contracts";
import { accountCredentialHash, agentCredentialId, gatewayHash, mintAgentCredential, serviceCredentialHash } from "./credentials";
import { createAgentApi, registrationMessage } from "./service";
import { handleAgentRequest } from "./http";

const wallet = privateKeyToAccount(`0x${"1".repeat(64)}`);
const otherWallet = privateKeyToAccount(`0x${"2".repeat(64)}`);
const now = new Date("2026-09-09T00:00:00.000Z");
const config: IdentityConfig = { appOrigin: "https://payrlink.xyz", chainId: 5042002,
  sessionKey: new Uint8Array(32).fill(1), connectorPepper: new Uint8Array(32).fill(2) };
const ip = "192.0.2.1";
const serviceId = "bazantic";
const repository: GatewayRepository = { admitService: vi.fn(), issueChallenge: vi.fn(), findChallenge: vi.fn(),
  completeRegistration: vi.fn(), admitAccount: vi.fn(), revokeAccount: vi.fn() };
const services = { createDraft: vi.fn(), publish: vi.fn(), status: vi.fn(), getSenderProfile: vi.fn(), saveSenderProfile: vi.fn() } satisfies Omit<McpServices, "void">;
const drafts = { listInvoices: vi.fn(), getInvoiceDetail: vi.fn() } satisfies Pick<DraftRepository, "listInvoices" | "getInvoiceDetail">;
const api = createAgentApi({ config, repository, services, drafts }, () => now);
let challenge: RegistrationChallenge;
const key = mintAgentCredential("account"), serviceKey = mintAgentCredential("service");
const account: AgentAccount = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: wallet.address.toLowerCase(), senderSetupRequired: true,
  credential: { id: key.id, createdAt: now.toISOString(), expiresAt: "2026-09-10T00:00:00.000Z", revokedAt: null, lastUsedAt: null, scopes: ACCOUNT_SCOPES } };
const context = { serviceId, account, accountCredential: key.token };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repository.admitService).mockResolvedValue({ serviceId });
  vi.mocked(repository.admitAccount).mockResolvedValue(account);
  vi.mocked(repository.issueChallenge).mockImplementation(async (input) => { challenge = structuredClone(input.challenge); });
  vi.mocked(repository.findChallenge).mockImplementation(async () => structuredClone(challenge));
  vi.mocked(repository.completeRegistration).mockImplementation(async (input) => {
    if (challenge.consumedAt) throw new IdentityError("NONCE_INVALID_OR_USED", 400);
    challenge.consumedAt = now.toISOString();
    return { ...account, credential: { ...account.credential, id: input.connectorId, scopes: challenge.scopes } };
  });
});

async function issue(input: object = { wallet: wallet.address }) {
  return await api.execute("create_account_challenge", input, { serviceId }, ip) as { challengeId: string; message: string; expiresAt: string };
}

it("creates a bounded, domain/service/purpose/scopes/lifetime-bound registration challenge", async () => {
  const result = await issue({ wallet: wallet.address, scopes: ["invoice:status"], expiresInDays: 2 });
  expect(result.challengeId).toBe(challenge.id);
  expect(Date.parse(result.expiresAt) - now.getTime()).toBe(300_000);
  expect(challenge).toMatchObject({ domain: "payrlink.xyz", uri: config.appOrigin, serviceId, wallet: wallet.address.toLowerCase(), scopes: ["invoice:status"], expiresInDays: 2 });
  for (const value of [challenge.id, challenge.wallet, challenge.challenge, "payr-agent-registration-v1", "invoice:status", "Credential Lifetime Days: 2", "5042002", serviceId]) expect(result.message).toContain(value);
  expect(registrationMessage(challenge)).toBe(result.message);
  const admission = vi.mocked(repository.issueChallenge).mock.calls[0][0];
  expect(admission.ipHash).toBe(gatewayHash(config.connectorPepper, "ip", ip));
  expect(admission.walletHash).toBe(gatewayHash(config.connectorPepper, "wallet", challenge.wallet));
  expect(repository.completeRegistration).not.toHaveBeenCalled();
});

it.each([{ scopes: ["invoice:void", "invoice:status"] }, { scopes: ["invoice:publish"] }, { scopes: ["invoice:status", "invoice:status"] },
  { expiresInDays: 0 }, { expiresInDays: 8 }, { payoutWallet: otherWallet.address }, { accountId: account.workspaceId }])(
  "rejects privilege escalation and unsupported registration input (%#)", async (extra) => {
    await expect(issue({ wallet: wallet.address, ...extra })).rejects.toThrow();
    expect(repository.issueChallenge).not.toHaveBeenCalled();
  },
);

it("verifies a real local wallet signature and returns the prefixed secret only after atomic completion", async () => {
  const issued = await issue();
  const signature = await wallet.signMessage({ message: issued.message });
  const result = await api.execute("register_account", { challengeId: issued.challengeId, signature }, { serviceId }, ip) as { account: AgentAccount; accountCredential: string };
  expect(result.account.ownerWallet).toBe(wallet.address.toLowerCase());
  expect(result.account.credential.scopes).toEqual(ACCOUNT_SCOPES);
  const id = agentCredentialId(result.accountCredential, "account");
  expect(result.account.credential.id).toBe(id);
  expect(repository.completeRegistration).toHaveBeenCalledExactlyOnceWith({ challengeId: issued.challengeId, serviceId,
    verifiedWallet: wallet.address.toLowerCase(), connectorId: id,
    tokenHash: accountCredentialHash(config.connectorPepper, result.accountCredential) });
  expect(JSON.stringify(vi.mocked(repository.completeRegistration).mock.calls)).not.toContain(result.accountCredential);
  await expect(api.execute("register_account", { challengeId: issued.challengeId, signature }, { serviceId }, ip)).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
  expect(repository.completeRegistration).toHaveBeenCalledOnce();
});

it("rejects a different wallet signature without minting a credential", async () => {
  const issued = await issue();
  const signature = await otherWallet.signMessage({ message: issued.message });
  await expect(api.execute("register_account", { challengeId: issued.challengeId, signature }, { serviceId }, ip)).rejects.toMatchObject({ code: "SIGNATURE_INVALID" });
  expect(repository.completeRegistration).not.toHaveBeenCalled();
});

it("accepts an uppercase challenge ID without changing the exact signed message", async () => {
  const issued = await issue();
  const signature = await wallet.signMessage({ message: issued.message });
  await api.execute("register_account", { challengeId: issued.challengeId.toUpperCase(), signature }, { serviceId }, ip);
  expect(repository.findChallenge).toHaveBeenCalledExactlyOnceWith({ id: issued.challengeId, serviceId });
  expect(repository.completeRegistration).toHaveBeenCalledOnce();
});

it.each([
  { serviceId: "other" }, { uri: "https://hostile.test" }, { domain: "hostile.test" }, { chainId: 1 },
  { consumedAt: now.toISOString() }, { expiresAt: now.toISOString() }, { issuedAt: "2026-09-09T00:01:00.000Z" },
  { expiresAt: "2026-09-09T01:00:00.000Z" }, { scopes: ["invoice:status", "invoice:void"] },
])("rejects invalid/replayed or deployment-mismatched stored challenge (%#)", async (change) => {
  const issued = await issue();
  const signature = await wallet.signMessage({ message: issued.message });
  Object.assign(challenge, change);
  await expect(api.execute("register_account", { challengeId: issued.challengeId, signature }, { serviceId }, ip)).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
  expect(repository.completeRegistration).not.toHaveBeenCalled();
});

it.each([{ expiresInDays: 2 }, { scopes: ["invoice:status"] }, { challenge: "A".repeat(43) }])(
  "a changed signed privilege or nonce invalidates the original signature (%#)", async (change) => {
    const issued = await issue();
    const signature = await wallet.signMessage({ message: issued.message });
    Object.assign(challenge, change);
    await expect(api.execute("register_account", { challengeId: issued.challengeId, signature }, { serviceId }, ip)).rejects.toMatchObject({ code: "SIGNATURE_INVALID" });
    expect(repository.completeRegistration).not.toHaveBeenCalled();
  },
);

it("does not return a raw credential when atomic registration fails", async () => {
  const issued = await issue();
  vi.mocked(repository.completeRegistration).mockRejectedValue(new IdentityError("NONCE_INVALID_OR_USED", 400));
  await expect(api.execute("register_account", { challengeId: issued.challengeId, signature: await wallet.signMessage({ message: issued.message }) }, { serviceId }, ip))
    .rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
});

it("authenticates gateway and account with separated hash domains and rejects legacy credentials", async () => {
  await api.authenticateService(serviceKey.token, "get_account", ip);
  expect(repository.admitService).toHaveBeenCalledExactlyOnceWith({ id: serviceKey.id, operation: "get_account", tokenHash: serviceCredentialHash(serviceKey.token), ipHash: gatewayHash(config.connectorPepper, "ip", ip) });
  await api.authenticateAccount(key.token, serviceId, "invoice:status", ip);
  expect(repository.admitAccount).toHaveBeenCalledExactlyOnceWith({ id: key.id, serviceId, action: "invoice:status", tokenHash: accountCredentialHash(config.connectorPepper, key.token), ipHash: gatewayHash(config.connectorPepper, "ip", ip) });
  for (const invalid of [key.token.slice(4), serviceKey.token, key.token + "\n", key.token.toUpperCase()]) {
    expect(() => api.authenticateAccount(invalid, serviceId, "invoice:status", ip)).toThrow("AUTH_REQUIRED");
  }
  expect(() => api.authenticateService(key.token, "get_account", ip)).toThrow("AUTH_REQUIRED");
  expect(() => api.authenticateService(serviceKey.token, "get_account", "")).toThrow("AUTH_REQUIRED");
  expect(serviceCredentialHash(serviceKey.token)).not.toBe(accountCredentialHash(config.connectorPepper, serviceKey.token));
});

it("keeps the full-token service SHA-256 stable across account peppers and distinct from account HMAC", async () => {
  const expected = createHash("sha256").update(`payr:agent-gateway:service:v1:${serviceKey.token}`).digest("hex");
  expect(serviceCredentialHash(serviceKey.token)).toBe(expected);
  const peppers = [config.connectorPepper, new Uint8Array(32).fill(3)];
  for (const connectorPepper of peppers) {
    const runtime = createAgentApi({ config: { ...config, connectorPepper }, repository, services, drafts }, () => now);
    await runtime.authenticateService(serviceKey.token, "get_account", ip);
    expect(repository.admitService).toHaveBeenLastCalledWith({ id: serviceKey.id, operation: "get_account",
      tokenHash: expected, ipHash: gatewayHash(connectorPepper, "ip", ip) });
    expect(accountCredentialHash(connectorPepper, serviceKey.token)).not.toBe(expected);
  }
  expect(accountCredentialHash(peppers[0], key.token)).not.toBe(accountCredentialHash(peppers[1], key.token));
});

it("new account secrets cannot be used directly or stripped into a working legacy MCP credential", async () => {
  const findConnector = vi.fn().mockResolvedValue({ ...account.credential, workspaceId: account.workspaceId,
    tokenHash: accountCredentialHash(config.connectorPepper, key.token) });
  const admitConnector = vi.fn();
  const legacy = createConnectorAuthenticator({ findConnector, admitConnector } as unknown as IdentityRepository, config);
  for (const token of [key.token, key.token.slice(4)]) {
    await expect(legacy.authenticate({ token, action: "invoice:status", ip })).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });
  }
  expect(admitConnector).not.toHaveBeenCalled();
});

it.each([
  ["get_sender_profile", {}, "getSenderProfile"],
  ["save_sender_profile", { approval: true }, "saveSenderProfile"],
  ["create_invoice_draft", { idempotencyKey: "draft-key" }, "createDraft"],
  ["publish_invoice", { draftId: account.workspaceId, expectedVersion: 1, approval: true, deliveryApproval: true, idempotencyKey: "publish-key" }, "publish"],
] as const)("%s calls only the canonical service with a connector actor", async (operation, input, method) => {
  await api.execute(operation, input, context, ip);
  expect(services[method]).toHaveBeenCalledExactlyOnceWith({ workspaceId: account.workspaceId, ownerWallet: null, connectorId: key.id }, input);
  expect(JSON.stringify(services[method].mock.calls)).not.toContain(key.token);
});

it("preserves the canonical draft review link in gateway results", async () => {
  const result = { code: "DRAFT_READY", draftId: account.workspaceId,
    draftUrl: `https://payr.example/app/invoices/${account.workspaceId}`, version: 1 };
  services.createDraft.mockResolvedValue(result);
  expect(await api.execute("create_invoice_draft", { idempotencyKey: "draft-link" }, context, ip)).toEqual(result);
});

it("lists and reads only in the authenticated workspace with bounded pagination", async () => {
  const actor = { workspaceId: account.workspaceId, ownerWallet: null, connectorId: key.id };
  await api.execute("list_invoices", { search: " client ", state: "draft", offset: 50 }, context, ip);
  expect(drafts.listInvoices).toHaveBeenCalledExactlyOnceWith(actor, { search: "client", commercialState: "draft", offset: 50, limit: 50 });
  await expect(api.execute("list_invoices", { offset: 10001 }, context, ip)).rejects.toThrow();
  drafts.getInvoiceDetail.mockResolvedValue(null);
  await expect(api.execute("get_invoice", { invoiceId: account.workspaceId }, context, ip)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(drafts.getInvoiceDetail).toHaveBeenCalledExactlyOnceWith(actor, account.workspaceId);
  await api.execute("get_invoice_status", { invoiceId: account.workspaceId }, context, ip);
  expect(services.status).toHaveBeenCalledExactlyOnceWith(actor, account.workspaceId);
});

it("account inspection never returns the raw credential and revocation targets only the current key", async () => {
  const result = await api.execute("get_account", {}, context, ip);
  expect(result).toEqual(account);
  expect(JSON.stringify(result)).not.toContain(key.token);
  await expect(api.execute("revoke_current_credential", { approval: false }, context, ip)).rejects.toThrow();
  await expect(api.execute("revoke_current_credential", { approval: true, credentialId: serviceKey.id }, context, ip)).rejects.toThrow();
  await api.execute("revoke_current_credential", { approval: true }, context, ip);
  expect(repository.revokeAccount).toHaveBeenCalledExactlyOnceWith({ id: key.id, serviceId, tokenHash: accountCredentialHash(config.connectorPepper, key.token) });
});

it.each(operationNames.filter((op) => !["register_account", "create_account_challenge"].includes(op)))(
  "%s cannot execute with only a service identity", async (operation) => {
    await expect(api.execute(operation, {}, { serviceId }, ip)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  },
);

it.each(["publish_invoice", "save_sender_profile", "create_invoice_draft"] as const)("%s rechecks the context scope", async (operation) => {
  await expect(api.execute(operation, {}, { ...context, account: { ...account, credential: { ...account.credential, scopes: ["invoice:status"] } } }, ip))
    .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
});

it("composes real HTTP and wallet verification for both signup steps without an existing user key", async () => {
  const post = (operation: AgentOperation, input: object, accountCredential?: string) => handleAgentRequest(new Request(`${config.appOrigin}/api/v1/${operation}`, {
    method: "POST", headers: { "X-Payr-Service-Key": serviceKey.token, "Content-Type": "application/json" },
    body: JSON.stringify({ input, ...(accountCredential ? { accountCredential } : {}) }),
  }), operation, ip, api);
  const response = await post("create_account_challenge", { wallet: wallet.address });
  expect(response.status).toBe(200);
  const issued = await response.json();
  const registration = await post("register_account", { challengeId: issued.challengeId, signature: await wallet.signMessage({ message: issued.message }) });
  expect(registration.status).toBe(200);
  const result = await registration.json();
  expect(result.accountCredential).toMatch(/^pac_/);
  vi.mocked(repository.admitAccount).mockResolvedValue(result.account);
  const read = await post("get_account", {}, result.accountCredential);
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual(result.account);
  expect(repository.admitService).toHaveBeenCalledTimes(3);
});
