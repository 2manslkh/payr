import { z } from "zod";
import type { InvoiceDeliveryWork, OutboxRepository } from "../email/outbox-contracts";
import { receiptRecipients, receiptSenderSchema } from "../email/address";
import { publicationAttemptSchema } from "./publication";
import { receiptWorkSchema } from "./receipts";
import type { RpcClient } from "./repositories";

const uuid = z.string().uuid().refine((value) => value === value.toLowerCase());
const time = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const deliveryWorkSchema = z.object({
  id: uuid, workspaceId: uuid, settlementId: uuid, receiptDocumentId: uuid,
  normalizedRecipient: z.email().max(254).refine((value) => value === value.trim().toLowerCase()),
  roles: z.array(z.enum(["issuer", "client"])).refine((value) => ["issuer", "client", "issuer,client"].includes(value.join(","))),
  messageKind: z.literal("receipt"), state: z.enum(["pending", "sending", "retry_wait", "sent", "manual_review", "failed"]),
  fence: receiptWorkSchema.shape.fence, attemptCount: z.number().int().min(0).max(2147483647),
  leaseUntil: time.nullable(), nextAttemptAt: time.nullable(), firstProviderAttemptAt: time.nullable(),
  providerRequestStartedAt: time.nullable(), ambiguousSince: time.nullable(),
  providerIdempotencyKey: z.string().min(1).max(256).regex(/^[A-Za-z0-9_/-]+$/),
  providerMessageId: z.string().min(1).max(1000).nullable(), payloadHash: hash.nullable(),
  lastErrorCode: z.string().max(64).regex(/^[A-Z_]+$/).nullable(), receipt: receiptWorkSchema,
}).strict().refine((d) => {
  if (d.receipt.state !== "ready" || d.receipt.id !== d.receiptDocumentId || d.receipt.workspaceId !== d.workspaceId
    || d.receipt.settlementId !== d.settlementId || (d.state === "sending") !== (d.leaseUntil !== null)
    || (d.state === "sent") !== (d.providerMessageId !== null)
    || d.providerRequestStartedAt !== null && (d.firstProviderAttemptAt === null || d.payloadHash === null)) return false;
  if (d.state !== "sending") return true;
  const expected = receiptRecipients(d.receipt.attempt.snapshot.sender.contactEmail!, d.receipt.attempt.snapshot.client.contactEmail)
    .find((entry) => entry.normalizedRecipient === d.normalizedRecipient);
  return expected?.roles.join(",") === d.roles.join(",") && d.fence !== "0" && d.attemptCount > 0;
});
const resultSchema = z.union([
  z.object({ kind: z.literal("sent"), providerMessageId: z.string().min(1).max(1000).regex(/^[^\x00-\x1f\x7f]+$/) }).strict(),
  z.object({ kind: z.enum(["retry", "ambiguous", "failed", "manual_review"]), code: z.enum([
    "DOCUMENT_UNAVAILABLE", "DOCUMENT_INVALID", "PROVIDER_RATE_LIMITED", "PROVIDER_REJECTED", "PROVIDER_AMBIGUOUS", "PROVIDER_CONFLICT",
  ]) }).strict(),
]);

export const invoiceEmailConfigSchema = z.object({ from: receiptSenderSchema,
  appOrigin: z.url().refine((value) => { const url = new URL(value); return url.origin === value && !url.username && !url.password
    && (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)); }),
  templateVersion: z.literal("invoice-issued-v1"), network: z.literal("Arc Testnet"),
}).strict();
export const invoiceDeliveryWorkSchema = z.object(deliveryWorkSchema.shape).omit({ settlementId: true, receiptDocumentId: true, receipt: true, messageKind: true })
  .extend({ messageKind: z.literal("invoice_issued"), publicationAttemptId: uuid, publication: publicationAttemptSchema, emailConfig: invoiceEmailConfigSchema })
  .refine((d) => {
    if (d.publication.state !== "finalized" || !d.publication.artifact || d.publication.id !== d.publicationAttemptId
      || d.publication.workspaceId !== d.workspaceId || (d.state === "sending") !== (d.leaseUntil !== null)
      || (d.state === "sent") !== (d.providerMessageId !== null)
      || d.providerRequestStartedAt !== null && (d.firstProviderAttemptAt === null || d.payloadHash === null)) return false;
    const expected = receiptRecipients(d.publication.snapshot.sender.contactEmail!, d.publication.snapshot.client.contactEmail)
      .find((entry) => entry.normalizedRecipient === d.normalizedRecipient);
    return expected?.roles.join(",") === d.roles.join(",") && (d.state !== "sending" || d.fence !== "0" && d.attemptCount > 0);
  });

export function createInvoiceOutboxRepository(client: RpcClient, publicationAttemptId?: string): OutboxRepository<InvoiceDeliveryWork> {
  const scope = publicationAttemptId === undefined ? null : uuid.parse(publicationAttemptId);
  async function call(name: string, args: Record<string, unknown>, id?: string, fence?: string) {
    try {
      const result = await client.rpc(name, args);
      if (result.error) throw new Error();
      return invoiceDeliveryWorkSchema.refine((row) => (id === undefined || row.id === id) && (fence === undefined || row.fence === fence)
        && (scope === null || row.publicationAttemptId === scope)).nullable().parse(result.data);
    } catch { throw new Error("DELIVERY_UNAVAILABLE"); }
  }
  return {
    claim: (id) => call("payr_claim_invoice_delivery_v1", { p_id: id === undefined ? null : uuid.parse(id), p_publication_attempt_id: scope }, id),
    begin: (id, fence, payloadHash) => call("payr_begin_invoice_delivery_v1", { p_id: uuid.parse(id), p_fence: receiptWorkSchema.shape.fence.parse(fence), p_payload_hash: hash.parse(payloadHash) }, id, fence),
    finish: (id, fence, result) => call("payr_finish_delivery_v1", { p_id: uuid.parse(id), p_fence: receiptWorkSchema.shape.fence.parse(fence), p_result: resultSchema.parse(result) }, id, fence),
  };
}

export function createOutboxRepository(client: RpcClient, automatic?: { receiptDocumentId?: string }): OutboxRepository {
  const scope = automatic?.receiptDocumentId === undefined ? null : uuid.parse(automatic.receiptDocumentId);
  async function call(name: string, input: Record<string, unknown>, id?: string, fence?: string) {
    try {
      const result = await client.rpc(name, input);
      if (result.error) throw new Error();
      return deliveryWorkSchema.refine((row) => (id === undefined || row.id === id) && (fence === undefined || row.fence === fence)
        && (scope === null || row.receiptDocumentId === scope)).nullable().parse(result.data);
    } catch { throw new Error("DELIVERY_UNAVAILABLE"); }
  }
  return {
    claim: (id) => automatic === undefined
      ? call("payr_claim_delivery_v1", { p_id: id === undefined ? null : uuid.parse(id) }, id)
      : call("payr_claim_automatic_receipt_delivery_v1", { p_id: id === undefined ? null : uuid.parse(id), p_receipt_document_id: scope }, id),
    begin: (id, fence, payloadHash) => call("payr_begin_delivery_v1", { p_id: uuid.parse(id), p_fence: receiptWorkSchema.shape.fence.parse(fence), p_payload_hash: hash.parse(payloadHash) }, id, fence),
    finish: (id, fence, result) => call("payr_finish_delivery_v1", { p_id: uuid.parse(id), p_fence: receiptWorkSchema.shape.fence.parse(fence), p_result: resultSchema.parse(result) }, id, fence),
  };
}
