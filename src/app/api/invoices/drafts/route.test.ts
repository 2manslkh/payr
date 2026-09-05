// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { requireRequestSession } from "../../../../lib/auth/runtime";
import { IdentityError } from "../../../../lib/identity/contracts";
import type { DraftRepository, DraftVersion } from "../../../../lib/invoices/contracts";
import { DraftError } from "../../../../lib/invoices/errors";
import { getDraftRepository } from "../../../../lib/invoices/runtime";
import { POST } from "./route";

vi.mock("../../../../lib/auth/runtime", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../lib/auth/runtime")>(), requireRequestSession: vi.fn(),
}));
vi.mock("../../../../lib/invoices/runtime", () => ({ getDraftRepository: vi.fn() }));

const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` };
const repository: DraftRepository = {
  findReplay: vi.fn(), getContext: vi.fn(), saveDraft: vi.fn(),
  listInvoices: vi.fn(), getInvoiceDetail: vi.fn(), getOverview: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRequestSession).mockResolvedValue(identity);
  vi.mocked(getDraftRepository).mockReturnValue(repository);
  vi.mocked(repository.findReplay).mockResolvedValue(null);
  vi.mocked(repository.getContext).mockResolvedValue({ sender: null, client: null, previous: null, commercialState: null });
});

function post(body: unknown) {
  return new Request("https://payrlink.xyz/api/invoices/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function privateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("content-type")).toContain("application/json");
}

it("authorizes a mutation with F2 and returns the exact missing-fields envelope without saving", async () => {
  const request = post({ idempotencyKey: "missing" });
  const response = await POST(request);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request, true);
  expect(repository.findReplay).toHaveBeenCalledWith({ ...identity, connectorId: null }, "missing", expect.stringMatching(/^[a-f0-9]{64}$/));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    code: "MISSING_FIELDS", draftCreated: false, missingFields: [
      ...["businessName", "billingAddress", "contactName", "contactEmail", "payoutWallet", "invoicePrefix"].map((field) => ({ path: `sender.${field}`, reason: "required" })),
      ...["businessName", "billingAddress", "contactName", "contactEmail"].map((field) => ({ path: `client.${field}`, reason: "required" })),
      { path: "dueDate", reason: "required" }, { path: "items", reason: "required" },
    ],
  });
  expect(repository.saveDraft).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each([
  ["AUTH_REQUIRED", 401], ["ORIGIN_NOT_ALLOWED", 403], ["FORBIDDEN", 403], ["CONFIGURATION_ERROR", 503],
])("preserves safe F2 %s errors before reading the body or opening the repository", async (code, status) => {
  vi.mocked(requireRequestSession).mockRejectedValue(new IdentityError(String(code), Number(status)));
  const request = post({ actor: "arbitrary" });
  const response = await POST(request);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code } });
  expect(request.bodyUsed).toBe(false);
  expect(getDraftRepository).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each([
  new Error("SECRET provider error"), new IdentityError("SECRET", 401),
  new DraftError("SECRET", 400, { draftId: "SECRET" }), { code: "VERSION_CONFLICT", status: 409, details: "SECRET" },
])("uses the F2 safe fallback for unexpected errors (%#)", async (error) => {
  vi.mocked(repository.findReplay).mockRejectedValue(error);
  const response = await POST(post({ idempotencyKey: "key" }));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
  privateHeaders(response);
});

it.each(["PROHIBITED_FIELD", "NOT_FOUND", "IDEMPOTENCY_CONFLICT", "PROFILE_CONFLICT", "DRAFT_NOT_EDITABLE"])("returns only %s without private snapshots or provider details", async (code) => {
  vi.mocked(repository.findReplay).mockRejectedValue(new DraftError(code, 200, { draftId: "SECRET", fieldIssues: [{ path: "SECRET", reason: "SECRET" }] }));
  const response = await POST(post({ idempotencyKey: "key" }));
  expect(response.status).toBe(code === "PROHIBITED_FIELD" ? 400 : code === "NOT_FOUND" ? 404 : 409);
  expect(await response.json()).toEqual({ code });
  expect(repository.getContext).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("returns the exact version-conflict envelope with only the current draft ID and version", async () => {
  vi.mocked(repository.findReplay).mockRejectedValue(new DraftError("VERSION_CONFLICT", 409, {
    draftId: identity.workspaceId, currentVersion: 4, fieldIssues: [{ path: "SECRET", reason: "SECRET" }],
  }));
  const response = await POST(post({ idempotencyKey: "key" }));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: "VERSION_CONFLICT", draftId: identity.workspaceId, currentVersion: 4 });
  privateHeaders(response);
});

it.each([{ draftId: "SECRET", currentVersion: 1 }, { draftId: identity.workspaceId, currentVersion: 0 }, { draftId: identity.workspaceId, currentVersion: 1.5 }, {}])("does not reflect malformed version details (%#)", async (details) => {
  vi.mocked(repository.findReplay).mockRejectedValue(new DraftError("VERSION_CONFLICT", 409, details));
  const response = await POST(post({ idempotencyKey: "key" }));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
  privateHeaders(response);
});

it.each([
  { workspaceId: "SECRET" }, { ownerWallet: "SECRET" }, { actor: { workspaceId: "SECRET" } },
  { items: [{ amount: "SECRET" }] }, { client: { proposed: { contactName: { value: "SECRET", confirmed: false, provenance: { kind: "user_provided" } } } } },
])("validates every supplied field and never uses body actors (%#)", async (value) => {
  const response = await POST(post({ idempotencyKey: "key", ...value }));
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body).toEqual({ code: "INVALID_INPUT", fieldIssues: expect.any(Array) });
  expect(JSON.stringify(body)).not.toContain("SECRET");
  expect(getDraftRepository).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("rejects nested authority aliases rather than treating them as omissions", async () => {
  const response = await POST(post({ idempotencyKey: "key", client: { proposed: { billingAddress: { value: { PAYOUT_WALLET: "SECRET" } } } } }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "PROHIBITED_FIELD" });
  expect(getDraftRepository).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("returns a real service replay in the success envelope under only the session actor", async () => {
  const address = { line1: "1 Main St", city: "London", postalCode: "SW1A 1AA", countryCode: "GB" };
  const version: DraftVersion = {
    id: identity.workspaceId, draftId: identity.workspaceId, version: 2, createdAt: "2026-09-06T00:00:00.000Z",
    snapshot: {
      schemaVersion: "payr.draft.v1",
      sender: { id: identity.workspaceId, revision: 1, businessName: "Sender", billingAddress: address, contactName: "Owner", contactEmail: "owner@example.com", payoutWallet: identity.ownerWallet, invoicePrefix: "INV", defaultPaymentTermsDays: null },
      client: { businessName: "Client", billingAddress: address, contactName: "Client", contactEmail: "client@example.com" },
      clientReference: { id: identity.workspaceId, alias: "Client", revision: 1 },
      clientProvenance: { businessName: { kind: "saved_profile" }, billingAddress: { kind: "saved_profile" }, contactName: { kind: "saved_profile" }, contactEmail: { kind: "saved_profile" } },
      proposedClientChanges: { kind: "none", fields: {} },
      items: [{ description: "<script>not HTML</script>", amountDecimal: "1", amountAtomic: "1000000000000000000" }],
      issueDate: "2026-09-06", dueDate: "2026-09-06", payableUntil: "2026-10-06T00:00:00.000Z",
      amountDecimal: "1", amountAtomic: "1000000000000000000", memo: "", appliedDefaults: [],
    },
  };
  vi.mocked(repository.findReplay).mockResolvedValue(version);
  const request = post({ idempotencyKey: "key", draftId: identity.workspaceId, expectedVersion: 1 });
  const response = await POST(request);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["approvalInstruction", "canonicalInvoiceJson", "code", "draftCreated", "draftId", "preview", "previewText", "version"]);
  expect(body).toMatchObject({ code: "DRAFT_READY", draftCreated: true, draftId: version.draftId, version: 2, preview: version.snapshot });
  expect(JSON.parse(body.canonicalInvoiceJson)).toEqual(version.snapshot);
  expect(body.approvalInstruction).toContain("version 2");
  expect(repository.findReplay).toHaveBeenCalledWith({ ...identity, connectorId: null }, "key", expect.any(String));
  expect(repository.getContext).not.toHaveBeenCalled();
  expect(repository.saveDraft).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each(["{", "", "null", "[]", "true", "1", '{"idempotencyKey":"key",}', '{"idempotencyKey":"key"} trailing'])("rejects malformed or non-object JSON (%s)", async (body) => {
  const response = await POST(new Request("https://payrlink.xyz/api/invoices/drafts", { method: "POST", headers: { "content-type": "application/json" }, body }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT", fieldIssues: expect.any(Array) });
  expect(getDraftRepository).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each([
  '{"idempotencyKey":"first","idempotencyKey":"second"}',
  '{"idempotencyKey":"key","client":{"proposed":{"sender":"SECRET"}},"client":{}}',
  '{"idempotencyKey":"key","client":{"alias":"a","ali\\u0061s":"b"}}',
])("rejects duplicate JSON keys, including escaped and overwritten nested keys (%#)", async (body) => {
  const response = await POST(new Request("https://payrlink.xyz/api/invoices/drafts", { method: "POST", headers: { "content-type": "application/json" }, body }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT", fieldIssues: [{ path: "$", reason: "invalid_json" }] });
  expect(getDraftRepository).not.toHaveBeenCalled();
});

it("does not confuse quoted JSON-shaped text or repeated keys in separate objects with duplicate keys", async () => {
  const response = await POST(post({
    idempotencyKey: "key", memo: '{"key":"one","key":"two","nested":[{}]}',
    items: [{ description: 'Text: "quote" and \\ backslash', amount: "1" }, { description: "Another", amount: "2" }],
  }));
  expect(response.status).toBe(422);
  expect((await response.json()).code).toBe("MISSING_FIELDS");
  expect(repository.getContext).toHaveBeenCalledOnce();
});

it.each([
  { "content-type": "text/plain" }, { "content-type": "application/json", "content-encoding": "gzip" },
  { "content-type": "application/json; charset=latin1" },
])("rejects unsupported media and content encoding (%#)", async (headers) => {
  const response = await POST(new Request("https://payrlink.xyz/api/invoices/drafts", { method: "POST", headers: headers as Record<string, string>, body: "{}" }));
  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({ code: "UNSUPPORTED_MEDIA_TYPE" });
  expect(getDraftRepository).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("accepts exactly 64 KiB including whitespace and rejects one more actual byte regardless of Content-Length", async () => {
  const json = JSON.stringify({ idempotencyKey: "key" });
  const body = json + " ".repeat(65536 - Buffer.byteLength(json));
  for (const [text, status] of [[body, 422], [body + " ", 413]] as const) {
    const response = await POST(new Request("https://payrlink.xyz/api/invoices/drafts", { method: "POST", headers: { "content-type": "application/json; charset=utf-8", "content-length": "1" }, body: text }));
    expect(response.status).toBe(status);
    privateHeaders(response);
  }
});

it.each(["65537", "-1", "not-a-length"])("rejects oversized or invalid declared lengths before consuming the body (%s)", async (length) => {
  const request = post({ idempotencyKey: "key" });
  request.headers.set("content-length", length);
  const response = await POST(request);
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ code: "PAYLOAD_TOO_LARGE" });
  expect(request.bodyUsed).toBe(false);
  expect(getDraftRepository).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("cancels a chunked UTF-8 body at the byte bound rather than buffering unbounded data", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('"' + "\u00e9".repeat(16384)));
      controller.enqueue(new TextEncoder().encode("\u00e9".repeat(16384)));
    }, cancel,
  });
  const response = await POST(new Request("https://payrlink.xyz/api/invoices/drafts", {
    method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half",
  } as RequestInit));
  expect(response.status).toBe(413);
  expect(cancel).toHaveBeenCalledOnce();
  expect(getDraftRepository).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("sanitizes invalid UTF-8 and streaming failures", async () => {
  for (const body of [new Uint8Array([0xff]), new ReadableStream({ start(controller) { controller.error(new Error("SECRET")); } })]) {
    const response = await POST(new Request("https://payrlink.xyz/api/invoices/drafts", {
      method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half",
    } as RequestInit));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_INPUT", fieldIssues: [{ path: "$", reason: "invalid_json" }] });
    privateHeaders(response);
  }
  expect(getDraftRepository).not.toHaveBeenCalled();
});

it("rejects excessive nesting at the route boundary", async () => {
  const body = '{"idempotencyKey":"key","unknown":' + "[".repeat(33) + "0" + "]".repeat(33) + "}";
  const response = await POST(new Request("https://payrlink.xyz/api/invoices/drafts", { method: "POST", headers: { "content-type": "application/json" }, body }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT", fieldIssues: [{ path: "$", reason: "invalid_json" }] });
  expect(getDraftRepository).not.toHaveBeenCalled();
});
