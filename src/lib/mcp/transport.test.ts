// @vitest-environment node
import { expect, it, vi } from "vitest";
import { handleMcpRequest } from "./transport";
import { createConnectorAuthenticator } from "../connectors/auth";
import { CONNECTOR_SCOPES, IdentityError, type ConnectorScope, type IdentityRepository } from "../identity/contracts";

const actor = { workspaceId: "00000000-0000-4000-8000-000000000001", tokenId: "00000000-0000-4000-8000-000000000002" };
const request = (body: unknown) => new Request("https://example.test/api/mcp/test-secret", {
  method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(body),
});

it.each([true, false])("cancels an unfinished request body within the deadline (valid credential: %s)", async (valid) => {
  vi.useFakeTimers();
  try {
    const { send, token, services } = authFixture();
    const cancel = vi.fn();
    const req = new Request("https://example.test/api/mcp/test-secret", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"jsonrpc":')); }, cancel }),
      duplex: "half",
    } as RequestInit);
    let response: Response | undefined;
    const pending = send(req, valid ? token : "bad").then((result) => { response = result; });
    await vi.advanceTimersByTimeAsync(5000);
    expect(response?.status).toBe(valid ? 408 : 401);
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
    expect(services.createDraft).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

function authFixture() {
  const tokenId = "00000000-0000-4000-8000-00000000000a";
  const token = `${tokenId}.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`;
  const record = { id: tokenId, tokenHash: "6df944232b1d5fc3471f178f15b10dfe54f3dadeb43d3b1a0fbafa8025133259", workspaceId: actor.workspaceId,
    createdAt: "2026-09-04T00:00:00Z", expiresAt: "2030-01-01T00:00:00Z", revokedAt: null as string | null, lastUsedAt: null, scopes: CONNECTOR_SCOPES as readonly ConnectorScope[] };
  const repository = { findConnector: vi.fn<IdentityRepository["findConnector"]>().mockResolvedValue(record),
    admitConnector: vi.fn<IdentityRepository["admitConnector"]>().mockResolvedValue({ outcome: "allowed", workspaceId: actor.workspaceId, tokenId }) };
  const auth = createConnectorAuthenticator(repository as unknown as IdentityRepository, { appOrigin: "https://example.test", chainId: 5042002,
    sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8) });
  const services = { createDraft: vi.fn(), publish: vi.fn(), status: vi.fn(), void: vi.fn(), getSenderProfile: vi.fn(), saveSenderProfile: vi.fn() };
  const runtime = { ...auth, services, appOrigin: "https://example.test" };
  const send = (req = request({ jsonrpc: "2.0", id: 1, method: "tools/list" }), credential = token, ip = "192.0.2.128") => handleMcpRequest(req, credential, ip, runtime);
  return { record, repository, token, services, send };
}

it("uses real connector verification and the atomic DB token/IP admission with bounded audit fields", async () => {
  const { send, repository, token } = authFixture();
  expect((await send()).status).toBe(200);
  expect(repository.admitConnector).toHaveBeenCalledExactlyOnceWith({ id: token.slice(0, 36),
    tokenHash: "6df944232b1d5fc3471f178f15b10dfe54f3dadeb43d3b1a0fbafa8025133259",
    ipHash: "5add4d24fff9fb047129f6f1fc524554bba7ceb0687a818bb955f968af45a46e", action: "invoice:status" });
  expect(JSON.stringify(repository.admitConnector.mock.calls)).not.toMatch(/test-secret|api\/mcp|192\.0\.2\.128|AAECAwQ/);
});

it.each(["malformed", "unknown", "expired", "revoked", "racing-revocation"])("denies %s on initialize and discovery without tools", async (kind) => {
  const { send, record, repository, token, services } = authFixture();
  if (kind === "unknown") repository.findConnector.mockResolvedValue(null);
  if (kind === "expired") record.expiresAt = new Date().toISOString();
  if (kind === "revoked") record.revokedAt = new Date().toISOString();
  if (["expired", "revoked", "racing-revocation"].includes(kind)) repository.admitConnector.mockResolvedValue({ outcome: "denied" });
  for (const method of ["initialize", "tools/list"]) {
    const response = await send(request({ jsonrpc: "2.0", id: 1, method }), kind === "malformed" ? "bad" : token);
    expect(response.status).toBe(401); expect(await response.text()).not.toContain(token);
  }
  expect(services.createDraft).not.toHaveBeenCalled();
});

it.each(["token", "ip"])("propagates independent DB %s exhaustion and recovery without a process-local bucket", async () => {
  const { send, repository } = authFixture();
  repository.admitConnector.mockResolvedValueOnce({ outcome: "rate_limited", retryAfterSeconds: 37 });
  const denied = await send(); expect(denied.status).toBe(429); expect(denied.headers.get("retry-after")).toBe("37");
  expect((await send()).status).toBe(200); expect(repository.admitConnector).toHaveBeenCalledTimes(2);
});

it.each(["GET", "DELETE", "HEAD", "OPTIONS", "PUT", "PATCH"])("authenticates then explicitly rejects unsupported %s", async (method) => {
  const { send, repository } = authFixture();
  const response = await send(new Request("https://example.test/api/mcp/test-secret", { method }));
  expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("POST"); expect(repository.admitConnector).toHaveBeenCalledOnce();
});

it.each(["mcp-session-id", "last-event-id"])("rejects %s rather than pretending to resume", async (header) => {
  const { send, repository } = authFixture(); const req = request({ jsonrpc: "2.0", id: 1, method: "tools/list" }); req.headers.set(header, "secret");
  expect((await send(req)).status).toBe(400); expect(repository.admitConnector).toHaveBeenCalledOnce();
});

it.each(["json", "batch", "oversized", "notification-call", "origin", "content-type", "schema"])("bounds and redacts %s failures after admission", async (kind) => {
  const { send, repository, services } = authFixture();
  let body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  if (kind === "batch") body = [body, body];
  if (kind === "oversized") body = { secret: "x".repeat(70 * 1024) };
  if (kind === "notification-call") body = { jsonrpc: "2.0", method: "tools/call", params: { name: "publish_invoice", arguments: {} } };
  if (kind === "schema") body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: 5, arguments: "test-secret" } };
  const req = kind === "json" ? new Request("https://example.test/api/mcp/test-secret", { method: "POST", headers: { "Content-Type": "application/json" }, body: "test-secret" }) : request(body);
  if (kind === "origin") req.headers.set("origin", "https://hostile.test");
  if (kind === "content-type") req.headers.set("content-type", "text/plain");
  const response = await send(req); const text = await response.text();
  expect(text).not.toContain("test-secret"); expect(repository.admitConnector).toHaveBeenCalledOnce();
  expect(services.publish).not.toHaveBeenCalled(); expect(services.createDraft).not.toHaveBeenCalled();
  expect(JSON.parse(text).error).toBeTruthy();
});

