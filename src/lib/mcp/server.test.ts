// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createInvoiceDraftService } from "../invoices/service";
import { createInvoiceLifecycleService } from "../invoices/lifecycle";
import { createPublicationService } from "../invoices/publication";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import type { DraftRepository, DraftVersion } from "../invoices/contracts";
import { PublicationError, type PublicationRepository, type PublicationStatusData } from "../invoices/publication-contracts";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { handleMcpRequest } from "./transport";

const id = "00000000-0000-4000-8000-000000000003";
const workspaceId = "00000000-0000-4000-8000-000000000001", tokenId = "00000000-0000-4000-8000-000000000002";
function fixture() {
  const snapshot = testPublicationSnapshot(), versions: DraftVersion[] = [];
  const drafts = {
    findReplay: vi.fn().mockResolvedValue(null),
    getContext: vi.fn(async () => ({ sender: snapshot.sender, client: null, previous: versions.at(-1) ?? null, commercialState: "draft" })),
    saveDraft: vi.fn(async (_actor, input) => {
      const version = { id, draftId: id, version: versions.length + 1, snapshot: input.snapshot, createdAt: "2030-01-01T00:00:00Z" };
      versions.push(version); return version;
    }),
  };
  const config = { appOrigin: "https://example.test", explorerOrigin: "https://explorer.test", keys: new Map([[1, new Uint8Array(32).fill(7)]]) };
  const token = createKeyedTokenCodec(config.keys).derive(id, "invoice-bearer", 1), hash = `0x${"3".repeat(64)}` as const;
  const data: PublicationStatusData = { invoiceId: id, invoiceVersion: 1, invoiceNumber: "INV-2030-001", commercialState: "published",
    payableUntil: snapshot.payableUntil, voidedAt: null, settlement: null, receipt: null, deliveries: [], snapshot,
    attempt: { id, workspaceId, invoiceId: id, invoiceVersionId: id, invoiceVersion: 1, invoiceNumber: "INV-2030-001",
      state: "finalized", snapshot, chainId: 5042002, contractAddress: `0x${"2".repeat(40)}`, invoiceKey: hash, publicationSalt: hash,
      storageKey: "private/storage/key", link: { tokenId: id, keyVersion: 1, verifierHash: token.verifierHash, expiresAt: "2031-01-01T00:00:00Z", activatedAt: "2030-01-01T00:00:00Z", revokedAt: null },
      leaseOwner: null, leaseUntil: null, fence: "1", failureCode: null, finalizedAt: "2030-01-01T00:00:00Z",
      artifact: { pdfFilename: "invoice.pdf", contentType: "application/pdf", byteLength: 100, invoiceDataHash: hash, pdfContentHash: hash, documentCommitment: hash, qrVerified: true } },
  };
  const publications = {
    statusData: vi.fn(async (actor, invoiceId) => actor.workspaceId === workspaceId && invoiceId === id ? data : null),
    findReplay: vi.fn(async (actor) => { if (actor.workspaceId !== workspaceId) throw new PublicationError("NOT_FOUND", 404); return data.attempt; }),
    voidInvoice: vi.fn(async (actor, input) => {
      if (actor.workspaceId !== workspaceId || input.invoiceId !== id) throw new PublicationError("NOT_FOUND", 404);
      return { invoiceId: id, invoiceVersion: 1, commercialState: "voided", voidedAt: "2030-01-02T00:00:00Z" };
    }),
  };
  const authenticate = vi.fn().mockResolvedValue({ workspaceId, tokenId });
  async function call(name: string, args: unknown) {
    // Reconstruct every service and server, sharing only fake persisted repositories.
    const lifecycle = createInvoiceLifecycleService(publications as unknown as PublicationRepository, () => config);
    const runtime = { appOrigin: config.appOrigin, authenticate, services: {
      ...createInvoiceDraftService(drafts as unknown as DraftRepository, () => new Date("2030-01-01T00:00:00Z")),
      ...createPublicationService(publications as unknown as PublicationRepository, { getLinkConfig: () => config,
        getDocuments: () => { throw new Error("No rendering on replay"); }, getReservationConfig: () => { throw new Error("No reservation on replay"); } }),
      status: lifecycle.status, void: lifecycle.void,
    } };
    const response = await handleMcpRequest(new Request(`${config.appOrigin}/api/mcp/test-secret`, { method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }), "test-secret", "127.0.0.1", runtime);
    return (await response.json()).result;
  }
  return { call, drafts, publications, authenticate, data, snapshot };
}

it("returns structured missing fields with zero draft writes", async () => {
  const { call, drafts, authenticate } = fixture();
  const result = await call("create_invoice_draft", { idempotencyKey: "missing" });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ code: "MISSING_FIELDS", draftCreated: false, missingFields: expect.arrayContaining([{ path: "client.businessName", reason: "required" }]) });
  expect(drafts.saveDraft).not.toHaveBeenCalled();
  expect(authenticate).toHaveBeenCalledWith({ token: "test-secret", ip: "127.0.0.1", action: "invoice:draft" });
});

