import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { InvoiceActor } from "./contracts";
import { COMMERCIAL_STATES } from "../domain/invoice";
import type { DeliveryStatus, SettlementStatus } from "../domain/status";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { createInvoiceLifecycleService, publicationView } from "./lifecycle";
import { PublicationError, type PublicationLinkConfig, type PublicationRepository, type PublicationStatusData, type VoidWrite } from "./publication-contracts";
import { testPublicationSnapshot } from "./publication.test-support";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor: InvoiceActor = { workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ownerWallet: `0x${"1".repeat(40)}`, connectorId: null };
const now = new Date("2030-01-02T00:00:00.000Z");
const hash = `0x${"3".repeat(64)}` as const;
const config: PublicationLinkConfig = {
  appOrigin: "https://payr.test", explorerOrigin: "https://explorer.test",
  keys: new Map([[1, new Uint8Array(32).fill(7)]]),
};
const codec = createKeyedTokenCodec(config.keys);
const invoiceToken = codec.derive(id, "invoice-bearer", 1);
const receiptToken = codec.derive(actor.workspaceId, "receipt-bearer", 1);
const invoiceUrl = `https://payr.test/invoice/${invoiceToken.slug}`;
const receiptUrl = `https://payr.test/receipt/${receiptToken.slug}`;
const settlement: SettlementStatus = {
  chainId: 5042002, contractAddress: `0x${"2".repeat(40)}`, invoiceVersion: 1,
  transactionHash: hash, logIndex: 2, blockNumber: "123", blockTime: now.toISOString(),
  payer: `0x${"4".repeat(40)}`, payee: `0x${"5".repeat(40)}`,
  amountDecimal: "1.23", amountAtomic: "1230000000000000000", documentCommitment: hash,
};

function data(overrides: Partial<PublicationStatusData> = {}): PublicationStatusData {
  return {
    invoiceId: id, invoiceVersion: 1, invoiceNumber: null, commercialState: "draft", payableUntil: null,
    voidedAt: null, snapshot: null, attempt: null, settlement: null, receipt: null, deliveries: [], ...overrides,
  };
}

function published(): PublicationStatusData {
  const snapshot = testPublicationSnapshot();
  return data({
    invoiceNumber: "INV-2030-000001", commercialState: "published", payableUntil: snapshot.payableUntil, snapshot,
    attempt: {
      id, workspaceId: actor.workspaceId, invoiceId: id, invoiceVersionId: id, invoiceVersion: 1,
      invoiceNumber: "INV-2030-000001", state: "finalized", snapshot, chainId: 5042002,
      contractAddress: settlement.contractAddress, invoiceKey: hash, publicationSalt: hash, storageKey: "private/storage/key",
      link: { tokenId: id, keyVersion: 1, verifierHash: invoiceToken.verifierHash, expiresAt: "2031-03-02T00:00:00.000Z", activatedAt: "2030-01-01T00:00:00.000Z", revokedAt: null },
      leaseOwner: null, leaseUntil: null, fence: "1", failureCode: null, finalizedAt: "2030-01-01T00:00:00.000Z",
      artifact: { pdfFilename: "INV-2030-000001.pdf", contentType: "application/pdf", byteLength: 100,
        invoiceDataHash: hash, pdfContentHash: hash, documentCommitment: hash, qrVerified: true },
    },
  });
}

function readyReceipt(): NonNullable<PublicationStatusData["receipt"]> {
  return {
    state: "ready", artifact: { pdfFilename: "receipt.pdf", pdfContentHash: hash },
    link: { tokenId: actor.workspaceId, keyVersion: 1, verifierHash: receiptToken.verifierHash,
      expiresAt: "2031-01-01T00:00:00.000Z", activatedAt: now.toISOString(), revokedAt: null },
  };
}