it("accepts initialized notification statelessly, rejects unknown tools without expanding scope", async () => {
  const { send, repository } = authFixture();
  expect((await send(request({ jsonrpc: "2.0", method: "notifications/initialized" }))).status).toBe(202);
  const response = await send(request({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "change_payout", arguments: {} } }));
  expect((await response.json()).result.structuredContent).toEqual({ code: "INVALID_INPUT" });
  expect(repository.admitConnector.mock.calls.every(([input]) => input.action === "invoice:status")).toBe(true);
});

it("redacts unexpected tool and authentication provider exceptions", async () => {
  const { send, services, repository, token } = authFixture();
  services.status.mockRejectedValue(new Error(`${token} /api/mcp/test-secret body`));
  const response = await send(request({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_invoice_status", arguments: { invoiceId: actor.workspaceId } } }));
  expect((await response.json()).result.structuredContent).toEqual({ code: "INTERNAL_ERROR" });
  repository.admitConnector.mockRejectedValue(new IdentityError(token));
  const failure = await send(); expect(failure.status).toBe(503); expect(await failure.text()).not.toContain(token);
});
it("discovers four invoice and two opt-in sender tools without granting their scopes", async () => {
  const authenticate = vi.fn().mockResolvedValue(actor);
  const services = { createDraft: vi.fn(), publish: vi.fn(), status: vi.fn(), void: vi.fn(), getSenderProfile: vi.fn(), saveSenderProfile: vi.fn() };
  const runtime = { authenticate, services, appOrigin: "https://example.test" };
  const first = await handleMcpRequest(request({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "local-test", version: "1" },
  } }), "test-secret", "127.0.0.1", runtime);
  expect(first.status).toBe(200);
  expect(first.headers.has("mcp-session-id")).toBe(false);
  expect((await first.json()).result.serverInfo.name).toBe("Payr");
  const second = await handleMcpRequest(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }), "test-secret", "127.0.0.1", runtime);
  expect((await second.json()).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
    "get_sender_profile", "save_sender_profile",
    "create_invoice_draft", "publish_invoice", "get_invoice_status", "void_invoice",
  ]);
  expect(authenticate).toHaveBeenCalledTimes(2);
  expect(authenticate).toHaveBeenCalledWith({ token: "test-secret", ip: "127.0.0.1", action: "invoice:status" });
  expect(services.createDraft).not.toHaveBeenCalled();
});

it("denies invoice-only sender access, permits read-only reads but never writes, and derives the connector actor", async () => {
  const { send, services, record, repository } = authFixture();
  const call = (name: string) => send(request({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }));
  expect((await call("get_sender_profile")).status).toBe(401);
  expect((await call("save_sender_profile")).status).toBe(401);
  expect(repository.admitConnector).not.toHaveBeenCalled();
  record.scopes = [...CONNECTOR_SCOPES, "sender:read"];
  services.getSenderProfile.mockResolvedValue({ profile: {}, missingFields: [] });
  expect((await call("get_sender_profile")).status).toBe(200);
  expect(services.getSenderProfile).toHaveBeenCalledExactlyOnceWith({ workspaceId: actor.workspaceId, connectorId: record.id, ownerWallet: null }, {});
  expect(repository.admitConnector.mock.calls.at(-1)?.[0].action).toBe("sender:read");
  expect((await call("save_sender_profile")).status).toBe(401);
  expect(services.saveSenderProfile).not.toHaveBeenCalled();
  record.scopes = [...record.scopes, "sender:write"];
  services.saveSenderProfile.mockResolvedValue({ profile: {}, missingFields: [] });
  expect((await call("save_sender_profile")).status).toBe(200);
  expect(repository.admitConnector.mock.calls.at(-1)?.[0].action).toBe("sender:write");
});
