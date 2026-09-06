// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

const { resolve, runtime } = vi.hoisted(() => ({ resolve: vi.fn(), runtime: vi.fn() }));
vi.mock("./lib/documents/runtime", () => ({ createDocumentRuntime: runtime }));
beforeEach(() => {
  resolve.mockReset().mockResolvedValue(null);
  runtime.mockReset().mockReturnValue({ access: { resolve }, rpcOrigins: ["https://rpc.example.test"] });
  vi.stubEnv("VERCEL", "");
});
afterEach(() => vi.unstubAllEnvs());

it.each<Record<string, string>>([{}, { RSC: "1" }, { "next-router-prefetch": "1", purpose: "prefetch" }])("matches and rejects HTML, RSC and prefetch with a real private 404 (%j)", async (headers) => {
  for (const path of ["/invoice/invalid", "/invoice/invalid/pdf"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path, headers })).toBe(true);
    const response = await proxy(new NextRequest(`https://example.test${path}`, { headers }));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Invoice not found.\n");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  }
});

it("ignores caller identity and nonces; forwards only a fresh CSP nonce and admits every request once", async () => {
  resolve.mockResolvedValue({});
  const response = await proxy(new NextRequest("https://attacker.test/invoice/credential", { headers: {
    "x-nonce": "attacker", "content-security-policy": "script-src *", "x-payr-document-context": "trusted",
    "x-forwarded-for": "192.0.2.1", "x-vercel-forwarded-for": "192.0.2.2",
  } }));
  expect(resolve).toHaveBeenCalledExactlyOnceWith("credential", "local");
  expect(response.headers.get("x-middleware-next")).toBe("1");
  const csp = response.headers.get("content-security-policy")!;
  expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  expect(csp.includes("attacker") || csp.includes("unsafe-inline")).toBe(false);
  expect(response.headers.has("x-middleware-request-x-payr-document-context")).toBe(false);
  expect(response.headers.get("x-middleware-request-x-nonce")).not.toBe("attacker");
});

it("trusts only Vercel's overwritten address on Vercel", async () => {
  vi.stubEnv("VERCEL", "1");
  await proxy(new NextRequest("https://example.test/invoice/invalid", { headers: {
    "x-forwarded-for": "192.0.2.1", "x-real-ip": "192.0.2.2", "x-vercel-forwarded-for": "192.0.2.3",
  } }));
  expect(resolve).toHaveBeenCalledExactlyOnceWith("invalid", "192.0.2.3");
});

it("fails closed on operational or configuration errors with a sanitized private 503", async () => {
  for (const fail of [() => resolve.mockRejectedValue(new Error("provider-secret")), () => runtime.mockImplementation(() => { throw new Error("config-secret"); })]) {
    fail();
    const response = await proxy(new NextRequest("https://example.test/invoice/invalid"));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Invoice temporarily unavailable. Try again later.\n");
    expect(response.headers.get("content-security-policy")).toContain("object-src 'none'");
  }
});

it("does not match authenticated app routes or assets", () => {
  for (const url of ["/app/invoices", "/", "/_next/static/app.js"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  }
});

it("serves the credential-free operational fallback as a private 503 after IP admission", async () => {
  const response = await proxy(new NextRequest("https://example.test/invoice/system/unavailable"));
  expect(response.status).toBe(503);
  expect(resolve).toHaveBeenCalledExactlyOnceWith("", "local");
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
});
