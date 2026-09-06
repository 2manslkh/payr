// @vitest-environment node
import { expect, it } from "vitest";
import { createPrivateHeaders, privateDocumentError } from "./private-response";

it("applies every frozen private header and a fresh nonce with only configured connect origins", () => {
  const headers = createPrivateHeaders(["https://rpc.example.test"]);
  expect(Object.fromEntries(headers)).toMatchObject({
    "cache-control": "private, no-store, max-age=0", pragma: "no-cache",
    "x-robots-tag": "noindex, nofollow, noarchive", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  });
  const csp = headers.get("content-security-policy")!;
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)![1];
  expect(Buffer.from(nonce, "base64").length).toBeGreaterThanOrEqual(16);
  expect(csp).toBe(`default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; connect-src 'self' https://rpc.example.test; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'`);
  expect(createPrivateHeaders().get("content-security-policy")).not.toBe(csp);
});

it.each(["https://rpc.test/path?key=secret", "https://user:pass@rpc.test", "https://rpc.test; script-src *", "data:text/plain,test"])("rejects non-origin CSP configuration (%s)", (origin) => {
  expect(() => createPrivateHeaders([origin])).toThrow("DOCUMENT_UNAVAILABLE");
});

it.each([404, 503] as const)("returns a non-sensitive private error (%s)", async (status) => {
  const response = privateDocumentError(status);
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("content-security-policy")).toContain("base-uri 'none'");
  expect(await response.text()).toBe(status === 404 ? "Invoice not found.\n" : "Invoice temporarily unavailable. Try again later.\n");
});
