// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { CONNECTOR_SCOPES, IdentityError, type ConnectorRecord, type IdentityRepository } from "../identity/contracts";
import { createConnectorAuthenticator } from "./auth";

const id = "00000000-0000-4000-8000-00000000000a";
const token = `${id}.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`;
const tokenHash = "6df944232b1d5fc3471f178f15b10dfe54f3dadeb43d3b1a0fbafa8025133259";
const ipHash = "5add4d24fff9fb047129f6f1fc524554bba7ceb0687a818bb955f968af45a46e";
const config = {
  appOrigin: "https://payrlink.xyz", chainId: 5042002,
  sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8),
};

function setup(overrides: Partial<ConnectorRecord> = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T00:00:00.000Z"));
  const record: ConnectorRecord = {
    id, tokenHash, workspaceId: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-09-04T00:00:00.000Z", expiresAt: "2026-09-06T00:00:00.000Z",
    revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES, ...overrides,
  };
  const findConnector = vi.fn<IdentityRepository["findConnector"]>().mockResolvedValue(record);
  const admitConnector = vi.fn<IdentityRepository["admitConnector"]>().mockResolvedValue({
    outcome: "allowed", workspaceId: record.workspaceId, tokenId: id,
  });
  const repository = { findConnector, admitConnector } as unknown as IdentityRepository;
  return { record, repository, findConnector, admitConnector, auth: createConnectorAuthenticator(repository, config) };
}

afterEach(() => vi.useRealTimers());

it("verifies the F2 credential and admits only keyed hashes, id, and a fixed action", async () => {
  const { auth, findConnector, admitConnector, record } = setup();
  await expect(auth.authenticate({ token, ip: "192.0.2.128", action: "invoice:draft" })).resolves.toEqual({
    workspaceId: record.workspaceId, tokenId: id,
  });
  expect(findConnector).toHaveBeenCalledExactlyOnceWith(id);
  expect(admitConnector).toHaveBeenCalledExactlyOnceWith({ id, tokenHash, ipHash, action: "invoice:draft" });
  expect(JSON.stringify(admitConnector.mock.calls)).not.toContain(token);
  expect(JSON.stringify(admitConnector.mock.calls)).not.toContain("192.0.2.128");
});

it.each([
  "192.0.2.128", "::ffff:192.0.2.128", "::ffff:c000:0280", "0:0:0:0:0:FFFF:C000:280",
])("shares an IP bucket for the equivalent address %s", async (ip) => {
  const { auth, admitConnector } = setup();
  await auth.authenticate({ token, ip, action: "invoice:status" });
  expect(admitConnector.mock.calls[0]?.[0].ipHash).toBe(ipHash);
});

it.each(["2001:db8::1", "2001:0DB8:0000:0000:0000:0000:0000:0001"])("canonicalizes IPv6 %s", async (ip) => {
  const { auth, admitConnector } = setup();
  await auth.authenticate({ token, ip, action: "invoice:status" });
  expect(admitConnector.mock.calls[0]?.[0].ipHash).toBe("ca9ace10f6940804fa6b4d3ac93a8065ce4f0078c28f11dadf5e7ec083c96631");
});

it.each([
  "", "garbage", ` ${token}`, `${token}\n`, `${token}=`, `${token}.extra`,
  token.replace(id, id.toUpperCase()), token.replace("4000", "0000"), token.replace("8000", "7000"),
  token.slice(0, -1), `${token.slice(0, -1)}9`, token.replace(".", "%2E"),
  `${id}.${"+".repeat(43)}`, `${id}.${"/".repeat(43)}`,
])("rejects a malformed credential before lookup (%#)", async (malformed) => {
  const { auth, findConnector, admitConnector } = setup();
  await expect(auth.authenticate({ token: malformed, ip: "192.0.2.128", action: "invoice:draft" })).rejects.toMatchObject({
    code: "CONNECTOR_INVALID", status: 401, message: "CONNECTOR_INVALID",
  });
  expect(findConnector).not.toHaveBeenCalled();
  expect(admitConnector).not.toHaveBeenCalled();
});

it.each(["", "192.000.2.128", "192.0.2.128:80", "192.0.2.128, 10.0.0.1", " 192.0.2.128", "[::1]", "fe80::1%eth0", "999.0.0.1", "not-an-ip"])("rejects an ambiguous or invalid IP (%#)", async (ip) => {
  const { auth, findConnector, admitConnector } = setup();
  await expect(auth.authenticate({ token, ip, action: "invoice:draft" })).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });
  expect(findConnector).not.toHaveBeenCalled();
  expect(admitConnector).not.toHaveBeenCalled();
});

