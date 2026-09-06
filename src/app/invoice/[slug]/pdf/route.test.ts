// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { keccak256 } from "viem";
import { createInvoiceAccessService } from "../../../../lib/documents/access";
import type { InvoiceAccessTarget, StoredDocument } from "../../../../lib/documents/contracts";
import { testPublicationSnapshot } from "../../../../lib/invoices/publication.test-support";
import { createKeyedTokenCodec } from "../../../../lib/security/keyed-token";
import { GET } from "./route";

const { resolve, read, runtime } = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), runtime: vi.fn() }));
vi.mock("../../../../lib/documents/runtime", () => ({ createDocumentRuntime: runtime }));
const bytes = new TextEncoder().encode("%PDF-1.7\nimmutable HTTP byte fixture\n%%EOF");
const artifact = { pdfFilename: "INV-2030-000001.pdf", contentType: "application/pdf" as const, byteLength: bytes.length,
  pdfContentHash: keccak256(bytes), invoiceDataHash: `0x${"3".repeat(64)}` as const,
  documentCommitment: `0x${"4".repeat(64)}` as const, qrVerified: true as const };
const config = { appOrigin: "https://example.test", explorerOrigin: "https://explorer.test", keys: new Map([[1, new Uint8Array(32).fill(7)]]), pepper: new Uint8Array(32).fill(8) };
const tokenId = "00000000-0000-4000-8000-000000000001";
const token = createKeyedTokenCodec(config.keys).derive(tokenId, "invoice-bearer", 1);
let target: InvoiceAccessTarget;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-02T00:00:00.000Z"));
  const snapshot = testPublicationSnapshot();
  target = {
    invoiceId: tokenId, invoiceVersion: 1, invoiceNumber: "INV-2030-000001", commercialState: "published",
    payableUntil: snapshot.payableUntil, voidedAt: null, snapshot, settlement: null, receipt: null, deliveries: [],
    attempt: {
      id: tokenId, workspaceId: "00000000-0000-4000-8000-000000000002", invoiceId: tokenId,
      invoiceVersionId: tokenId, invoiceVersion: 1, invoiceNumber: "INV-2030-000001", state: "finalized", snapshot,
      chainId: 5042002, contractAddress: `0x${"2".repeat(40)}`, invoiceKey: `0x${"5".repeat(64)}`, publicationSalt: `0x${"6".repeat(64)}`,
      storageKey: "private/immutable.pdf", artifact: { ...artifact }, finalizedAt: "2030-01-01T00:00:00.000Z",
      leaseOwner: null, leaseUntil: null, fence: "1", failureCode: null,
      link: { tokenId, keyVersion: 1, verifierHash: token.verifierHash, activatedAt: "2030-01-01T00:00:00.000Z", expiresAt: "2031-01-01T00:00:00.000Z", revokedAt: null },
    },
  };
  resolve.mockReset().mockImplementation(async () => structuredClone(target));
  read.mockReset().mockResolvedValue({ bytes, byteLength: bytes.length, contentType: "application/pdf" });
  runtime.mockReset().mockReturnValue({ access: { resolve }, storage: { read }, rpcOrigins: [] });
});
afterEach(() => vi.useRealTimers());
const request = () => GET(new Request("https://example.test/invoice/inert/pdf", { headers: { "x-payr-document-context": "forged", Range: "bytes=0-3" } }), { params: Promise.resolve({ slug: "inert" }) });

