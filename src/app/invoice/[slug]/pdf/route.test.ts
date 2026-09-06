// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { keccak256 } from "viem";
import { GET } from "./route";

const { resolve, read, runtime } = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), runtime: vi.fn() }));
vi.mock("../../../../lib/documents/runtime", () => ({ createDocumentRuntime: runtime }));
const bytes = new TextEncoder().encode("%PDF-1.7\nimmutable HTTP byte fixture\n%%EOF");
const artifact = { pdfFilename: "INV-2030-000001.pdf", contentType: "application/pdf", byteLength: bytes.length, pdfContentHash: keccak256(bytes) };
beforeEach(() => {
  resolve.mockReset().mockResolvedValue({ attempt: { storageKey: "private/immutable.pdf", artifact: { ...artifact } } });
  read.mockReset().mockResolvedValue({ bytes, byteLength: bytes.length, contentType: "application/pdf" });
  runtime.mockReset().mockReturnValue({ access: { resolve }, storage: { read }, rpcOrigins: [] });
});
const request = () => GET(new Request("https://example.test/invoice/inert/pdf", { headers: { "x-payr-document-context": "forged", Range: "bytes=0-3" } }), { params: Promise.resolve({ slug: "inert" }) });

it("revalidates without recounting and serves the exact immutable bytes, not a redirect or render", async () => {
  const response = await request();
  expect(resolve).toHaveBeenCalledExactlyOnceWith("inert");
  expect(read).toHaveBeenCalledExactlyOnceWith("private/immutable.pdf");
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(Object.fromEntries(response.headers)).toMatchObject({
    "content-type": "application/pdf", "content-length": String(bytes.length),
    "content-disposition": 'attachment; filename="INV-2030-000001.pdf"',
    "x-payr-content-hash": artifact.pdfContentHash, "cache-control": "private, no-store, max-age=0",
  });
  expect(response.headers.has("location")).toBe(false);
});

it.each(["missing", "bytes", "length", "type", "hash", "filename", "artifact"])("fails closed on immutable storage/artifact mismatch (%s)", async (kind) => {
  if (kind === "missing") read.mockResolvedValue(null);
  if (kind === "bytes") read.mockResolvedValue({ bytes: new Uint8Array(bytes.length), byteLength: bytes.length, contentType: "application/pdf" });
  if (kind === "length") read.mockResolvedValue({ bytes, byteLength: bytes.length + 1, contentType: "application/pdf" });
  if (kind === "type") read.mockResolvedValue({ bytes, byteLength: bytes.length, contentType: "text/html" });
  if (["hash", "filename", "artifact"].includes(kind)) resolve.mockResolvedValue({ attempt: { storageKey: "private/immutable.pdf", artifact: kind === "artifact" ? null : {
    ...artifact, ...(kind === "hash" ? { pdfContentHash: `0x${"0".repeat(64)}` } : { pdfFilename: '../unsafe".pdf' }),
  } } });
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe("Invoice temporarily unavailable. Try again later.\n");
  expect(response.headers.has("x-payr-content-hash")).toBe(false);
});

it("returns the same private 404 when independent revalidation denies access and never reads storage", async () => {
  resolve.mockResolvedValue(null);
  const response = await request();
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("Invoice not found.\n");
  expect(read).not.toHaveBeenCalled();
});

it("sanitizes provider exceptions and still applies CSP and privacy headers", async () => {
  read.mockRejectedValue(new Error("provider-secret"));
  const response = await request();
  expect(response.status).toBe(503);
  expect((await response.text()).includes("provider-secret")).toBe(false);
  expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
