// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentRuntime } from "../../../../lib/agent-api/contracts";
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, runtime as routeRuntime } from "./route";

const { createAgentRuntime } = vi.hoisted(() => ({ createAgentRuntime: vi.fn<() => AgentRuntime>() }));
vi.mock("../../../../lib/agent-api/runtime", () => ({ createAgentRuntime }));

const runtime: AgentRuntime = {
  appOrigin: "https://payr.example", authenticateService: vi.fn(), authenticateAccount: vi.fn(), execute: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL", "0");
  vi.mocked(createAgentRuntime).mockReturnValue(runtime);
  vi.mocked(runtime.authenticateService).mockResolvedValue({ serviceId: "bazantic" });
  vi.mocked(runtime.execute).mockResolvedValue({ challenge: "public-challenge" });
});
afterEach(() => vi.unstubAllEnvs());

function request(operation = "create_account_challenge", method = "POST") {
  return new Request(`https://payr.example/api/v1/${operation}`, { method,
    headers: { "content-type": "application/json", "x-payr-service-key": "pgw_service.secret", "x-vercel-forwarded-for": "192.0.2.12",
      "x-forwarded-for": "spoofed", "x-real-ip": "spoofed" },
    ...(method === "POST" ? { body: '{"input":{"wallet":"unvalidated-at-transport"}}' } : {}),
  });
}
function context(operation = "create_account_challenge") { return { params: Promise.resolve({ operation }) }; }
function privateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
}

it("uses Node runtime, promised params and loopback outside Vercel", async () => {
  expect(routeRuntime).toBe("nodejs");
  const response = await POST(request(), context());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ challenge: "public-challenge" });
  expect(runtime.authenticateService).toHaveBeenCalledExactlyOnceWith("pgw_service.secret", "create_account_challenge", "127.0.0.1");
  expect(runtime.execute).toHaveBeenCalledExactlyOnceWith("create_account_challenge", { wallet: "unvalidated-at-transport" }, { serviceId: "bazantic" }, "127.0.0.1");
  privateHeaders(response);
});

it("uses only the Vercel IP header when running on Vercel", async () => {
  vi.stubEnv("VERCEL", "1");
  await POST(request(), context());
  expect(runtime.authenticateService).toHaveBeenCalledWith("pgw_service.secret", "create_account_challenge", "192.0.2.12");
  const req = request();
  req.headers.delete("x-vercel-forwarded-for");
  await POST(req, context());
  expect(runtime.authenticateService).toHaveBeenLastCalledWith("pgw_service.secret", "create_account_challenge", "");
});

it.each([["GET", GET], ["HEAD", HEAD], ["OPTIONS", OPTIONS], ["PUT", PUT], ["PATCH", PATCH], ["DELETE", DELETE]] as const)(
  "explicitly rejects %s through the same handler, without Next's automatic OPTIONS", async (method, handler) => {
    expect(handler).toBe(POST);
    const response = await handler(request(undefined, method), context());
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(createAgentRuntime).not.toHaveBeenCalled();
    expect(runtime.execute).not.toHaveBeenCalled();
    privateHeaders(response);
  },
);

it.each(["void_invoice", "toString", "getAccount"])("does not construct runtime or publicly invoke unknown %s", async (op) => {
  const response = await POST(request(op), context(op));
  expect(response.status).toBe(404);
  expect(createAgentRuntime).not.toHaveBeenCalled();
  expect(runtime.execute).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("sanitizes runtime configuration failures without logging or reflecting secrets", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    vi.mocked(createAgentRuntime).mockImplementation(() => { throw new Error("PRIVATE_KEY=provider-secret"); });
    const response = await POST(request(), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "CONFIGURATION_ERROR" } });
    expect(log).not.toHaveBeenCalled();
    privateHeaders(response);
  } finally { log.mockRestore(); }
});