it("revalidates without recounting and serves the exact immutable bytes, not a redirect or render", async () => {
  const response = await request();
  expect(resolve.mock.calls).toEqual([["inert"], ["inert"]]);
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

it.each(["void", "credential-expiry", "commercial-expiry"])("revalidates after a deferred download crosses %s without counting quota again", async (change) => {
  const repository = {
    findCandidate: vi.fn(async () => ({ ...target.attempt.link, purpose: "invoice-bearer" as const,
      workspaceId: target.attempt.workspaceId, invoiceId: target.invoiceId, invoiceVersionId: target.attempt.invoiceVersionId })),
    readTarget: vi.fn(async () => structuredClone(target)), admit: vi.fn(), storageState: vi.fn(),
  };
  resolve.mockImplementation(createInvoiceAccessService(repository, config).resolve);
  const started = deferred<void>();
  const download = deferred<StoredDocument>();
  read.mockImplementation(() => { started.resolve(); return download.promise; });
  const responsePromise = GET(new Request("https://example.test/invoice/inert/pdf"), { params: Promise.resolve({ slug: token.slug }) });
  await started.promise;
  if (change === "void") {
    target.commercialState = "voided";
    target.voidedAt = new Date().toISOString();
    target.attempt.link.revokedAt = target.voidedAt;
  } else if (change === "credential-expiry") vi.setSystemTime(new Date(target.attempt.link.expiresAt));
  else {
    vi.setSystemTime(new Date(target.payableUntil!));
    target.commercialState = "expired";
  }
  download.resolve({ bytes, contentType: "application/pdf", byteLength: bytes.length });
  const response = await responsePromise;
  expect(response.status).toBe(change === "commercial-expiry" ? 200 : 404);
  expect(resolve.mock.calls.length).toBe(2);
  expect(resolve.mock.calls.every((args) => args.length === 1 && args[0] === token.slug)).toBe(true);
  expect(repository.admit).not.toHaveBeenCalled();
  if (change !== "commercial-expiry") {
    expect(await response.text()).toBe("Invoice not found.\n");
    expect(response.headers.has("x-payr-content-hash")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  }
});

it.each([
  "invoiceId", "invoiceVersion", "invoiceNumber",
  "attempt.id", "attempt.workspaceId", "attempt.invoiceId", "attempt.invoiceVersionId", "attempt.invoiceVersion", "attempt.invoiceNumber",
  "attempt.storageKey", "attempt.chainId", "attempt.contractAddress", "attempt.invoiceKey", "attempt.publicationSalt", "attempt.finalizedAt", "attempt.state",
  "attempt.snapshot.memo", "attempt.artifact.pdfFilename", "attempt.artifact.contentType", "attempt.artifact.byteLength",
  "attempt.artifact.invoiceDataHash", "attempt.artifact.pdfContentHash", "attempt.artifact.documentCommitment", "attempt.artifact.qrVerified",
  "attempt.link.tokenId", "attempt.link.keyVersion", "attempt.link.verifierHash", "attempt.link.activatedAt", "attempt.link.expiresAt", "attempt.link.revokedAt",
])("fails closed if final revalidation changes the bound %s, including in-place DTO mutation", async (field) => {
  resolve.mockResolvedValueOnce(target).mockImplementationOnce(async () => {
    const path = field.split(".");
    const record = path.slice(0, -1).reduce<Record<string, unknown>>((value, key) => value[key] as Record<string, unknown>, target as unknown as Record<string, unknown>);
    const key = path.at(-1)!;
    record[key] = typeof record[key] === "number" ? record[key] + 1 : typeof record[key] === "boolean" ? !record[key] : "changed";
    return target;
  });
  const response = await request();
  expect(response.status).toBe(503);
  expect(resolve.mock.calls).toEqual([["inert"], ["inert"]]);
  expect(await response.text()).toBe("Invoice temporarily unavailable. Try again later.\n");
  expect(response.headers.has("x-payr-content-hash")).toBe(false);
  expect(response.headers.has("content-disposition")).toBe(false);
});

it("serves an owned copy of the verified bytes even if storage mutates its buffer during final authorization", async () => {
  const mutableBytes = new Uint8Array(bytes);
  read.mockResolvedValue({ bytes: mutableBytes, byteLength: bytes.length, contentType: "application/pdf" });
  const started = deferred<void>();
  const authorized = deferred<InvoiceAccessTarget>();
  resolve.mockResolvedValueOnce(target).mockImplementationOnce(() => { started.resolve(); return authorized.promise; });
  const responsePromise = request();
  await started.promise;
  mutableBytes.fill(0);
  authorized.resolve(structuredClone(target));
  const response = await responsePromise;
  expect(response.status).toBe(200);
  const served = new Uint8Array(await response.arrayBuffer());
  expect(served).toEqual(bytes);
  expect(keccak256(served)).toBe(response.headers.get("x-payr-content-hash"));
});

it("sanitizes a final revalidation failure without returning already-downloaded bytes", async () => {
  resolve.mockResolvedValueOnce(target).mockRejectedValueOnce(new Error("late-provider-secret"));
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe("Invoice temporarily unavailable. Try again later.\n");
  expect(response.headers.has("x-payr-content-hash")).toBe(false);
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
