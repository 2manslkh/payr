import { z } from "zod";
import { DocumentUnavailableError, DocumentVerificationError } from "../documents/contracts";
import type { ReceiptRepository } from "../receipts/contracts";
import { publicationAttemptSchema, publicationStatusDataSchema } from "./publication";
import type { RpcClient } from "./repositories";

const uuid = z.string().uuid().refine((value) => value === value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const fence = z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine((value) => BigInt(value) <= 9223372036854775807n);
export const receiptArtifactSchema = z.object({
  storageKey: z.string().max(200), pdfFilename: z.string().max(200).regex(/^[A-Za-z0-9_-]+\.pdf$/),
  contentType: z.literal("application/pdf"), byteLength: z.number().int().min(5).max(10485760),
  pdfContentHash: z.templateLiteral(["0x", z.string().regex(/^[0-9a-f]{64}$/)]), qrVerified: z.literal(true),
}).strict();
export const receiptWorkSchema = z.object({
  id: uuid, workspaceId: uuid, invoiceId: uuid, invoiceVersionId: uuid, settlementId: uuid,
  state: z.enum(["pending", "rendering", "retry_wait", "ready", "failed"]), fence,
  attemptCount: z.number().int().min(0).max(2147483647), leaseUntil: timestamp.nullable(), nextAttemptAt: timestamp.nullable(),
  failureCode: z.enum(["ARTIFACT_VERIFICATION_FAILED", "LINK_UNAVAILABLE"]).nullable(),
  link: publicationAttemptSchema.shape.link, artifact: receiptArtifactSchema.nullable(),
  attempt: publicationAttemptSchema, settlement: publicationStatusDataSchema.shape.settlement.unwrap(),
}).strict().refine((r) => {
  const a = r.attempt, s = r.settlement;
  return a.workspaceId === r.workspaceId && a.invoiceId === r.invoiceId && a.invoiceVersionId === r.invoiceVersionId
    && a.state === "finalized" && a.artifact !== null && r.link.tokenId !== a.link.tokenId
    && s.chainId === a.chainId && s.contractAddress === a.contractAddress && s.invoiceVersion === a.invoiceVersion
    && s.payee === a.snapshot.sender.payoutWallet && s.amountAtomic === a.snapshot.amountAtomic && s.amountDecimal === a.snapshot.amountDecimal
    && s.documentCommitment === a.artifact.documentCommitment
    && (r.state === "ready") === (r.artifact !== null) && (r.state === "failed") === (r.failureCode !== null)
    && (r.state === "rendering") === (r.leaseUntil !== null)
    && (r.state !== "rendering" || r.fence !== "0" && r.attemptCount > 0)
    && (r.artifact === null || r.artifact.storageKey === `workspace/${r.workspaceId}/receipt/${r.id}.pdf`
      && r.artifact.pdfFilename === `receipt-${a.invoiceNumber}-v${a.invoiceVersion}.pdf`);
});

export function createReceiptRepository(client: RpcClient): ReceiptRepository {
  async function call<T>(name: string, input: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    try {
      const result = await client.rpc(name, input);
      if (result.error?.message === "ARTIFACT_VERIFICATION_FAILED") throw new DocumentVerificationError();
      if (result.error) throw new DocumentUnavailableError();
      return schema.parse(result.data);
    } catch (error) {
      if (error instanceof DocumentVerificationError) throw error;
      throw new DocumentUnavailableError();
    }
  }
  return {
    claim: (id) => call("payr_claim_receipt_v1", { p_id: id === undefined ? null : uuid.parse(id) },
      receiptWorkSchema.refine((row) => id === undefined || row.id === id).nullable()),
    complete: (id, claimedFence, artifact) => call("payr_complete_receipt_v1",
      { p_id: uuid.parse(id), p_fence: fence.parse(claimedFence), p_artifact: receiptArtifactSchema.parse(artifact) }, z.boolean()),
    fail: (id, claimedFence, code) => call("payr_fail_receipt_v1", { p_id: uuid.parse(id), p_fence: fence.parse(claimedFence),
      p_code: z.enum(["ARTIFACT_VERIFICATION_FAILED", "DOCUMENT_UNAVAILABLE"]).parse(code) }, z.boolean()),
    read: (tokenId) => call("payr_read_receipt_v1", { p_token_id: uuid.parse(tokenId) },
      receiptWorkSchema.refine((row) => row.link.tokenId === tokenId && row.state === "ready").nullable()),
  };
}
