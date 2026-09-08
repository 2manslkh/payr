// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { keccak256 } from "viem";
import { testReceiptWork } from "../../../../lib/receipts/test-support";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn() }));
vi.mock("../../../../lib/receipts/runtime", () => ({ createReceiptRuntime: () => ({ access: { resolve: mocks.resolve }, storage: { read: mocks.read } }) }));
const bytes = new TextEncoder().encode("%PDF-1.7\nverified receipt fixture");
beforeEach(() => {
  const { work } = testReceiptWork();
  work.state = "ready"; work.leaseUntil = null;
  work.artifact = { storageKey: `workspace/${work.workspaceId}/receipt/${work.id}.pdf`, pdfFilename: `receipt-${work.attempt.invoiceNumber}-v1.pdf`,
    contentType: "application/pdf", byteLength: bytes.byteLength, pdfContentHash: keccak256(bytes), qrVerified: true };
  mocks.resolve.mockReset().mockResolvedValue(work);
  mocks.read.mockReset().mockResolvedValue({ bytes, contentType: "application/pdf", byteLength: bytes.byteLength });
});
const read = () => GET(new Request("https://example.test"), { params: Promise.resolve({ slug: "test-only-bearer" }) });

it("serves only the frozen receipt bytes and independently revalidates bearer access", async () => {
  const response = await read();
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-payr-content-hash")).toBe(keccak256(bytes));
  expect(mocks.resolve).toHaveBeenCalledTimes(2);
});
it("denies a receipt link revoked while storage was downloading", async () => {
  mocks.resolve.mockResolvedValueOnce(await mocks.resolve()).mockResolvedValueOnce(null);
  const response = await read();
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("%PDF");
});
it("does not serve bytes that differ from the immutable receipt hash", async () => {
  mocks.read.mockResolvedValue({ bytes: new TextEncoder().encode("%PDF-corrupt"), contentType: "application/pdf", byteLength: 12 });
  expect((await read()).status).toBe(503);
});
