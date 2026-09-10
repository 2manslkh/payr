// @vitest-environment node
import { keccak256 } from "viem";
import { afterEach, expect, it, vi } from "vitest";
import { createInvoiceDeliveryEnv, createReceiptDeliveryEnv } from "../../config/env";
import { createInvoiceOutboxRepository, invoiceDeliveryWorkSchema } from "../db/outbox";
import { testReceiptWork } from "../receipts/test-support";
import { prepareInvoiceEmail } from "./invoice";
import { createOutboxWorker } from "./outbox";
import type { InvoiceDeliveryWork, OutboxRepository } from "./outbox-contracts";

afterEach(() => vi.restoreAllMocks());
function setup() {
  const { work: receipt, config } = testReceiptWork();
  const bytes = Buffer.from("%PDF-frozen publication bytes");
  const publication = receipt.attempt;
  publication.artifact = { ...publication.artifact!, byteLength: bytes.length, pdfContentHash: keccak256(bytes) };
  const work: InvoiceDeliveryWork = { id: receipt.id, workspaceId: receipt.workspaceId, publicationAttemptId: publication.id, publication,
    normalizedRecipient: publication.snapshot.client.contactEmail, roles: ["client"], messageKind: "invoice_issued", state: "sending",
    fence: "1", attemptCount: 1, leaseUntil: "2030-01-02T00:03:00Z", nextAttemptAt: null, providerIdempotencyKey: "invoice-issued/test/client",
    firstProviderAttemptAt: null, providerRequestStartedAt: null, ambiguousSince: null, providerMessageId: null, payloadHash: null, lastErrorCode: null,
    emailConfig: { from: "Payr <sender@example.test>", appOrigin: config.appOrigin, templateVersion: "invoice-issued-v1", network: "Arc Testnet" } };
  const storage = { read: vi.fn().mockResolvedValue({ bytes, byteLength: bytes.length, contentType: "application/pdf" }), create: vi.fn() };
  return { work, config, storage, bytes };
}

it.each(["client", "issuer", "both"] as const)("prepares %s from snapshot facts and verified frozen bytes, with pinned origin and sender", async (audience) => {
  const { work, config, storage, bytes } = setup();
  if (audience === "issuer") { work.roles = ["issuer"]; work.normalizedRecipient = work.publication.snapshot.sender.contactEmail!; }
  if (audience === "both") { work.roles = ["issuer", "client"]; work.publication.snapshot.sender = { ...work.publication.snapshot.sender, contactEmail: work.normalizedRecipient }; }
  const payload = await prepareInvoiceEmail(work, { ...config, appOrigin: "https://changed.test" }, storage);
  expect(payload.from).toBe(work.emailConfig.from);
  expect(payload.to).toEqual([work.normalizedRecipient]);
  expect(payload.text).toContain("Arc Testnet");
  expect(payload.text).toContain("PDF is attached");
  expect(payload.text).toContain(`${config.appOrigin}/invoice/`);
  expect(payload.text).not.toContain("changed.test");
  expect(payload.attachments).toEqual([{ filename: work.publication.artifact!.pdfFilename, content: bytes.toString("base64") }]);
  expect(storage.create).not.toHaveBeenCalled();
  expect(await prepareInvoiceEmail(work, config, storage)).toEqual(payload);
  expect(invoiceDeliveryWorkSchema.safeParse(work).success).toBe(true);
});

