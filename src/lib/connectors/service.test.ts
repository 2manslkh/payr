// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createConnectorService } from "./service";
import { createConnectorAuthenticator } from "./auth";
import { CONNECTOR_SCOPES, type IdentityRepository } from "../identity/contracts";

const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` };
const now = new Date("2026-09-05T00:00:00.000Z");

function setup() {
  const createConnector = vi.fn<IdentityRepository["createConnector"]>(async (_identity, input) => ({
    id: input.id, createdAt: "2026-09-05T00:00:00.000Z", expiresAt: input.expiresAt,
    revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES,
    tokenHash: input.tokenHash, token: "must-not-leak", endpointUrl: "must-not-leak",
  }));
  const repository = { createConnector } as unknown as IdentityRepository;
  const config = {
    appOrigin: "https://payrlink.xyz", chainId: 5042002,
    sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8),
  };
  return { createConnector, repository, config, service: createConnectorService(repository, config, () => now) };
}

afterEach(() => vi.useRealTimers());

it("returns a connector once while persisting only its keyed hash and metadata", async () => {
  const { service, createConnector, config } = setup();
  const result = await service.create(identity, 7);
  expect(result.endpointUrl).toBe(`https://payrlink.xyz/api/mcp/${result.token}`);
  expect(result.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/);
  const [id, secret] = result.token.split(".");
  expect(Buffer.from(secret, "base64url").byteLength).toBe(32);
  expect(Buffer.from(secret, "base64url").toString("base64url")).toBe(secret);
  const tokenHash = createHmac("sha256", config.connectorPepper).update(`payr:connector:v1:${result.token}`).digest("hex");
  expect(createConnector).toHaveBeenCalledExactlyOnceWith(identity, { id, tokenHash, expiresAt: "2026-09-12T00:00:00.000Z" });
  expect(JSON.stringify(createConnector.mock.calls)).not.toContain(result.token);
  expect(JSON.stringify(createConnector.mock.calls)).not.toContain(result.endpointUrl);
  expect(result.connector).toEqual({ id, createdAt: now.toISOString(), expiresAt: "2026-09-12T00:00:00.000Z", revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES });
});

it.each([[1, "2026-09-06T00:00:00.000Z"], [30, "2026-10-05T00:00:00.000Z"]] as const)("accepts the %i-day expiry boundary", async (days, expiresAt) => {
  const { service } = setup();
  expect((await service.create(identity, days)).connector.expiresAt).toBe(expiresAt);
});

it.each([0, -1, 31, 1.5, NaN, Infinity])("rejects invalid expiry before persistence (%#)", async (days) => {
  const { service, createConnector } = setup();
  await expect(service.create(identity, days)).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
  expect(createConnector).not.toHaveBeenCalled();
});

it("requires at least 32 pepper bytes", () => {
  const { repository, config } = setup();
  expect(() => createConnectorService(repository, { ...config, connectorPepper: new Uint8Array(31) })).toThrow("CONNECTOR_CONFIG_INVALID");
  expect(() => createConnectorService(repository, { ...config, connectorPepper: new Uint8Array(64) })).not.toThrow();
});

it("generates independent secrets and IDs which authenticate through real crypto with a shared global IP bucket", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const { service, createConnector, config } = setup();
  const results = await Promise.all([service.create(identity, 1), service.create({ ...identity, workspaceId: "00000000-0000-4000-8000-000000000002" }, 1)]);
  expect(results[0].token.split(".")[0]).not.toBe(results[1].token.split(".")[0]);
  expect(results[0].token.split(".")[1]).not.toBe(results[1].token.split(".")[1]);
  const records = createConnector.mock.calls.map(([scope, input]) => ({
    ...input, workspaceId: scope.workspaceId, createdAt: now.toISOString(), revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES,
  }));
  const findConnector = vi.fn<IdentityRepository["findConnector"]>(async (id) => records.find((record) => record.id === id) ?? null);
  const admitConnector = vi.fn<IdentityRepository["admitConnector"]>(async ({ id }) => {
    const record = records.find((candidate) => candidate.id === id)!;
    return Date.parse(record.expiresAt) > Date.now()
      ? { outcome: "allowed", tokenId: id, workspaceId: record.workspaceId }
      : { outcome: "denied" };
  });
  const auth = createConnectorAuthenticator({ findConnector, admitConnector } as unknown as IdentityRepository, config);
  for (const result of results) {
    await expect(auth.authenticate({ token: result.token, ip: "::ffff:192.0.2.128", action: "invoice:draft" })).resolves.toMatchObject({ tokenId: result.connector.id });
  }
  expect(admitConnector.mock.calls[0]?.[0].ipHash).toBe(admitConnector.mock.calls[1]?.[0].ipHash);
  const wrongPepper = createConnectorAuthenticator({ findConnector, admitConnector } as unknown as IdentityRepository, { ...config, connectorPepper: new Uint8Array(32).fill(9) });
  await expect(wrongPepper.authenticate({ token: results[0].token, ip: "192.0.2.128", action: "invoice:draft" })).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });
  vi.setSystemTime(new Date("2026-09-06T00:00:00.000Z"));
  await expect(auth.authenticate({ token: results[0].token, ip: "192.0.2.128", action: "invoice:draft" })).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });
  expect(admitConnector).toHaveBeenCalledTimes(3);
});

it("does not persist a credential if its endpoint cannot be constructed", async () => {
  const { repository, createConnector, config } = setup();
  const service = createConnectorService(repository, { ...config, appOrigin: "not-an-origin" }, () => now);
  await expect(service.create(identity, 1)).rejects.toThrow();
  expect(createConnector).not.toHaveBeenCalled();
});