function delivery(state: DeliveryStatus["state"]): DeliveryStatus {
  return { roles: ["issuer", "client"], normalizedRecipient: "client@example.test", state,
    providerMessageId: null, attemptCount: 0, nextAttemptAt: null };
}

function setup(value: PublicationStatusData | null, linkConfig = config) {
  const repository = { statusData: vi.fn().mockResolvedValue(value), voidInvoice: vi.fn() };
  return { repository, service: createInvoiceLifecycleService(repository as unknown as PublicationRepository, () => linkConfig, () => now) };
}

it("returns the exact default DTO with explicit nulls and no document or email before settlement", async () => {
  const { service, repository } = setup(data());
  expect(await service.status(actor, id)).toEqual({
    schemaVersion: "payr.invoice-status.v1", invoiceId: id, invoiceVersion: 1, invoiceNumber: null,
    commercialState: "draft", paymentStatus: "unpaid", displayStatus: "Draft", payableUntil: null,
    settlement: null, explorer: null, settledAfterVoid: false, invoiceDocument: null,
    receipt: { state: "not_applicable", pageUrl: null, pdfUrl: null, pdfFilename: null, pdfContentHash: null },
    receiptEmail: { state: "not_applicable", deliveries: [] },
  });
  expect(repository.statusData).toHaveBeenCalledExactlyOnceWith(actor, id);
});

describe.each(COMMERCIAL_STATES)("%s commercial state", (commercialState) => {
  it.each([false, true])("derives Paid only from settlement (present: %s)", async (paid) => {
    const value = published();
    value.commercialState = commercialState;
    value.settlement = paid ? settlement : null;
    const { service } = setup(value);
    const result = await service.status(actor, id);
    expect(result.commercialState).toBe(commercialState);
    expect(result.paymentStatus).toBe(paid ? "paid" : "unpaid");
    expect(result.displayStatus).toBe(paid ? "Paid" : { draft: "Draft", published: "Published", voided: "Voided", expired: "Expired" }[commercialState]);
    expect(result.settlement).toEqual(paid ? settlement : null);
    expect(result.explorer).toEqual(paid ? { transactionUrl: `https://explorer.test/tx/${hash}` } : null);
  });
});

it.each(COMMERCIAL_STATES.flatMap((commercialState) => [false, true].flatMap((paid) =>
  ([null, "pending", "rendering", "retry_wait", "ready", "failed"] as const).map((receiptState) => ({ commercialState, paid, receiptState })),
)))("keeps commercial/payment/receipt axes independent: $commercialState, paid=$paid, receipt=$receiptState", async ({ commercialState, paid, receiptState }) => {
  const value = published();
  value.commercialState = commercialState;
  value.settlement = paid ? settlement : null;
  value.receipt = receiptState === null ? null : { ...readyReceipt(), state: receiptState };
  value.deliveries = [delivery("sent")];
  const result = await setup(value).service.status(actor, id);
  expect(result.commercialState).toBe(commercialState);
  expect(result.paymentStatus).toBe(paid ? "paid" : "unpaid");
  expect(result.displayStatus).toBe(paid ? "Paid" : { draft: "Draft", published: "Published", voided: "Voided", expired: "Expired" }[commercialState]);
  expect(result.receipt.state).toBe(paid && receiptState ? receiptState : "not_applicable");
  expect(result.receipt.pageUrl).toBe(paid && receiptState === "ready" ? receiptUrl : null);
  expect(result.receiptEmail.state).toBe(paid ? "sent" : "not_applicable");
  expect(result.invoiceDocument?.pdfContentHash).toBe(hash);
});

it.each([-1, 0, 1])("applies the exact technical deadline boundary (%s ms) without erasing artifact proof", async (offset) => {
  const value = published();
  value.payableUntil = new Date(now.getTime() + offset).toISOString();
  const result = await setup(value).service.status(actor, id);
  expect(result.commercialState).toBe(offset <= 0 ? "expired" : "published");
  expect(result.invoiceDocument).toEqual({ state: "ready", pageUrl: invoiceUrl, pdfUrl: `${invoiceUrl}/pdf`, pdfFilename: "INV-2030-000001.pdf", pdfContentHash: hash });
});

