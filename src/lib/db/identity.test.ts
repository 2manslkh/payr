import { expect, it } from "vitest";
import { CONNECTOR_SCOPES, IdentityError, type AuthNonce, type IdentityRepository } from "../identity/contracts";
import { createIdentityRepository } from "./identity";

it("passes both workspace and owner to private identity reads", async () => {
  const calls: unknown[] = [];
  const repository = createIdentityRepository({
    rpc(name, parameters) {
      calls.push({ name, parameters });
      return Promise.resolve({ data: [], error: null });
    },
  });
  await expect(repository.listClients({ workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` })).resolves.toEqual([]);
  expect(calls).toEqual([{
    name: "payr_list_clients_v1",
    parameters: { p_workspace_id: "00000000-0000-4000-8000-000000000001", p_owner_wallet: `0x${"1".repeat(40)}` },
  }]);
});

const id = "00000000-0000-4000-8000-000000000001";
const owner = `0x${"1".repeat(40)}`;
const identity = { workspaceId: id, ownerWallet: owner };
const scope = { p_workspace_id: id, p_owner_wallet: owner };
const time = "2026-09-06T00:00:00.123456+00:00";
const nonce: AuthNonce = { id, wallet: owner, workspaceId: null, purpose: "payr-login-v1", challenge: "A".repeat(43),
  domain: "payr.example", uri: "https://payr.example", chainId: 5042002, issuedAt: "2026-09-06T00:00:00.123Z",
  expiresAt: "2026-09-06T00:05:00.123Z", consumedAt: null, payoutFrom: null, payoutTo: null, profileRevision: null };
const profile = { id, revision: 1, businessName: null, billingAddress: null, contactName: null, contactEmail: null,
  payoutWallet: owner, invoicePrefix: null, defaultPaymentTermsDays: null };
const saveSender = { expectedRevision: 1, businessName: "Studio", billingAddress: { line1: "1 Road", city: "London", postalCode: "N1", countryCode: "GB" },
  contactName: "Owner", contactEmail: "owner@example.test", invoicePrefix: "PAYR", defaultPaymentTermsDays: 30 };
const saveClient = { id: null, expectedRevision: null, alias: "client", businessName: "Client", billingAddress: saveSender.billingAddress,
  contactName: "Client", contactEmail: "client@example.test" };
const clientProfile = { id, revision: 1, alias: "client", businessName: "Client", billingAddress: saveSender.billingAddress,
  contactName: "Client", contactEmail: "client@example.test", provenance: { businessName: { kind: "user_provided", confirmed: true } } };
const connector = { id, createdAt: time, expiresAt: "2026-10-01T00:00:00.000Z", revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES };
const tokenInput = { id, tokenHash: "a".repeat(64), expiresAt: connector.expiresAt };
const admissionInput = { id, tokenHash: tokenInput.tokenHash, ipHash: "b".repeat(64), action: "invoice:draft" };
const event = { id, tokenId: id, action: "connector.create", outcome: "succeeded", createdAt: time };
const cases: Array<{ name: string; args: Record<string, unknown>; data: unknown; invoke: (repository: IdentityRepository) => Promise<unknown> }> = [
  { name: "payr_issue_auth_nonce_v1", args: { p_nonce: nonce }, data: nonce, invoke: (r) => r.issueNonce(nonce) },
  { name: "payr_find_auth_nonce_v1", args: { p_nonce_id: id }, data: nonce, invoke: (r) => r.findNonce(id) },
  { name: "payr_complete_login_v1", args: { p_nonce_id: id, p_verified_wallet: owner }, data: identity, invoke: (r) => r.completeLogin(id, owner) },
  { name: "payr_apply_payout_change_v1", args: { ...scope, p_nonce_id: id }, data: profile, invoke: (r) => r.applyPayoutChange(identity, id) },
  { name: "payr_get_sender_profile_v1", args: scope, data: profile, invoke: (r) => r.getProfile(identity) },
  { name: "payr_save_sender_profile_v1", args: { ...scope, p_input: saveSender }, data: profile, invoke: (r) => r.saveProfile(identity, saveSender) },
  { name: "payr_list_clients_v1", args: scope, data: [clientProfile], invoke: (r) => r.listClients(identity) },
  { name: "payr_save_client_v1", args: { ...scope, p_input: saveClient }, data: clientProfile, invoke: (r) => r.saveClient(identity, saveClient) },
  { name: "payr_list_connectors_v1", args: scope, data: [connector], invoke: (r) => r.listConnectors(identity) },
  { name: "payr_create_connector_v1", args: { ...scope, p_id: id, p_token_hash: tokenInput.tokenHash, p_expires_at: connector.expiresAt }, data: connector,
    invoke: (r) => r.createConnector(identity, tokenInput) },
  { name: "payr_revoke_connector_v1", args: { ...scope, p_id: id }, data: connector, invoke: (r) => r.revokeConnector(identity, id) },
  { name: "payr_find_connector_v1", args: { p_id: id }, data: { ...connector, workspaceId: id, tokenHash: tokenInput.tokenHash }, invoke: (r) => r.findConnector(id) },
  { name: "payr_admit_connector_v1", args: { p_id: id, p_token_hash: tokenInput.tokenHash, p_ip_hash: admissionInput.ipHash, p_action: admissionInput.action },
    data: { outcome: "allowed", workspaceId: id, tokenId: id }, invoke: (r) => r.admitConnector(admissionInput) },
  { name: "payr_list_activity_v1", args: scope, data: [event], invoke: (r) => r.listActivity(identity) },
];

it.each(cases)("maps the exact frozen named arguments for $name and retains timestamp precision", async ({ name, args, data, invoke }) => {
  const calls: unknown[] = [];
  const repository = createIdentityRepository({ rpc(actualName, parameters) {
    calls.push([actualName, parameters]); return Promise.resolve({ data, error: null });
  } });
  expect(await invoke(repository)).toEqual(data);
  expect(calls).toEqual([[name, args]]);
});

it.each(cases)("runtime-validates $name instead of trusting a cast", async ({ data, invoke }) => {
  const secret = "secret-token-or-provider-url";
  const polluted = Array.isArray(data) ? [{ ...data[0], token: secret }] : { ...data as object, token: secret };
  for (const invalid of [undefined, "bad", 1, {}, polluted]) {
    const repository = createIdentityRepository({ rpc: () => Promise.resolve({ data: invalid, error: null }) });
    await expect(invoke(repository)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", status: 500 });
    await expect(invoke(repository)).rejects.not.toThrow(secret);
  }
});

it("supports null lookups and every admission variant without accepting malformed states", async () => {
  const repository = createIdentityRepository({ rpc: () => Promise.resolve({ data: null, error: null }) });
  expect(await repository.findNonce(id)).toBeNull();
  expect(await repository.findConnector(id)).toBeNull();
  for (const data of [{ outcome: "denied" }, { outcome: "rate_limited", retryAfterSeconds: 60 }]) {
    expect(await createIdentityRepository({ rpc: () => Promise.resolve({ data, error: null }) }).admitConnector(admissionInput)).toEqual(data);
  }
  for (const data of [{ outcome: "allowed" }, { outcome: "rate_limited", retryAfterSeconds: 0 },
    { outcome: "rate_limited", retryAfterSeconds: 61 }, { outcome: "denied", workspaceId: id }]) {
    await expect(createIdentityRepository({ rpc: () => Promise.resolve({ data, error: null }) }).admitConnector(admissionInput))
      .rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  }
});

it.each([
  ["NOT_FOUND", 404], ["REVISION_CONFLICT", 409], ["NONCE_INVALID_OR_USED", 400], ["INVALID_INPUT", 400],
  ["CLIENT_ALIAS_CONFLICT", 409], ["CONNECTOR_CONFLICT", 409],
])("maps sanitized %s errors and status", async (code, status) => {
  const repository = createIdentityRepository({ rpc: () => Promise.resolve({ data: null, error: { code: "P0001", message: String(code) } }) });
  await expect(repository.getProfile(identity)).rejects.toBeInstanceOf(IdentityError);
  await expect(repository.getProfile(identity)).rejects.toMatchObject({ code, status, message: code });
});

it("never propagates transport, constraint details or error-marker substrings", async () => {
  for (const message of ["secret-provider-url", "NOT_FOUND: secret", "toString", "__proto__"]) {
    const repository = createIdentityRepository({ rpc: () => Promise.resolve({ data: null, error: { code: "P0001", message } }) });
    await expect(repository.getProfile(identity)).rejects.toMatchObject({ code: "DATABASE_ERROR", status: 500, message: "DATABASE_ERROR" });
  }
  const repository = createIdentityRepository({ rpc: () => { throw new IdentityError("secret", 401); } });
  await expect(repository.getProfile(identity)).rejects.toMatchObject({ code: "DATABASE_ERROR", status: 500 });
});

it("rejects unsafe integer facts, nested shapes, unknown provenance and widened scopes", async () => {
  for (const data of [{ ...nonce, chainId: Number.MAX_SAFE_INTEGER + 1 }, { ...nonce, chainId: "5042002" },
    { ...nonce, profileRevision: 1 }, { ...nonce, issuedAt: "yesterday" }]) {
    await expect(createIdentityRepository({ rpc: () => Promise.resolve({ data, error: null }) }).findNonce(id)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  }
  for (const data of [{ ...profile, revision: 1.5 }, { ...profile, billingAddress: {} }, { ...profile, payoutWallet: null }]) {
    await expect(createIdentityRepository({ rpc: () => Promise.resolve({ data, error: null }) }).getProfile(identity)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  }
  for (const data of [[{ ...connector, scopes: [...CONNECTOR_SCOPES, "profile:save"] }], [{ ...connector, createdAt: 123 }]]) {
    await expect(createIdentityRepository({ rpc: () => Promise.resolve({ data, error: null }) }).listConnectors(identity)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  }
  await expect(createIdentityRepository({ rpc: () => Promise.resolve({ data: [{ ...clientProfile, provenance: { secret: { kind: "inferred", confirmed: false } } }], error: null }) })
    .listClients(identity)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
});
