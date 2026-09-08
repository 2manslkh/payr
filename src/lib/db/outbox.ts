import { z } from "zod";
import type { OutboxRepository } from "../email/outbox-contracts";
import { receiptRecipients } from "../email/address";
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

export function createOutboxRepository(client: RpcClient): OutboxRepository {
  async function call(name: string, input: Record<string, unknown>, id?: string, fence?: string) {
    try {
      const result = await client.rpc(name, input);
      if (result.error) throw new Error();
      return deliveryWorkSchema.refine((row) => (id === undefined || row.id === id) && (fence === undefined || row.fence === fence)).nullable().parse(result.data);
    } catch { throw new Error("DELIVERY_UNAVAILABLE"); }
  }
  return {
    claim: (id) => call("payr_claim_delivery_v1", { p_id: id === undefined ? null : uuid.parse(id) }, id),
    begin: (id, fence, payloadHash) => call("payr_begin_delivery_v1", { p_id: uuid.parse(id), p_fence: receiptWorkSchema.shape.fence.parse(fence), p_payload_hash: hash.parse(payloadHash) }, id, fence),
    finish: (id, fence, result) => call("payr_finish_delivery_v1", { p_id: uuid.parse(id), p_fence: receiptWorkSchema.shape.fence.parse(fence), p_result: resultSchema.parse(result) }, id, fence),
  };
}
