// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { requireRequestSession } from "../../../../../lib/auth/runtime";
import { IdentityError } from "../../../../../lib/identity/contracts";
import { PublicationError, type PublicationAttempt, type PublicationConfig, type PublicationRepository } from "../../../../../lib/invoices/publication-contracts";
import { getPublicationConfig, getPublicationDocumentPort, getPublicationLinkConfig, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";
import { testPublicationSnapshot } from "../../../../../lib/invoices/publication.test-support";
import { createKeyedTokenCodec } from "../../../../../lib/security/keyed-token";
import { POST } from "./route";

vi.mock("../../../../../lib/auth/runtime", async (original) => ({
  ...await original<typeof import("../../../../../lib/auth/runtime")>(), requireRequestSession: vi.fn(),
}));
vi.mock("../../../../../lib/invoices/publication-runtime", () => ({
  getPublicationConfig: vi.fn(), getPublicationDocumentPort: vi.fn(), getPublicationLinkConfig: vi.fn(), getPublicationRepository: vi.fn(),
}));
vi.mock("../../../../../lib/invoices/gmail-package", () => ({ buildGmailPackage: vi.fn((value) => ({
  to: [value.snapshot.client.contactEmail], subject: value.invoiceNumber, textBody: "Gmail seam", htmlBody: "Gmail seam",
  paymentUrl: value.invoiceUrl, invoicePdfUrl: value.invoicePdfUrl,
})) }));

const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` };
const invoiceId = "00000000-0000-4000-8000-000000000002";
const input = { expectedVersion: 1, approval: true, idempotencyKey: "publish" };
const config: PublicationConfig = { appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app", activeKeyVersion: 1,
  keys: new Map([[1, new Uint8Array(32).fill(7)]]), chainId: 5042002, contractAddress: `0x${"1".repeat(40)}` };
const repository: PublicationRepository = {
  findReplay: vi.fn(),
  reserve: vi.fn(), claim: vi.fn(), store: vi.fn(), finalize: vi.fn(), fail: vi.fn(), statusData: vi.fn(), voidInvoice: vi.fn(), expire: vi.fn(),
};
const createOrRead = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRequestSession).mockResolvedValue(identity);
  vi.mocked(getPublicationConfig).mockReturnValue(config);
  vi.mocked(getPublicationLinkConfig).mockReturnValue(config);
  vi.mocked(getPublicationRepository).mockReturnValue(repository);
  vi.mocked(getPublicationDocumentPort).mockReturnValue({ createOrRead });
  vi.mocked(repository.reserve).mockRejectedValue(new PublicationError("PUBLICATION_IN_PROGRESS"));
  vi.mocked(repository.findReplay).mockResolvedValue(null);
});

function request(body: unknown = input) {
  return new Request(`https://payrlink.xyz/api/invoices/${invoiceId}/publish`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
function post(value: Request = request(), id = invoiceId) { return POST(value, { params: Promise.resolve({ id }) }); }
function privateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
function unopened() {
  expect(getPublicationDocumentPort).not.toHaveBeenCalled();
  expect(getPublicationRepository).not.toHaveBeenCalled();
  expect(repository.reserve).not.toHaveBeenCalled();
}

it("uses the URL invoice ID, only the F2 mutation session actor, and the canonical publication service", async () => {
  const req = request();
  const response = await post(req);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(req, true);
  expect(repository.reserve).toHaveBeenCalledExactlyOnceWith({ ...identity, connectorId: null }, expect.objectContaining({ ...input, draftId: invoiceId }));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: "PUBLICATION_IN_PROGRESS" });
  expect(createOrRead).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each([["AUTH_REQUIRED", 401], ["ORIGIN_NOT_ALLOWED", 403], ["FORBIDDEN", 403]] as const)(
  "rejects %s before reading the body or opening provider/repository", async (code, status) => {
    vi.mocked(requireRequestSession).mockRejectedValue(new IdentityError(code, status));
    const req = request();
    const response = await post(req);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code } });
    expect(req.bodyUsed).toBe(false);
    unopened();
    privateHeaders(response);
  },
);