it("rejects an unknown credential without admission", async () => {
  const { auth, findConnector, admitConnector } = setup();
  findConnector.mockResolvedValue(null);
  await expect(auth.authenticate({ token, ip: "192.0.2.128", action: "invoice:draft" })).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });
  expect(admitConnector).not.toHaveBeenCalled();
});

it.each([
  { tokenHash: "0".repeat(64) }, { tokenHash: tokenHash.toUpperCase() }, { tokenHash: "abc" },
  { tokenHash: `${tokenHash}\n` },
  // Same pepper and credential with the IP label must not verify as a credential.
  { tokenHash: "d935e2abb38f0cd021d34f614dbd8a318046491c175d69a604e8b939ba1531c5" },
  { expiresAt: "invalid" }, { id: "00000000-0000-4000-8000-000000000002" },
])("rejects a nonmatching or malformed stored credential (%#)", async (overrides) => {
  const { auth, admitConnector } = setup(overrides);
  await expect(auth.authenticate({ token, ip: "192.0.2.128", action: "invoice:draft" })).rejects.toMatchObject({ code: "CONNECTOR_INVALID", status: 401 });
  expect(admitConnector).not.toHaveBeenCalled();
});

it.each([
  { revokedAt: "2026-09-04T12:00:00.000Z" },
  { expiresAt: "2026-09-05T00:00:00.000Z" },
  { expiresAt: "2026-09-04T00:00:00.000Z" },
])("delegates valid but revoked/expired credentials to atomic denial and audit (%#)", async (overrides) => {
  const { auth, admitConnector } = setup(overrides);
  admitConnector.mockResolvedValue({ outcome: "denied" });
  await expect(auth.authenticate({ token, ip: "192.0.2.128", action: "invoice:draft" })).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });
  expect(admitConnector).toHaveBeenCalledOnce();
});

it.each(["profile:save", "payout:change", "connector:create", "invoice:draft\n", token])("never admits management or unbounded actions (%#)", async (action) => {
  const { auth, findConnector, admitConnector } = setup();
  await expect(auth.authenticate({ token, ip: "192.0.2.128", action })).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });
  expect(findConnector).not.toHaveBeenCalled();
  expect(admitConnector).not.toHaveBeenCalled();
});

it("uses database admission to reject revocation or expiry racing with lookup", async () => {
  const { auth, admitConnector } = setup();
  admitConnector.mockResolvedValue({ outcome: "denied" });
  await expect(auth.authenticate({ token, ip: "192.0.2.128", action: "invoice:void" })).rejects.toMatchObject({ code: "CONNECTOR_INVALID", status: 401 });
  expect(admitConnector).toHaveBeenCalledOnce();
});

it("returns a sanitized IdentityError with database retry timing for a rate limit", async () => {
  const { auth, admitConnector } = setup();
  admitConnector.mockResolvedValue({ outcome: "rate_limited", retryAfterSeconds: 37 });
  const result = auth.authenticate({ token, ip: "192.0.2.128", action: "invoice:publish" });
  await expect(result).rejects.toBeInstanceOf(IdentityError);
  await expect(result).rejects.toMatchObject({ code: "RATE_LIMITED", message: "RATE_LIMITED", status: 429, retryAfterSeconds: 37 });
});

it.each([0, -1, 61, 1.5, NaN])("fails closed for invalid retry timing (%#)", async (retryAfterSeconds) => {
  const { auth, admitConnector } = setup();
  admitConnector.mockResolvedValue({ outcome: "rate_limited", retryAfterSeconds });
  await expect(auth.authenticate({ token, ip: "192.0.2.128", action: "invoice:publish" })).rejects.toMatchObject({ code: "CONNECTOR_UNAVAILABLE", status: 503 });
});

it.each(["findConnector", "admitConnector"] as const)("does not expose provider failures from %s", async (method) => {
  const fixture = setup();
  fixture[method].mockRejectedValue(new Error(`provider: ${token} 192.0.2.128`));
  await expect(fixture.auth.authenticate({ token, ip: "192.0.2.128", action: "invoice:draft" })).rejects.toMatchObject({ code: "CONNECTOR_UNAVAILABLE", message: "CONNECTOR_UNAVAILABLE" });
});

it("rejects peppers shorter than 32 bytes", () => {
  const { repository } = setup();
  expect(() => createConnectorAuthenticator(repository, { ...config, connectorPepper: new Uint8Array(31) })).toThrow("CONNECTOR_CONFIG_INVALID");
});
