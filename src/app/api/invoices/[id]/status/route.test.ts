// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdentityEnv } from "../../../../../config/env";
import { requireRequestSession } from "../../../../../lib/auth/runtime";
import { createSessionCodec } from "../../../../../lib/auth/session";
import { SESSION_COOKIE } from "../../../../../lib/identity/contracts";
import { PublicationError, type PublicationRepository, type PublicationStatusData } from "../../../../../lib/invoices/publication-contracts";
import { getPublicationDocumentPort, getPublicationLinkConfig, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";
import { testPublicationSnapshot } from "../../../../../lib/invoices/publication.test-support";
import { createKeyedTokenCodec } from "../../../../../lib/security/keyed-token";
import { GET } from "./route";
import { POST as share } from "../share/route";
import { POST as voidInvoice } from "../void/route";

vi.mock("../../../../../config/env", async (original) => ({
  ...await original<typeof import("../../../../../config/env")>(), createIdentityEnv: vi.fn(),
}));
vi.mock("../../../../../lib/auth/runtime", async (original) => {
  const actual = await original<typeof import("../../../../../lib/auth/runtime")>();
  return { ...actual, requireRequestSession: vi.fn(actual.requireRequestSession) };
});
vi.mock("../../../../../lib/invoices/publication-runtime", async (original) => {
  const actual = await original<typeof import("../../../../../lib/invoices/publication-runtime")>();
  return { ...actual, getPublicationRepository: vi.fn(), getPublicationLinkConfig: vi.fn(),
    getPublicationDocumentPort: vi.fn(actual.getPublicationDocumentPort) };
});

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const identity = { workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ownerWallet: `0x${"1".repeat(40)}` };
const actor = { ...identity, connectorId: null };
const identityConfig = { appOrigin: "https://payr.test", chainId: 5042002, sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8) };
const linkConfig = { appOrigin: "https://payr.test", explorerOrigin: "https://explorer.test", activeKeyVersion: 1, keys: new Map([[1, new Uint8Array(32).fill(9)]]) };
const token = createKeyedTokenCodec(linkConfig.keys).derive(id, "invoice-bearer", 1);
const invoiceUrl = `https://payr.test/invoice/${token.slug}`;
const hash = `0x${"2".repeat(64)}` as const;
const approved = { expectedVersion: 1, approval: true, idempotencyKey: "void-1" };
const voidResult = { invoiceId: id, invoiceVersion: 1, commercialState: "voided", voidedAt: "2026-09-06T00:00:00.000Z" };
const repository = { statusData: vi.fn(), voidInvoice: vi.fn() };
let cookie: string;