it.each([
  { approval: false }, { approval: undefined }, { expectedVersion: 0 }, { expectedVersion: "1" },
  { idempotencyKey: " " }, { idempotencyKey: "x".repeat(129) }, { draftId: invoiceId }, { invoiceId },
  { workspaceId: identity.workspaceId }, { ownerWallet: identity.ownerWallet }, { connectorId: invoiceId },
  { actor: identity }, { chainId: 42 }, { limit: 1 },
])("rejects invalid or unknown body properties before provider/repository access (%#)", async (value) => {
  const response = await post(request({ ...input, ...value }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
  unopened();
  privateHeaders(response);
});

it("validates the URL UUID before provider/repository access", async () => {
  const response = await post(request(), "SECRET");
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
  unopened();
});

it.each([
  '{"expectedVersion":1,"approval":false,"approval":true,"idempotencyKey":"publish"}',
  '{"expectedVersion":2,"expectedVersion":1,"approval":true,"idempotencyKey":"publish"}',
  '{"expectedVersion":1,"approval":false,"\\u0061pproval":true,"idempotencyKey":"publish"}',
  '{"expectedVersion":1,"approval":true,"idempotencyKey":"first","idempotencyKey":"publish"}',
])("rejects ambiguous approval bodies before any replay lookup (%#)", async (body) => {
  const response = await post(new Request(`https://payrlink.xyz/api/invoices/${invoiceId}/publish`, {
    method: "POST", headers: { "content-type": "application/json" }, body,
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
  unopened();
});

it.each(["DOCUMENTS_NOT_CONFIGURED", "CONFIGURATION_ERROR"])("fails closed for %s before reservation/claim", async (code) => {
  const gate = code === "DOCUMENTS_NOT_CONFIGURED" ? getPublicationDocumentPort : getPublicationConfig;
  vi.mocked(gate).mockImplementation(() => { throw new PublicationError(code, 503); });
  const response = await post();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code });
  expect(repository.findReplay).toHaveBeenCalled();
  expect(repository.reserve).not.toHaveBeenCalled();
  expect(repository.claim).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each([new Error("SECRET https://provider.test"), new PublicationError("SECRET", 200)])("sanitizes unexpected provider/repository errors (%#)", async (error) => {
  vi.mocked(repository.reserve).mockRejectedValue(error);
  const response = await post();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual(error instanceof PublicationError ? { code: "INTERNAL_ERROR" } : { error: { code: "INTERNAL_ERROR" } });
  privateHeaders(response);
});

it("preserves repository permission denial before any privileged worker claim", async () => {
  vi.mocked(repository.reserve).mockRejectedValue(new IdentityError("FORBIDDEN", 403));
  const response = await post();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { code: "FORBIDDEN" } });
  expect(repository.claim).not.toHaveBeenCalled();
});

it.each(["PUBLICATION_FAILED", "PUBLICATION_RETRYABLE", "LEASE_LOST", "IDEMPOTENCY_CONFLICT"])("uses the stable %s error envelope without details", async (code) => {
  vi.mocked(repository.reserve).mockRejectedValue(new PublicationError(code, 200));
  const response = await post();
  expect(response.status).toBe(code === "PUBLICATION_RETRYABLE" ? 503 : 409);
  expect(await response.json()).toEqual({ code });
  privateHeaders(response);
});

it.each(["{", "null", "[]", "true", "1"])("rejects malformed/non-object JSON (%s)", async (body) => {
  const response = await post(new Request("https://payrlink.xyz", { method: "POST", headers: { "content-type": "application/json" }, body }));
  expect(response.status).toBe(400);
  unopened();
  privateHeaders(response);
});

it.each([
  { "content-type": "text/plain" }, { "content-type": "application/json", "content-encoding": "gzip" },
  { "content-type": "application/json; charset=latin1" },
])("rejects unsupported media before provider/repository access (%#)", async (headers) => {
  const response = await post(new Request("https://payrlink.xyz", { method: "POST", headers: headers as Record<string, string>, body: JSON.stringify(input) }));
  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
  unopened();
});

it("accepts exactly 16 KiB and rejects the next streamed byte regardless of declared length", async () => {
  const json = JSON.stringify(input);
  const body = json + " ".repeat(16 * 1024 - Buffer.byteLength(json));
  const accepted = await post(new Request("https://payrlink.xyz", { method: "POST", headers: { "content-type": "application/json" }, body }));
  expect(accepted.status).toBe(409);
  vi.clearAllMocks();
  const response = await post(new Request("https://payrlink.xyz", {
    method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: body + " ",
  }));
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ code: "PAYLOAD_TOO_LARGE" });
  unopened();
});

it.each(["16385", "-1", "bad"])("rejects invalid declared length %s before consuming the body", async (length) => {
  const req = request();
  req.headers.set("content-length", length);
  const response = await post(req);
  expect(response.status).toBe(413);
  expect(req.bodyUsed).toBe(false);
  unopened();
});

it("returns the finalized canonical result with private headers, without republishing or implicit send approval", async () => {
  const token = createKeyedTokenCodec(config.keys).derive(invoiceId, "invoice-bearer", 1);
  const attempt: PublicationAttempt = {
    id: invoiceId, workspaceId: identity.workspaceId, invoiceId, invoiceVersionId: invoiceId, invoiceVersion: 1,
    invoiceNumber: "INV-2030-000001", state: "finalized", snapshot: testPublicationSnapshot(), chainId: config.chainId,
    contractAddress: config.contractAddress, invoiceKey: `0x${"3".repeat(64)}`, publicationSalt: `0x${"4".repeat(64)}`,
    storageKey: "private-attempt.pdf", link: { tokenId: invoiceId, keyVersion: 1, verifierHash: token.verifierHash,
      expiresAt: "2031-03-02T00:00:00.000Z", activatedAt: "2030-01-01T00:00:00.000Z", revokedAt: null },
    leaseOwner: invoiceId, leaseUntil: "2030-01-01T00:01:00.000Z", fence: "1", failureCode: null, finalizedAt: "2030-01-01T00:00:00.000Z",
    artifact: { pdfFilename: "INV-2030-000001.pdf", contentType: "application/pdf", byteLength: 100, invoiceDataHash: `0x${"5".repeat(64)}`,
      pdfContentHash: `0x${"6".repeat(64)}`, documentCommitment: `0x${"7".repeat(64)}`, qrVerified: true },
  };
  vi.mocked(repository.findReplay).mockResolvedValue(attempt);
  vi.mocked(getPublicationConfig).mockImplementation(() => { throw new PublicationError("CONFIGURATION_ERROR", 503); });
  vi.mocked(getPublicationDocumentPort).mockImplementation(() => { throw new PublicationError("DOCUMENTS_NOT_CONFIGURED", 503); });
  vi.mocked(repository.statusData).mockResolvedValue({ invoiceId, invoiceVersion: 1, invoiceNumber: attempt.invoiceNumber,
    commercialState: "expired", payableUntil: attempt.snapshot.payableUntil, voidedAt: null, snapshot: attempt.snapshot, attempt,
    settlement: null, receipt: null, deliveries: [] });
  const response = await post();
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toEqual({ invoiceId, invoiceVersion: 1, invoiceNumber: attempt.invoiceNumber, commercialState: "expired",
    invoiceUrl: `${config.appOrigin}/invoice/${token.slug}`, invoicePdfUrl: `${config.appOrigin}/invoice/${token.slug}/pdf`,
    pdfFilename: attempt.artifact!.pdfFilename, pdfContentHash: attempt.artifact!.pdfContentHash, documentCommitment: attempt.artifact!.documentCommitment,
    gmailLinkPackage: { to: ["client@example.test"], subject: attempt.invoiceNumber, textBody: "Gmail seam", htmlBody: "Gmail seam",
      paymentUrl: `${config.appOrigin}/invoice/${token.slug}`, invoicePdfUrl: `${config.appOrigin}/invoice/${token.slug}/pdf` }, sendApprovalRequired: true });
  expect(repository.claim).not.toHaveBeenCalled();
  expect(createOrRead).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain(attempt.publicationSalt);
  expect(getPublicationConfig).not.toHaveBeenCalled();
  expect(getPublicationDocumentPort).not.toHaveBeenCalled();
  privateHeaders(response);
});