it.each([-1, 0, 1])("settledAfterVoid uses strict block time comparison (%s ms)", async (offset) => {
  const value = published();
  value.commercialState = "voided";
  value.voidedAt = now.toISOString();
  value.attempt!.link.revokedAt = now.toISOString();
  value.settlement = { ...settlement, blockTime: new Date(now.getTime() + offset).toISOString() };
  const result = await setup(value).service.status(actor, id);
  expect(result.settledAfterVoid).toBe(offset > 0);
  expect(result.displayStatus).toBe("Paid");
  expect(result.commercialState).toBe("voided");
  expect(result.invoiceDocument?.pdfContentHash).toBe(hash);
});

it.each(["reserved", "rendering", "stored", "failed"] as const)("never exposes an artifact or token for an unfinalized %s attempt", async (state) => {
  const value = published();
  value.attempt!.state = state;
  value.attempt!.finalizedAt = null;
  value.attempt!.link.keyVersion = 999;
  value.attempt!.failureCode = state === "failed" ? "ARTIFACT_VERIFICATION_FAILED" : null;
  expect((await setup(value).service.status(actor, id)).invoiceDocument).toBeNull();
  expect(publicationView(value, now)).toEqual({ state, failureCode: value.attempt!.failureCode, canShare: false, canVoid: true });
});

it.each(["artifact", "finalizedAt"] as const)("requires finalized artifact facts (%s) before regenerating an invoice URL", async (field) => {
  const value = published();
  value.attempt![field] = null;
  value.attempt!.link.keyVersion = 999;
  expect((await setup(value).service.status(actor, id)).invoiceDocument).toBeNull();
});

it.each(["pending", "rendering", "retry_wait", "failed", "ready"] as const)("projects only ready receipt fields for %s", async (state) => {
  const receipt = readyReceipt();
  receipt.state = state;
  if (state !== "ready") receipt.link.keyVersion = 999;
  const result = await setup(data({ settlement, receipt })).service.status(actor, id);
  expect(result.receipt).toEqual(state === "ready" ? {
    state, pageUrl: receiptUrl, pdfUrl: `${receiptUrl}/pdf`, pdfFilename: "receipt.pdf", pdfContentHash: hash,
  } : { state, pageUrl: null, pdfUrl: null, pdfFilename: null, pdfContentHash: null });
});

it("ignores all receipt and delivery facts before settlement, even unavailable receipt keys", async () => {
  const receipt = readyReceipt();
  receipt.link.keyVersion = 999;
  const result = await setup(data({ receipt, deliveries: [delivery("sent")] })).service.status(actor, id);
  expect(result.receipt).toEqual({ state: "not_applicable", pageUrl: null, pdfUrl: null, pdfFilename: null, pdfContentHash: null });
  expect(result.receiptEmail).toEqual({ state: "not_applicable", deliveries: [] });
});

it.each([
  [[], "queued"], [["pending"], "queued"], [["retry_wait", "sent"], "queued"], [["sent", "sent"], "sent"],
  [["sent", "sending"], "sending"], [["sending", "failed"], "failed"], [["failed", "manual_review"], "manual_review"],
] as Array<[DeliveryStatus["state"][], string]>)("preserves email aggregate precedence for %j", async (states, expected) => {
  const deliveries = states.map(delivery);
  const result = await setup(data({ settlement, deliveries })).service.status(actor, id);
  expect(result.receiptEmail).toEqual({ state: expected, deliveries });
});

