// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createConnectorAuthenticator } from "../../../lib/connectors/auth";
import { CONNECTOR_SCOPES, type IdentityRepository } from "../../../lib/identity/contracts";
import { POST, GET, HEAD, DELETE, OPTIONS, PUT, PATCH } from "./route";

const { runtime } = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../../../lib/mcp/runtime", () => ({ createMcpRuntime: runtime }));
const tokenId = "00000000-0000-4000-8000-00000000000a";
const token = `${tokenId}.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`;
const workspaceId = "00000000-0000-4000-8000-000000000001";
const record = { id: tokenId, workspaceId, tokenHash: "6df944232b1d5fc3471f178f15b10dfe54f3dadeb43d3b1a0fbafa8025133259",
  createdAt: "2026-09-04T00:00:00Z", expiresAt: "2030-01-01T00:00:00Z", revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES };
const repository = { findConnector: vi.fn(), admitConnector: vi.fn() };
const services = { createDraft: vi.fn(), publish: vi.fn(), status: vi.fn(), void: vi.fn(), getSenderProfile: vi.fn(), saveSenderProfile: vi.fn() };

beforeEach(() => {
  vi.stubEnv("VERCEL", "1");
  vi.clearAllMocks();
  repository.findConnector.mockResolvedValue(record);
  repository.admitConnector.mockResolvedValue({ outcome: "allowed", workspaceId, tokenId });
  runtime.mockReturnValue({ ...createConnectorAuthenticator(repository as unknown as IdentityRepository, {
    appOrigin: "https://example.test", chainId: 5042002, sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8),
  }), appOrigin: "https://example.test", services });
});
afterEach(() => vi.unstubAllEnvs());

function request(authorization: string = `Bearer ${token}`, body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list" }) {
  return new Request("https://example.test/api/mcp", { method: "POST", headers: {
    Authorization: authorization, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    "x-vercel-forwarded-for": "192.0.2.128", "x-forwarded-for": "198.51.100.1",
  }, body: JSON.stringify(body) });
}

it("runs real SDK discovery with the same credential, scopes and atomic admission", async () => {
  const response = await POST(request(`bearer ${token}`));
  expect(response.status).toBe(200);
  expect((await response.json()).result.tools).toHaveLength(6);
  expect(repository.admitConnector).toHaveBeenCalledExactlyOnceWith({ id: tokenId, tokenHash: record.tokenHash,
    ipHash: "5add4d24fff9fb047129f6f1fc524554bba7ceb0687a818bb955f968af45a46e", action: "invoice:status" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
});

it.each(["", "Basic abc", "Bearer", "Bearer one two", "Bearer abc, Bearer def"])("denies absent or ambiguous header %s without cookie/query fallback", async (authorization) => {
  const req = new Request(`https://example.test/api/mcp?token=${token}`, { headers: { Authorization: authorization, Cookie: `session=${token}` } });
  const response = await GET(req);
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toBe('Bearer realm="Payr"');
  expect(await response.text()).not.toContain(token);
  expect(runtime).not.toHaveBeenCalled();
});

it.each(["malformed", "unknown", "expired", "revoked"])("rejects %s credentials before exposing any tools", async (kind) => {
  if (kind === "unknown") repository.findConnector.mockResolvedValue(null);
  if (kind === "expired") repository.findConnector.mockResolvedValue({ ...record, expiresAt: "2000-01-01T00:00:00Z" });
  if (kind === "expired" || kind === "revoked") repository.admitConnector.mockResolvedValue({ outcome: "denied" });
  const response = await POST(request(kind === "malformed" ? "Bearer invalid" : `Bearer ${token}`));
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain("Bearer");
  expect(await response.text()).not.toContain(token);
  expect(services.status).not.toHaveBeenCalled();
});

it("retains per-action scopes, origin enforcement and rate-limit responses", async () => {
  const denied = await POST(request(undefined, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "save_sender_profile", arguments: {} } }));
  expect(denied.status).toBe(401);
  expect(services.saveSenderProfile).not.toHaveBeenCalled();
  const hostile = request(); hostile.headers.set("origin", "https://hostile.test");
  expect((await POST(hostile)).status).toBe(403);
  repository.admitConnector.mockResolvedValue({ outcome: "rate_limited", retryAfterSeconds: 37 });
  const limited = await POST(request());
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("37");
});

it("keeps unsupported methods authenticated and configuration errors private", async () => {
  for (const [method, handler] of [["GET", GET], ["HEAD", HEAD], ["DELETE", DELETE], ["OPTIONS", OPTIONS], ["PUT", PUT], ["PATCH", PATCH]] as const) {
    const response = await handler(new Request("https://example.test/api/mcp", { method, headers: { Authorization: `Bearer ${token}`, "x-vercel-forwarded-for": "192.0.2.128" } }));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  }
  runtime.mockImplementationOnce(() => { throw new Error(token); });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(token);
});
