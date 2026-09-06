import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../domain/canonical-json";
import { isPayable } from "../domain/invoice";
import { buildInvoiceStatus, type InvoiceStatusFacts } from "../domain/status";
import { IdentityError, walletSchema } from "../identity/contracts";
import { PublicationError, type InvoiceLifecycleService, type PublicationLinkConfig, type PublicationRepository, type PublicationStatusData, type PublicationView } from "./publication-contracts";
import { publicationLink } from "./publication-links";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const actorSchema = z.object({
  workspaceId: uuid, ownerWallet: walletSchema.nullable(), connectorId: uuid.nullable(),
}).strict().refine((actor) => (actor.ownerWallet === null) !== (actor.connectorId === null));
const voidSchema = z.object({
  invoiceId: uuid, expectedVersion: z.number().int().positive(), approval: z.literal(true),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

export function createInvoiceLifecycleService(repository: PublicationRepository, getConfig: () => PublicationLinkConfig, now: () => Date = () => new Date()): InvoiceLifecycleService {
  return {
    async status(actor, invoiceId) {
      const parsedActor = actorSchema.safeParse(actor);
      if (!parsedActor.success) throw new IdentityError("FORBIDDEN", 403);
      const id = uuid.safeParse(invoiceId);
      if (!id.success) throw new PublicationError("NOT_FOUND", 404);
      const data = await repository.statusData(parsedActor.data, id.data);
      if (!data) throw new PublicationError("NOT_FOUND", 404);
      const { attempt, receipt, settlement } = data;
      let invoiceDocument: InvoiceStatusFacts["invoiceDocument"] = null;
      if (attempt?.state === "finalized" && attempt.finalizedAt !== null && attempt.artifact) {
        const pageUrl = publicationLink(attempt.link, "invoice-bearer", getConfig());
        invoiceDocument = {
          state: "ready", pageUrl, pdfUrl: `${pageUrl}/pdf`,
          pdfFilename: attempt.artifact.pdfFilename, pdfContentHash: attempt.artifact.pdfContentHash,
        };
      }
      let receiptDocument: InvoiceStatusFacts["receiptDocument"] = null;
      if (settlement && receipt) {
        if (receipt.state === "ready") {
          if (!receipt.artifact) throw new PublicationError("LINK_UNAVAILABLE", 503);
          const pageUrl = publicationLink(receipt.link, "receipt-bearer", getConfig());
          receiptDocument = {
            state: "ready", pageUrl, pdfUrl: `${pageUrl}/pdf`,
            pdfFilename: receipt.artifact.pdfFilename, pdfContentHash: receipt.artifact.pdfContentHash,
          };
        } else receiptDocument = { state: receipt.state };
      }
      // Project every nested DTO: repository rows may acquire private fields without changing this response.
      return buildInvoiceStatus({
        invoiceId: data.invoiceId, invoiceVersion: data.invoiceVersion, invoiceNumber: data.invoiceNumber ?? null,
        commercialState: data.commercialState, payableUntil: data.payableUntil ?? null, now: now(),
        voidedAt: data.voidedAt == null ? null : new Date(data.voidedAt),
        settlement: settlement === null ? null : {
          chainId: settlement.chainId, contractAddress: settlement.contractAddress, invoiceVersion: settlement.invoiceVersion,
          transactionHash: settlement.transactionHash, logIndex: settlement.logIndex, blockNumber: settlement.blockNumber,
          blockTime: settlement.blockTime, payer: settlement.payer, payee: settlement.payee,
          amountDecimal: settlement.amountDecimal, amountAtomic: settlement.amountAtomic, documentCommitment: settlement.documentCommitment,
        },
        explorer: settlement === null ? null : { transactionUrl: new URL(`/tx/${settlement.transactionHash}`, getConfig().explorerOrigin).href },
        invoiceDocument, receiptDocument,
        deliveries: data.deliveries.map((delivery) => ({
          roles: delivery.roles.filter((role) => role === "issuer" || role === "client"),
          normalizedRecipient: delivery.normalizedRecipient, state: delivery.state,
          providerMessageId: delivery.providerMessageId ?? null, attemptCount: delivery.attemptCount, nextAttemptAt: delivery.nextAttemptAt ?? null,
        })),
      });
    },
    async share(actor, invoiceId) {
      const parsedActor = actorSchema.safeParse(actor);
      if (!parsedActor.success || parsedActor.data.ownerWallet === null) throw new IdentityError("FORBIDDEN", 403);
      const id = uuid.safeParse(invoiceId);
      if (!id.success) throw new PublicationError("NOT_FOUND", 404);
      const data = await repository.statusData(parsedActor.data, id.data);
      if (!data) throw new PublicationError("NOT_FOUND", 404);
      const { attempt } = data;
      if (!publicationView(data, now()).canShare || !attempt?.artifact) throw new PublicationError("LINK_UNAVAILABLE", 503);
      const invoiceUrl = publicationLink(attempt.link, "invoice-bearer", getConfig());
      return { invoiceUrl, invoicePdfUrl: `${invoiceUrl}/pdf`, pdfFilename: attempt.artifact.pdfFilename };
    },
    async void(actor, rawInput) {
      const parsedActor = actorSchema.safeParse(actor);
      if (!parsedActor.success) throw new IdentityError("FORBIDDEN", 403);
      const parsed = voidSchema.safeParse(rawInput);
      if (!parsed.success) throw new PublicationError("INVALID_INPUT", 400);
      const input = parsed.data;
      const requestFingerprint = createHash("sha256").update(canonicalJson({
        operation: "void_invoice", workspaceId: parsedActor.data.workspaceId, invoiceId: input.invoiceId,
        expectedVersion: input.expectedVersion, approval: input.approval,
      })).digest("hex");
      // The repository authorizes and checks replay atomically before mutable version, time and settlement facts.
      const result = await repository.voidInvoice(parsedActor.data, { ...input, requestFingerprint });
      return { invoiceId: result.invoiceId, invoiceVersion: result.invoiceVersion, commercialState: result.commercialState, voidedAt: result.voidedAt };
    },
  };
}

export function publicationView(data: PublicationStatusData | null, now: Date = new Date()): PublicationView {
  const attempt = data?.attempt;
  return {
    state: attempt?.state ?? null, failureCode: attempt?.failureCode ?? null,
    canShare: Boolean(attempt?.state === "finalized" && attempt.finalizedAt !== null && attempt.artifact
      && attempt.link.activatedAt !== null && new Date(attempt.link.activatedAt).getTime() <= now.getTime()
      && attempt.link.revokedAt === null && now.getTime() < new Date(attempt.link.expiresAt).getTime()),
    canVoid: Boolean(data && data.payableUntil !== null && isPayable({
      commercialState: data.commercialState, now, payableUntil: new Date(data.payableUntil),
      settlement: data.settlement === null ? null : { blockTime: new Date(data.settlement.blockTime) },
    })),
  };
}