it("explicitly projects every nested object and array without leaking future repository credentials", async () => {
  const value = published();
  const extras = { secret: "PRIVATE_CREDENTIAL", token: "PRIVATE_CREDENTIAL", htmlBody: "PRIVATE_CREDENTIAL" };
  value.settlement = Object.assign({ ...settlement }, extras);
  value.receipt = Object.assign(readyReceipt(), extras);
  Object.assign(value.receipt.artifact!, extras);
  Object.assign(value.receipt.link, extras);
  value.deliveries = [Object.assign(delivery("sent"), extras)];
  Object.assign(value.deliveries[0].roles, extras);
  Object.assign(value.attempt!, extras);
  Object.assign(value.attempt!.artifact!, extras);
  Object.assign(value, extras);
  const result = await setup(value).service.status(actor, id);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_CREDENTIAL");
  expect(result.settlement).toEqual(settlement);
  expect(result.receiptEmail.deliveries).toEqual([delivery("sent")]);
  expect(result.settlement).not.toBe(value.settlement);
  expect(result.receiptEmail.deliveries[0].roles).not.toBe(value.deliveries[0].roles);
  expect(Object.keys(result.invoiceDocument!).sort()).toEqual(["pageUrl", "pdfContentHash", "pdfFilename", "pdfUrl", "state"]);
  expect(Object.keys(result.receipt).sort()).toEqual(["pageUrl", "pdfContentHash", "pdfFilename", "pdfUrl", "state"]);
});

it("regenerates identical invoice and receipt links from stored keys after rotation and restart", async () => {
  const value = published();
  value.settlement = settlement;
  value.receipt = readyReceipt();
  const first = await setup(value).service.status(actor, id);
  const rotated: PublicationLinkConfig = { ...config, keys: new Map([[1, new Uint8Array(32).fill(7)], [2, new Uint8Array(32).fill(9)]]) };
  const restarted = setup(JSON.parse(JSON.stringify(value)), rotated).service;
  expect(await restarted.status(actor, id)).toEqual(first);
  expect(await restarted.share(actor, id)).toEqual({ invoiceUrl, invoicePdfUrl: `${invoiceUrl}/pdf`, pdfFilename: "INV-2030-000001.pdf" });
});

it.each(["invoice", "receipt"])("fails closed for %s unknown stored key or mismatched verifier without active-key fallback", async (kind) => {
  for (const mismatch of [false, true]) {
    const value = published();
    value.settlement = settlement;
    value.receipt = readyReceipt();
    const link = kind === "invoice" ? value.attempt!.link : value.receipt.link;
    if (mismatch) link.verifierHash = "0".repeat(64);
    else link.keyVersion = 999;
    await expect(setup(value).service.status(actor, id)).rejects.toMatchObject({ code: "LINK_UNAVAILABLE", status: 503 });
    if (kind === "invoice") await expect(setup(value).service.share(actor, id)).rejects.toMatchObject({ code: "LINK_UNAVAILABLE", status: 503 });
  }
});

it("fails closed when a ready receipt is missing its artifact proof", async () => {
  const receipt = readyReceipt();
  receipt.artifact = null;
  await expect(setup(data({ settlement, receipt })).service.status(actor, id)).rejects.toMatchObject({ code: "LINK_UNAVAILABLE" });
});

