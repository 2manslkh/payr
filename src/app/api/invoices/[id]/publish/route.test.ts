// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getIdentityRuntime, requireRequestSession } from "../../../../../lib/auth/runtime";
import { IdentityError, type ConnectorRecord, type IdentityRepository } from "../../../../../lib/identity/contracts";
import { createConnectorHasher } from "../../../../../lib/connectors/crypto";
import { PublicationError, type PublicationAttempt, type PublicationConfig, type PublicationRepository } from "../../../../../lib/invoices/publication-contracts";
import { getPublicationConfig, getPublicationDocumentPort, getPublicationLinkConfig, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";
import { testPublicationSnapshot } from "../../../../../lib/invoices/publication.test-support";
import { createKeyedTokenCodec } from "../../../../../lib/security/keyed-token";
import { POST } from "./route";

vi.mock("../../../../../lib/auth/runtime", async (original) => ({
  ...await original<typeof import("../../../../../lib/auth/runtime")>(), requireRequestSession: vi.fn(), getIdentityRuntime: vi.fn(),
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
const connectorId = "00000000-0000-4000-8000-00000000000a";
const connectorToken = `${connectorId}.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`;
const connectorConfig = { appOrigin: config.appOrigin, chainId: config.chainId,
  sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8) };
const connector: ConnectorRecord = { id: connectorId, workspaceId: identity.workspaceId,
  tokenHash: createConnectorHasher(connectorConfig.connectorPepper)("connector", connectorToken),
  createdAt: "2026-09-01T00:00:00.000Z", expiresAt: "2031-01-01T00:00:00.000Z", revokedAt: null, lastUsedAt: null,
  scopes: ["invoice:publish", "invoice:status"] };
const findConnector = vi.fn<IdentityRepository["findConnector"]>();
const admitConnector = vi.fn<IdentityRepository["admitConnector"]>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL", "0");
  vi.stubEnv("PAYR_AGENT_GATEWAY_ONLY", "false");
  findConnector.mockResolvedValue(connector);
  admitConnector.mockResolvedValue({ outcome: "allowed", workspaceId: identity.workspaceId, tokenId: connectorId });
  vi.mocked(getIdentityRuntime).mockReturnValue({ config: connectorConfig,
    repository: { findConnector, admitConnector } as unknown as IdentityRepository });
  vi.mocked(requireRequestSession).mockResolvedValue(identity);
  vi.mocked(getPublicationConfig).mockReturnValue(config);
  vi.mocked(getPublicationLinkConfig).mockReturnValue(config);
  vi.mocked(getPublicationRepository).mockReturnValue(repository);
  vi.mocked(getPublicationDocumentPort).mockReturnValue({ createOrRead });
  vi.mocked(repository.reserve).mockRejectedValue(new PublicationError("PUBLICATION_IN_PROGRESS"));
  vi.mocked(repository.findReplay).mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

function request(body: unknown = input) {
  return new Request(`https://payrlink.xyz/api/invoices/${invoiceId}/publish`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
function post(value: Request = request(), id = invoiceId) { return POST(value, { params: Promise.resolve({ id }) }); }
function machineRequest(body: unknown = input) {
  const req = request(body);
  req.headers.set("authorization", `Bearer ${connectorToken}`);
  return req;
}
function privateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
function unopened() {
  expect(getPublicationDocumentPort).not.toHaveBeenCalled();
  expect(getPublicationRepository).not.toHaveBeenCalled();
  expect(repository.reserve).not.toHaveBeenCalled();
}

it("gateway cutover blocks direct bearer publication but preserves dashboard publication", async () => {
  vi.stubEnv("PAYR_AGENT_GATEWAY_ONLY", "true");
  expect((await post(machineRequest())).status).toBe(403);
  expect(getIdentityRuntime).not.toHaveBeenCalled();
  unopened();
  expect((await post(request())).status).toBe(409);
  expect(requireRequestSession).toHaveBeenCalledOnce();
});

it("preserves the dashboard mutation session actor and canonical publication service", async () => {
  const req = request();
  const response = await post(req);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(req, true);
  expect(repository.reserve).toHaveBeenCalledExactlyOnceWith({ ...identity, connectorId: null }, expect.objectContaining({ ...input, draftId: invoiceId }));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: "PUBLICATION_IN_PROGRESS" });
  expect(createOrRead).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("admits bearer publication with its actual scope and connector actor, never an owner cookie", async () => {
  const req = machineRequest();
  req.headers.set("cookie", "__Host-payr-session=ignored-owner-session");
  const response = await post(req);
  expect(requireRequestSession).not.toHaveBeenCalled();
  expect(admitConnector).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: connectorId, action: "invoice:publish" }));
  expect(repository.reserve).toHaveBeenCalledExactlyOnceWith({ workspaceId: identity.workspaceId, ownerWallet: null, connectorId },
    expect.objectContaining({ ...input, draftId: invoiceId }));
  expect(response.status).toBe(409);
  privateHeaders(response);
});

it.each(["", "Basic secret", "Bearer", "Bearer bad", `Bearer ${connectorToken}, Bearer other`])(
  "rejects an invalid explicit credential without falling back to cookies (%#)", async (authorization) => {
    const req = request();
    req.headers.set("authorization", authorization);
    req.headers.set("cookie", "__Host-payr-session=ignored-owner-session");
    const response = await post(req);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="Payr"');
    expect(await response.json()).toEqual({ error: { code: "AUTH_REQUIRED" } });
    expect(requireRequestSession).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
    unopened();
    privateHeaders(response);
  },
);

it("rejects a status-only connector before publication admission or body consumption", async () => {
  findConnector.mockResolvedValue({ ...connector, scopes: ["invoice:status"] });
  const req = machineRequest();
  const response = await post(req);
  expect(response.status).toBe(401);
  expect(admitConnector).not.toHaveBeenCalled();
  expect(req.bodyUsed).toBe(false);
  unopened();
});

it.each(["revoked", "expired"])("honors atomic %s connector denial", async () => {
  admitConnector.mockResolvedValue({ outcome: "denied" });
  const response = await post(machineRequest());
  expect(response.status).toBe(401);
  expect(requireRequestSession).not.toHaveBeenCalled();
  unopened();
});

it("returns connector rate limits with Retry-After and no publication work", async () => {
  admitConnector.mockResolvedValue({ outcome: "rate_limited", retryAfterSeconds: 37 });
  const response = await post(machineRequest());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("37");
  expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED" } });
  unopened();
});

it("sanitizes connector infrastructure failures and fails closed", async () => {
  findConnector.mockRejectedValue(new Error(`SECRET ${connectorToken}`));
  const response = await post(machineRequest());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(connectorToken);
  expect(requireRequestSession).not.toHaveBeenCalled();
  unopened();
});

it("rejects foreign Origin on bearer requests", async () => {
  const req = machineRequest();
  req.headers.set("origin", "https://foreign.test");
  const response = await post(req);
  expect(response.status).toBe(403);
  expect(req.bodyUsed).toBe(false);
  unopened();
});

it("uses only the trusted Vercel IP header for machine admission", async () => {
  vi.stubEnv("VERCEL", "1");
  const req = machineRequest();
  req.headers.set("x-forwarded-for", "192.0.2.128");
  expect((await post(req)).status).toBe(401);
  expect(admitConnector).not.toHaveBeenCalled();
  req.headers.set("x-vercel-forwarded-for", "192.0.2.129");
  expect((await post(req)).status).toBe(409);
  expect(admitConnector).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    ipHash: createConnectorHasher(connectorConfig.connectorPepper)("connector-ip", "192.0.2.129"),
  }));
});

it.each([{ approval: false }, { expectedVersion: 0 }, { idempotencyKey: "" }, { workspaceId: identity.workspaceId }])(
  "preserves strict approval validation for bearer calls (%#)", async (change) => {
    expect((await post(machineRequest({ ...input, ...change }))).status).toBe(400);
    unopened();
  },
);

it("does not elevate a connector when the repository denies access to an invoice", async () => {
  vi.mocked(repository.findReplay).mockRejectedValue(new IdentityError("FORBIDDEN", 403));
  const response = await post(machineRequest());
  expect(response.status).toBe(403);
  expect(repository.findReplay).toHaveBeenCalledExactlyOnceWith({ workspaceId: identity.workspaceId, ownerWallet: null, connectorId },
    input.idempotencyKey, expect.any(String));
  expect(repository.reserve).not.toHaveBeenCalled();
  expect(repository.claim).not.toHaveBeenCalled();
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

it.each(["session", "bearer"])("returns the finalized canonical %s result without republishing or implicit send approval", async (auth) => {
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
  const response = await post(auth === "bearer" ? machineRequest() : request());
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