it.each(["hash", "length", "type", "missing", "recipient", "roles", "attempt", "network", "template"])("fails closed before provider I/O for %s", async (mode) => {
  const { work, config, storage } = setup();
  if (mode === "hash") work.publication.artifact!.pdfContentHash = `0x${"a".repeat(64)}`;
  if (mode === "length") work.publication.artifact!.byteLength++;
  if (mode === "type") storage.read.mockResolvedValue({ bytes: Buffer.from("%PDF-"), contentType: "text/plain", byteLength: 5 });
  if (mode === "missing") storage.read.mockResolvedValue(null);
  if (mode === "recipient") work.normalizedRecipient = "someone-else@example.test";
  if (mode === "roles") work.roles = ["issuer"];
  if (mode === "attempt") work.publicationAttemptId = receiptId;
  if (mode === "network") work.publication.chainId = 1;
  if (mode === "template") Object.assign(work.emailConfig, { templateVersion: "changed" });
  await expect(prepareInvoiceEmail(work, config, storage)).rejects.toThrow();
});
const receiptId = "00000000-0000-4000-8000-000000000002";

it("keeps invoice enablement independent and validates enabled provider config", () => {
  expect(createInvoiceDeliveryEnv({ PAYR_RECEIPT_EMAIL_ENABLED: "true" })).toBeNull();
  const env = { PAYR_INVOICE_EMAIL_ENABLED: "true", RESEND_API_KEY: "mock-only", RESEND_FROM_EMAIL: "Payr <sender@example.test>" };
  expect(createInvoiceDeliveryEnv(env)).toEqual({ apiKey: "mock-only", from: env.RESEND_FROM_EMAIL });
  expect(createReceiptDeliveryEnv(env)).toBeNull();
  expect(() => createInvoiceDeliveryEnv({ PAYR_INVOICE_EMAIL_ENABLED: "true" })).toThrow();
  expect(() => createInvoiceDeliveryEnv({ PAYR_INVOICE_EMAIL_ENABLED: "yes" })).toThrow();
});

it("uses invoice-only scoped claims and shared completion without waking receipts", async () => {
  const { work } = setup();
  const rpc = vi.fn().mockResolvedValue({ data: work, error: null });
  const repository = createInvoiceOutboxRepository({ rpc }, work.publicationAttemptId);
  await repository.claim(); await repository.begin(work.id, work.fence, "a".repeat(64));
  await repository.finish(work.id, work.fence, { kind: "retry", code: "PROVIDER_RATE_LIMITED" });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["payr_claim_invoice_delivery_v1", "payr_begin_invoice_delivery_v1", "payr_finish_delivery_v1"]);
  expect(rpc.mock.calls[0][1]).toEqual({ p_id: null, p_publication_attempt_id: work.publicationAttemptId });
  rpc.mockResolvedValue({ data: { ...work, publicationAttemptId: receiptId }, error: null });
  await expect(repository.claim()).rejects.toThrow("DELIVERY_UNAVAILABLE");
});

it("retains payload and per-recipient key after ambiguous provider failure and a lost completion", async () => {
  const { work, storage, config } = setup();
  const repository: OutboxRepository<InvoiceDeliveryWork> = { claim: vi.fn().mockResolvedValue(work),
    begin: vi.fn(async (_id, _fence, payloadHash) => ({ ...work, payloadHash, firstProviderAttemptAt: "2030-01-02T00:00:00Z", providerRequestStartedAt: "2030-01-02T00:00:00Z" })),
    finish: vi.fn().mockResolvedValue(null) };
  const provider = { send: vi.fn().mockRejectedValue(new Error("ambiguous network loss")) };
  const worker = createOutboxWorker(repository, (row) => prepareInvoiceEmail(row, config, storage), provider);
  expect((await worker.run()).outcome).toBe("lease_lost");
  expect(repository.finish).toHaveBeenCalledWith(work.id, work.fence, { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" });
  work.fence = "2";
  await worker.run();
  expect(provider.send.mock.calls[0].slice(0, 2)).toEqual(provider.send.mock.calls[1].slice(0, 2));
  expect(vi.mocked(repository.begin).mock.calls[0][2]).toBe(vi.mocked(repository.begin).mock.calls[1][2]);
  expect(vi.mocked(repository.begin).mock.invocationCallOrder[0]).toBeLessThan(provider.send.mock.invocationCallOrder[0]);
});