function published(): PublicationStatusData {
  const snapshot = testPublicationSnapshot();
  return {
    invoiceId: id, invoiceVersion: 1, invoiceNumber: "INV-2030-000001", commercialState: "published", payableUntil: snapshot.payableUntil,
    snapshot, voidedAt: null, settlement: null, receipt: null, deliveries: [],
    attempt: {
      id, workspaceId: identity.workspaceId, invoiceId: id, invoiceVersionId: id, invoiceVersion: 1, invoiceNumber: "INV-2030-000001",
      state: "finalized", snapshot, chainId: 5042002, contractAddress: `0x${"3".repeat(40)}`, invoiceKey: hash, publicationSalt: hash,
      storageKey: "private/object", link: { tokenId: id, keyVersion: 1, verifierHash: token.verifierHash,
        activatedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2031-01-01T00:00:00.000Z", revokedAt: null },
      leaseOwner: null, leaseUntil: null, fence: "1", failureCode: null, finalizedAt: "2026-01-01T00:00:00.000Z",
      artifact: { pdfFilename: "INV-2030-000001.pdf", contentType: "application/pdf", byteLength: 100,
        invoiceDataHash: hash, pdfContentHash: hash, documentCommitment: hash, qrVerified: true },
    },
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-01-02T00:00:00.000Z"));
  vi.mocked(createIdentityEnv).mockReturnValue(identityConfig);
  vi.mocked(getPublicationRepository).mockReturnValue(repository as unknown as PublicationRepository);
  vi.mocked(getPublicationLinkConfig).mockReturnValue(linkConfig);
  repository.statusData.mockReset().mockResolvedValue(published());
  repository.voidInvoice.mockReset().mockResolvedValue(voidResult);
  cookie = `${SESSION_COOKIE}=${await createSessionCodec(identityConfig).seal(identity)}`;
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const routes = [
  { name: "status", method: "GET", call: GET, body: undefined, mutation: false },
  { name: "share", method: "POST", call: share, body: "{}", mutation: true },
  { name: "void", method: "POST", call: voidInvoice, body: JSON.stringify(approved), mutation: true },
];

describe.each(routes)("$name route", ({ name, method, call, body, mutation }) => {
  function request(query = "", headers: Record<string, string> = {}) {
    return new Request(`https://payr.test/api/invoices/${id}/${name}${query}`, {
      method, body, headers: { cookie, host: "payr.test", origin: "https://payr.test", "content-type": "application/json", ...headers },
    });
  }
  const context = () => ({ params: Promise.resolve({ id }) });

  if (name === "void") it("voids and replays without requiring any link or explorer configuration", async () => {
    vi.mocked(getPublicationLinkConfig).mockImplementation(() => { throw new PublicationError("CONFIGURATION_ERROR", 503); });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await call(request(), context());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(voidResult);
    }
    expect(getPublicationLinkConfig).not.toHaveBeenCalled();
    expect(repository.voidInvoice).toHaveBeenCalledTimes(2);
  });

  it("authenticates before lazy factories and reads existing records without a document provider or network", async () => {
    const req = request();
    const response = await call(req, context());
    expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(req, mutation);
    expect(vi.mocked(requireRequestSession).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getPublicationRepository).mock.invocationCallOrder[0]);
    if (name === "void") expect(getPublicationLinkConfig).not.toHaveBeenCalled();
    else expect(vi.mocked(requireRequestSession).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getPublicationLinkConfig).mock.invocationCallOrder[0]);
    expect(response.status).toBe(200);
    const dto = await response.json();
    if (name === "status") {
      expect(repository.statusData).toHaveBeenCalledExactlyOnceWith(actor, id);
      expect(dto.schemaVersion).toBe("payr.invoice-status.v1");
      expect(dto.invoiceDocument.pageUrl).toBe(invoiceUrl);
    } else if (name === "share") {
      expect(repository.statusData).toHaveBeenCalledExactlyOnceWith(actor, id);
      expect(dto).toEqual({ invoiceUrl, invoicePdfUrl: `${invoiceUrl}/pdf`, pdfFilename: "INV-2030-000001.pdf" });
    } else {
      expect(repository.voidInvoice).toHaveBeenCalledExactlyOnceWith(actor, { ...approved, invoiceId: id, requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) });
      expect(repository.statusData).not.toHaveBeenCalled();
      expect(dto).toEqual(voidResult);
    }
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(getPublicationDocumentPort).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["", "malformed", "duplicate"])("rejects missing/invalid/ambiguous sessions (%s), even with a connector bearer", async (kind) => {
    const response = await call(request("?workspaceId=other", {
      cookie: kind === "duplicate" ? `${cookie}; ${cookie}` : kind,
      authorization: "Bearer connector-token",
    }), context());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "AUTH_REQUIRED" } });
    expect(getPublicationRepository).not.toHaveBeenCalled();
    expect(getPublicationLinkConfig).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["?workspaceId=other", "?id=other", "?approval=true", "?unknown=1", "?x=1&x=2"])("rejects query input %s before repository creation", async (query) => {
    const response = await call(request(query), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
    expect(getPublicationRepository).not.toHaveBeenCalled();
    expect(getPublicationLinkConfig).not.toHaveBeenCalled();
  });

  it("rejects malformed route IDs before repository creation", async () => {
    const response = await call(request(), { params: Promise.resolve({ id: "invalid" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NOT_FOUND" });
    expect(getPublicationRepository).not.toHaveBeenCalled();
  });

  it("returns private 404s for absent or foreign records", async () => {
    repository.statusData.mockResolvedValue(null);
    repository.voidInvoice.mockRejectedValue(new PublicationError("NOT_FOUND", 404));
    const response = await call(request(), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NOT_FOUND" });
  });

  it("redacts provider errors without logs", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    repository.statusData.mockRejectedValue(new Error("SECRET_PROVIDER_ERROR"));
    repository.voidInvoice.mockRejectedValue(new Error("SECRET_PROVIDER_ERROR"));
    const response = await call(request(), context());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(error).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  if (mutation) {
    it.each([{ origin: "" }, { origin: "https://evil.test" }, { host: "evil.test" }] as Array<Record<string, string>>)("enforces real CSRF origin/host validation for %j", async (headers) => {
      const response = await call(request("", headers), context());
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "ORIGIN_NOT_ALLOWED" } });
      expect(getPublicationRepository).not.toHaveBeenCalled();
      expect(getPublicationLinkConfig).not.toHaveBeenCalled();
    });
  } else {
    it("does not require a POST origin for authenticated GET", async () => {
      const response = await call(request("", { origin: "", host: "" }), context());
      expect(response.status).toBe(200);
    });
    it("rejects a GET body", async () => {
      const req = request();
      Object.defineProperty(req, "body", { value: new ReadableStream() });
      const response = await call(req, context());
      expect(response.status).toBe(400);
      expect(getPublicationRepository).not.toHaveBeenCalled();
    });
  }
});

it.each([undefined, "", "{}"])('accepts only empty share input (%s)', async (body) => {
  const request = new Request(`https://payr.test/api/invoices/${id}/share`, { method: "POST", body,
    headers: { cookie, host: "payr.test", origin: "https://payr.test", ...(body === undefined ? {} : { "content-type": "application/json" }) } });
  expect((await share(request, { params: Promise.resolve({ id }) })).status).toBe(200);
});

describe.each([{ name: "share", call: share }, { name: "void", call: voidInvoice }])("$name strict body", ({ name, call }) => {
  it.each(["null", "[]", "true", '"text"', '{"workspaceId":"other"}', '{"invoiceId":"other"}', '{"approval":false}', '{"send":true}', "{", " "])("rejects invalid body %s", async (body) => {
    const response = await call(new Request(`https://payr.test/api/invoices/${id}/${name}`, { method: "POST", body,
      headers: { cookie, host: "payr.test", origin: "https://payr.test", "content-type": "application/json" } }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    expect(getPublicationRepository).not.toHaveBeenCalled();
    expect(getPublicationLinkConfig).not.toHaveBeenCalled();
  });

  it.each([
    { headers: { "content-type": "text/plain" }, body: "{}", status: 415 },
    { headers: { "content-encoding": "gzip" }, body: "{}", status: 415 },
    { headers: { "content-length": "999999" }, body: "{}", status: 413 },
    { headers: {}, body: " ".repeat(16385), status: 413 },
  ] as Array<{ headers: Record<string, string>; body: string; status: number }>)("bounds and validates JSON transport %#", async ({ headers, body, status }) => {
    const response = await call(new Request(`https://payr.test/api/invoices/${id}/${name}`, { method: "POST", body,
      headers: { cookie, host: "payr.test", origin: "https://payr.test", "content-type": "application/json", ...headers } }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(status);
    expect(getPublicationRepository).not.toHaveBeenCalled();
  });

  it("rejects malformed UTF-8 rather than replacing invalid bytes", async () => {
    const response = await call(new Request(`https://payr.test/api/invoices/${id}/${name}`, { method: "POST", body: new Uint8Array([0xff]),
      headers: { cookie, host: "payr.test", origin: "https://payr.test", "content-type": "application/json" } }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    expect(getPublicationRepository).not.toHaveBeenCalled();
  });
});

it.each([{}, { ...approved, approval: false }, { ...approved, expectedVersion: "1" }, { ...approved, expectedVersion: 0 }, { ...approved, idempotencyKey: "" }, { ...approved, invoiceId: id }])("rejects incomplete, unapproved and overridden void bodies %#", async (body) => {
  const response = await voidInvoice(new Request(`https://payr.test/api/invoices/${id}/void`, { method: "POST", body: JSON.stringify(body),
    headers: { cookie, host: "payr.test", origin: "https://payr.test", "content-type": "application/json" } }), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(400);
  expect(getPublicationRepository).not.toHaveBeenCalled();
});

it.each([
  '{"expectedVersion":1,"approval":false,"approval":true,"idempotencyKey":"void-1"}',
  '{"expectedVersion":2,"expectedVersion":1,"approval":true,"idempotencyKey":"void-1"}',
  '{"expectedVersion":1,"approval":false,"approv\\u0061l":true,"idempotencyKey":"void-1"}',
])("rejects ambiguous duplicate void fields %# before repository creation", async (body) => {
  const response = await voidInvoice(new Request(`https://payr.test/api/invoices/${id}/void`, { method: "POST", body,
    headers: { cookie, host: "payr.test", origin: "https://payr.test", "content-type": "application/json" } }), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(400);
  expect(getPublicationRepository).not.toHaveBeenCalled();
});

it("treats escaped JSON inside an idempotency key as literal data, not another approval field", async () => {
  const idempotencyKey = 'literal: "approval":false, "expectedVersion":99';
  const response = await voidInvoice(new Request(`https://payr.test/api/invoices/${id}/void`, {
    method: "POST", body: JSON.stringify({ ...approved, idempotencyKey }),
    headers: { cookie, host: "payr.test", origin: "https://payr.test", "content-type": "application/json" },
  }), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  expect(repository.voidInvoice.mock.calls[0][1].idempotencyKey).toBe(idempotencyKey);
});

it.each(["IDEMPOTENCY_CONFLICT", "VERSION_CONFLICT", "INVOICE_NOT_VOIDABLE"])("returns safe atomic void conflict %s without a lifecycle pre-read", async (code) => {
  repository.voidInvoice.mockRejectedValue(Object.assign(new PublicationError(code), { providerData: "PRIVATE" }));
  const response = await voidInvoice(new Request(`https://payr.test/api/invoices/${id}/void`, { method: "POST", body: JSON.stringify(approved),
    headers: { cookie, host: "payr.test", origin: "https://payr.test", "content-type": "application/json" } }), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code });
  expect(repository.statusData).not.toHaveBeenCalled();
});

it.each(["inactive", "revoked", "unknownKey"])("fails explicit share closed for %s", async (reason) => {
  const value = published();
  if (reason === "inactive") value.attempt!.link.activatedAt = null;
  if (reason === "revoked") value.attempt!.link.revokedAt = "2030-01-01T00:00:00.000Z";
  if (reason === "unknownKey") value.attempt!.link.keyVersion = 999;
  repository.statusData.mockResolvedValue(value);
  const response = await share(new Request(`https://payr.test/api/invoices/${id}/share`, { method: "POST",
    headers: { cookie, host: "payr.test", origin: "https://payr.test" } }), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "LINK_UNAVAILABLE" });
  expect(getPublicationDocumentPort).not.toHaveBeenCalled();
});

it("imports routes without reading runtime configuration or requiring the unavailable production document port", async () => {
  vi.resetModules();
  await import("./route");
  await import("../share/route");
  await import("../void/route");
  expect(createIdentityEnv).not.toHaveBeenCalled();
  expect(getPublicationRepository).not.toHaveBeenCalled();
  expect(getPublicationLinkConfig).not.toHaveBeenCalled();
  expect(getPublicationDocumentPort).not.toHaveBeenCalled();
  expect(() => getPublicationDocumentPort()).toThrow("DOCUMENTS_NOT_CONFIGURED");
});