it("returns 404 for absent or invalid IDs without unscoped reads", async () => {
  const { service, repository } = setup(null);
  await expect(service.status(actor, "not-an-id")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  expect(repository.statusData).not.toHaveBeenCalled();
  await expect(service.status(actor, id)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  await expect(service.share(actor, id)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});

it("shares a finalized artifact after commercial expiry while its independent bearer remains live", async () => {
  const value = published();
  value.payableUntil = now.toISOString();
  const { service } = setup(value);
  expect(await service.share(actor, id)).toEqual({ invoiceUrl, invoicePdfUrl: `${invoiceUrl}/pdf`, pdfFilename: "INV-2030-000001.pdf" });
  expect(publicationView(value, now)).toEqual({ state: "finalized", failureCode: null, canShare: true, canVoid: false });
});

it.each(["reserved", "rendering", "stored", "failed", "artifact", "finalizedAt", "inactive", "futureActivation", "revoked", "expired"])("refuses explicit share for %s", async (reason) => {
  const value = published();
  const attempt = value.attempt!;
  if (["reserved", "rendering", "stored", "failed"].includes(reason)) attempt.state = reason as "reserved";
  if (reason === "artifact") attempt.artifact = null;
  if (reason === "finalizedAt") attempt.finalizedAt = null;
  if (reason === "inactive") attempt.link.activatedAt = null;
  if (reason === "futureActivation") attempt.link.activatedAt = new Date(now.getTime() + 1).toISOString();
  if (reason === "revoked") attempt.link.revokedAt = now.toISOString();
  if (reason === "expired") attempt.link.expiresAt = now.toISOString();
  await expect(setup(value).service.share(actor, id)).rejects.toMatchObject({ code: "LINK_UNAVAILABLE" });
  expect(publicationView(value, now).canShare).toBe(false);
});

it("does not expose private data in default SSR props, including null and failed states", () => {
  expect(publicationView(null, now)).toEqual({ state: null, failureCode: null, canShare: false, canVoid: false });
  expect(publicationView(data(), now)).toEqual({ state: null, failureCode: null, canShare: false, canVoid: false });
  const value = published();
  expect(publicationView(value, now)).toEqual({ state: "finalized", failureCode: null, canShare: true, canVoid: true });
  value.attempt!.state = "failed";
  value.attempt!.failureCode = "AUTH_REVOKED";
  expect(publicationView(value, now)).toEqual({ state: "failed", failureCode: "AUTH_REVOKED", canShare: false, canVoid: true });
});

it.each(COMMERCIAL_STATES)("offers void only for effectively published unpaid invoices (%s)", (commercialState) => {
  const value = published();
  value.commercialState = commercialState;
  expect(publicationView(value, now).canVoid).toBe(commercialState === "published");
  value.settlement = settlement;
  expect(publicationView(value, now).canVoid).toBe(false);
  value.settlement = null;
  value.payableUntil = null;
  expect(publicationView(value, now).canVoid).toBe(false);
});

it("authorizes actor shape and restricts explicit share to owners", async () => {
  const { service, repository } = setup(published());
  const connector = { workspaceId: actor.workspaceId, ownerWallet: null, connectorId: id };
  await service.status(connector, id);
  expect(repository.statusData).toHaveBeenCalledExactlyOnceWith(connector, id);
  repository.statusData.mockClear();
  await expect(service.share(connector, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  for (const invalid of [{ ...actor, connectorId: id }, { ...actor, ownerWallet: null }, { ...actor, workspaceId: "invalid" }]) {
    await expect(service.status(invalid, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  expect(repository.statusData).not.toHaveBeenCalled();
});

const voidInput = { invoiceId: id, expectedVersion: 1, approval: true, idempotencyKey: "void-1" };
const voidResult = { invoiceId: id, invoiceVersion: 1, commercialState: "voided", voidedAt: now.toISOString() };

it("normalizes and fingerprints the exact approved invoice version and workspace, not keys or configuration", async () => {
  const { service, repository } = setup(published());
  repository.voidInvoice.mockResolvedValue({ ...voidResult, privateDescriptor: "DO_NOT_EXPOSE" });
  expect(await service.void({ ...actor, workspaceId: actor.workspaceId.toUpperCase() }, {
    ...voidInput, invoiceId: id.toUpperCase(), idempotencyKey: "  void-1  ",
  })).toEqual(voidResult);
  const requestFingerprint = createHash("sha256").update(
    '{"approval":true,"expectedVersion":1,"invoiceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","operation":"void_invoice","workspaceId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',
  ).digest("hex");
  expect(repository.voidInvoice).toHaveBeenCalledExactlyOnceWith(actor, { ...voidInput, requestFingerprint });
  expect(repository.statusData).not.toHaveBeenCalled();
  await service.void(actor, { ...voidInput, idempotencyKey: "another-key" });
  expect(repository.voidInvoice.mock.calls[1][1].requestFingerprint).toBe(requestFingerprint);
  await service.void({ ...actor, workspaceId: id }, voidInput);
  expect(repository.voidInvoice.mock.calls[2][1].requestFingerprint).not.toBe(requestFingerprint);
});

it("lets the atomic repository replay before current-state checks and reject conflicting key reuse", async () => {
  const value = published();
  const { service, repository } = setup(value);
  const saved = new Map<string, string>();
  repository.voidInvoice.mockImplementation(async (_actor: InvoiceActor, input: VoidWrite) => {
    if (saved.has(input.idempotencyKey)) {
      if (saved.get(input.idempotencyKey) !== input.requestFingerprint) throw new PublicationError("IDEMPOTENCY_CONFLICT");
      return voidResult;
    }
    if (value.commercialState !== "published" || value.settlement) throw new PublicationError("INVOICE_NOT_VOIDABLE");
    if (input.expectedVersion !== value.invoiceVersion) throw new PublicationError("VERSION_CONFLICT");
    saved.set(input.idempotencyKey, input.requestFingerprint);
    value.commercialState = "voided";
    return voidResult;
  });
  await expect(service.void(actor, { ...voidInput, expectedVersion: 2 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(await service.void(actor, voidInput)).toEqual(voidResult);
  value.settlement = settlement;
  const restarted = createInvoiceLifecycleService(repository as unknown as PublicationRepository, () => ({ ...config, keys: new Map() }));
  expect(await restarted.void(actor, voidInput)).toEqual(voidResult);
  await expect(service.void(actor, { ...voidInput, expectedVersion: 2 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(service.void(actor, { ...voidInput, invoiceId: actor.workspaceId })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(service.void(actor, { ...voidInput, idempotencyKey: "new-key" })).rejects.toMatchObject({ code: "INVOICE_NOT_VOIDABLE" });
  expect(repository.statusData).not.toHaveBeenCalled();
});

it.each([
  null, [], {}, { ...voidInput, invoiceId: undefined }, { ...voidInput, invoiceId: "invalid" },
  { ...voidInput, expectedVersion: undefined }, { ...voidInput, expectedVersion: "1" },
  { ...voidInput, expectedVersion: 0 }, { ...voidInput, expectedVersion: -1 }, { ...voidInput, expectedVersion: 1.5 },
  { ...voidInput, expectedVersion: Number.MAX_SAFE_INTEGER + 1 }, { ...voidInput, approval: false },
  { ...voidInput, approval: undefined }, { ...voidInput, approval: "true" },
  { ...voidInput, idempotencyKey: undefined }, { ...voidInput, idempotencyKey: " " }, { ...voidInput, idempotencyKey: "x".repeat(129) },
  { ...voidInput, workspaceId: id }, { ...voidInput, invoiceVersion: 1 }, { ...voidInput, send: true },
])("rejects malformed or unapproved void input %# before any repository call", async (input) => {
  const { service, repository } = setup(published());
  await expect(service.void(actor, input)).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
  expect(repository.voidInvoice).not.toHaveBeenCalled();
  expect(repository.statusData).not.toHaveBeenCalled();
});

it("admits a scoped connector for atomic void authorization but rejects malformed actors", async () => {
  const { service, repository } = setup(null);
  repository.voidInvoice.mockResolvedValue(voidResult);
  const connector = { workspaceId: actor.workspaceId, ownerWallet: null, connectorId: id };
  await service.void(connector, voidInput);
  expect(repository.voidInvoice.mock.calls[0][0]).toEqual(connector);
  repository.voidInvoice.mockClear();
  await expect(service.void({ ...actor, connectorId: id }, voidInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(repository.voidInvoice).not.toHaveBeenCalled();
});