it("creates and revises through the same canonical tool with exact preview/defaults", async () => {
  const { call, snapshot, drafts } = fixture();
  const proposed = Object.fromEntries(Object.entries(snapshot.client).map(([key, value]) => [key, { value, confirmed: true, provenance: { kind: "user_provided" } }]));
  const first = await call("create_invoice_draft", { idempotencyKey: "draft", client: { alias: "new", proposed }, items: [{ description: "Work", amount: "1.23" }], useDefaultTerms: true });
  expect(first.structuredContent).toMatchObject({ code: "DRAFT_READY", draftId: id, version: 1, preview: { amountDecimal: "1.23", proposedClientChanges: { kind: "create" } } });
  expect(first.structuredContent.preview.appliedDefaults).toContainEqual({ field: "dueDate", value: "2030-01-31", source: "sender_terms" });
  const revised = await call("create_invoice_draft", { idempotencyKey: "revision", draftId: id, expectedVersion: 1, memo: "Confirmed revision" });
  expect(revised.structuredContent).toMatchObject({ version: 2, preview: { memo: "Confirmed revision" } });
  expect(drafts.saveDraft.mock.calls[0][0]).toEqual({ workspaceId, connectorId: tokenId, ownerWallet: null });
  expect((await call("create_invoice_draft", { idempotencyKey: "stale", draftId: id, expectedVersion: 1 })).structuredContent).toEqual({ code: "VERSION_CONFLICT", draftId: id, currentVersion: 2 });
});

it.each([
  { sender: {} }, { client: { proposed: { payoutWallet: "secret" } } },
  { client: { proposed: { businessName: { value: "x", confirmed: true, provenance: { kind: "saved_profile" } } } } },
  { client: { proposed: { businessName: { value: "x", confirmed: false, provenance: { kind: "user_provided" } } } } },
  { client: { proposed: { businessName: { value: "x", confirmed: true, provenance: { kind: "web_source" } } } } },
  { items: [{ amount: 1.1 }] }, { unknown: "test-secret" }, { draftId: id },
])("canonical validation rejects invalid schemas with no mutation (%#)", async (change) => {
  const { call, drafts } = fixture(); const result = await call("create_invoice_draft", { idempotencyKey: "invalid", ...change });
  expect(result.isError).toBe(true); expect(["INVALID_INPUT", "PROHIBITED_FIELD"]).toContain(result.structuredContent.code);
  expect(JSON.stringify(result)).not.toContain("test-secret"); expect(drafts.saveDraft).not.toHaveBeenCalled();
});

it.each(["publish_invoice", "void_invoice"])("requires exact explicit approval for %s", async (name) => {
  const { call, publications } = fixture();
  for (const approval of [undefined, false, "true"]) {
    expect((await call(name, { [name === "publish_invoice" ? "draftId" : "invoiceId"]: id, expectedVersion: 1, idempotencyKey: "approval", approval })).structuredContent).toEqual({ code: "INVALID_INPUT" });
  }
  expect(publications.findReplay).not.toHaveBeenCalled(); expect(publications.voidInvoice).not.toHaveBeenCalled();
});

it("reconstructs identical publication links and exact Gmail package on a new server without sending", async () => {
  const { call } = fixture(); const input = { draftId: id, expectedVersion: 1, approval: true, idempotencyKey: "replay" };
  const first = await call("publish_invoice", input), second = await call("publish_invoice", input);
  expect(first).toEqual(second); expect(first.isError).toBeUndefined();
  const result = first.structuredContent;
  expect(Object.keys(result.gmailLinkPackage).sort()).toEqual(["htmlBody", "invoicePdfUrl", "paymentUrl", "subject", "textBody", "to"]);
  expect(result.gmailLinkPackage.paymentUrl).toBe(result.invoiceUrl); expect(result.gmailLinkPackage.to).toEqual(["client@example.test"]);
  expect(result.gmailLinkPackage.textBody).toContain(result.invoicePdfUrl); expect(result.sendApprovalRequired).toBe(true);
});

it("returns the canonical complete status with separate receipt and delivery, and explicitly voids", async () => {
  const { call, authenticate } = fixture(); const result = (await call("get_invoice_status", { invoiceId: id })).structuredContent;
  expect(Object.keys(result).sort()).toEqual(["schemaVersion", "invoiceId", "invoiceVersion", "invoiceNumber", "commercialState", "paymentStatus", "displayStatus", "payableUntil", "settlement", "explorer", "settledAfterVoid", "invoiceDocument", "receipt", "receiptEmail"].sort());
  expect(result).toMatchObject({ schemaVersion: "payr.invoice-status.v1", paymentStatus: "unpaid", settlement: null, receiptEmail: { state: "not_applicable", deliveries: [] } });
  expect((await call("get_invoice_status", { invoiceId: id, secret: "extra" })).structuredContent.code).toBe("INVALID_INPUT");
  expect((await call("void_invoice", { invoiceId: id, expectedVersion: 1, approval: true, idempotencyKey: "void" })).structuredContent.commercialState).toBe("voided");
  expect(authenticate.mock.calls.at(-1)?.[0].action).toBe("invoice:void");
});

it.each(["get_invoice_status", "publish_invoice", "void_invoice"])("isolates workspace IDs through canonical repositories for %s", async (name) => {
  const { call, authenticate } = fixture(); authenticate.mockResolvedValue({ workspaceId: "00000000-0000-4000-8000-000000000009", tokenId });
  expect((await call(name, name === "get_invoice_status" ? { invoiceId: id } : { [name === "publish_invoice" ? "draftId" : "invoiceId"]: id, expectedVersion: 1, approval: true, idempotencyKey: "foreign" })).structuredContent.code).toBe("NOT_FOUND");
});
