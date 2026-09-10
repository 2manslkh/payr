// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST, GET, DELETE } from "./route";
const mocks = vi.hoisted(() => ({ runtime: vi.fn(), authenticate: vi.fn() }));
vi.mock("../../../../lib/mcp/runtime", () => ({ createMcpRuntime: mocks.runtime }));
const context = { params: Promise.resolve({ token: "synthetic-secret" }) };
beforeEach(() => {
  mocks.authenticate.mockReset().mockResolvedValue({ workspaceId: "00000000-0000-4000-8000-000000000001", tokenId: "00000000-0000-4000-8000-000000000002" });
  mocks.runtime.mockReset().mockReturnValue({ appOrigin: "https://example.test", authenticate: mocks.authenticate,
    services: { createDraft: vi.fn(), publish: vi.fn(), status: vi.fn(), void: vi.fn(), getSenderProfile: vi.fn(), saveSenderProfile: vi.fn() } });
});
afterEach(() => vi.unstubAllEnvs());
it("runs actual SDK discovery through the endpoint, trusting only Vercel's forwarded IP", async () => {
  vi.stubEnv("VERCEL", "1");
  const response = await POST(new Request("https://example.test/api/mcp/synthetic-secret", { method: "POST", headers: {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream", "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "198.51.100.1",
  }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), context);
  expect((await response.json()).result.tools).toHaveLength(7);
  expect(mocks.authenticate).toHaveBeenCalledWith({ token: "synthetic-secret", ip: "192.0.2.1", action: "invoice:status" });
  expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.has("mcp-session-id")).toBe(false);
});
it("authenticates unsupported GET and DELETE and does not trust arbitrary local forwarded IPs", async () => {
  vi.stubEnv("VERCEL", "0");
  for (const [method, handler] of [["GET", GET], ["DELETE", DELETE]] as const) {
    expect((await handler(new Request("https://example.test/api/mcp/synthetic-secret", { method, headers: { "x-forwarded-for": "198.51.100.1" } }), context)).status).toBe(405);
  }
  expect(mocks.authenticate.mock.calls.every(([input]) => input.ip === "127.0.0.1")).toBe(true);
});
it("contains configuration errors without logging the connector path", async () => {
  mocks.runtime.mockImplementation(() => { throw new Error("synthetic-secret private config"); });
  const response = await GET(new Request("https://example.test/api/mcp/synthetic-secret"), context);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("synthetic-secret");
});
