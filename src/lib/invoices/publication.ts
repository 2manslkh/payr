import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../domain/canonical-json";
import { deriveEffectiveCommercialState } from "../domain/invoice";
import { IdentityError, walletSchema } from "../identity/contracts";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { buildGmailPackage } from "./gmail-package";
import { PublicationError, type InvoiceDocumentPort, type PublicationDependencies, type PublicationRepository, type PublicationService } from "./publication-contracts";
import { publicationLink } from "./publication-links";
import { createPublicationWorker } from "./publication-worker";

export const publishInvoiceSchema = z.object({
  draftId: z.string().uuid().transform((value) => value.toLowerCase()),
  expectedVersion: z.number().int().positive(), approval: z.literal(true), idempotencyKey: z.string().trim().min(1).max(128),
}).strict();
const actorSchema = z.object({
  workspaceId: z.string().uuid().transform((value) => value.toLowerCase()), ownerWallet: walletSchema.nullable(),
  connectorId: z.string().uuid().transform((value) => value.toLowerCase()).nullable(),
}).strict().refine((actor) => (actor.ownerWallet === null) !== (actor.connectorId === null));

export function createPublicationService(repository: PublicationRepository, dependencies: PublicationDependencies): PublicationService {
  return { async publish(actor, rawInput) {
    const parsed = publishInvoiceSchema.safeParse(rawInput);
    if (!parsed.success) throw new PublicationError("INVALID_INPUT", 400);
    const parsedActor = actorSchema.safeParse(actor);
    if (!parsedActor.success) throw new IdentityError("FORBIDDEN", 403);
    actor = parsedActor.data;
    const input = parsed.data;
    const requestFingerprint = createHash("sha256").update(canonicalJson({
      operation: "publish_invoice", workspaceId: actor.workspaceId, draftId: input.draftId,
      expectedVersion: input.expectedVersion, approval: true,
    })).digest("hex");
    // Resolve authorized replay before touching current deployment binding or an unavailable provider.
    let reserved = await repository.findReplay(actor, input.idempotencyKey, requestFingerprint);
    let documents: InvoiceDocumentPort | undefined;
    if (!reserved) {
      try {
        documents = dependencies.getDocuments();
        const config = dependencies.getReservationConfig();
        const tokenId = randomUUID();
        let verifierHash: string;
        try {
          if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0
            || !/^0x[0-9a-fA-F]{40}$/.test(config.contractAddress) || /^0x0{40}$/.test(config.contractAddress)
            || !Number.isSafeInteger(config.activeKeyVersion) || config.activeKeyVersion < 1 || config.activeKeyVersion > 2147483647) throw new Error();
          verifierHash = createKeyedTokenCodec(config.keys).derive(tokenId, "invoice-bearer", config.activeKeyVersion).verifierHash;
        } catch { throw new PublicationError("CONFIGURATION_ERROR", 503); }
        reserved = await repository.reserve(actor, {
          ...input, requestFingerprint, attemptId: randomUUID(), invoiceKey: `0x${randomBytes(32).toString("hex")}`,
          publicationSalt: `0x${randomBytes(32).toString("hex")}`, tokenId, keyVersion: config.activeKeyVersion,
          verifierHash, chainId: config.chainId, contractAddress: config.contractAddress.toLowerCase() as `0x${string}`,
        });
      } catch (error) {
        reserved = await repository.findReplay(actor, input.idempotencyKey, requestFingerprint);
        if (!reserved) throw error;
      }
    }
    if (reserved.workspaceId !== actor.workspaceId || reserved.invoiceId !== input.draftId || reserved.invoiceVersion !== input.expectedVersion) {
      throw new PublicationError("INVALID_DATABASE_RESPONSE", 500);
    }
    if (reserved.state === "failed") throw new PublicationError("PUBLICATION_FAILED", 409, reserved.failureCode ?? undefined);
    if (reserved.state !== "finalized") {
      const worker = createPublicationWorker(repository, dependencies.getLinkConfig(), documents ?? dependencies.getDocuments());
      const result = await worker.run(reserved.id);
      if (result.outcome === "idle" || result.outcome === "busy") throw new PublicationError("PUBLICATION_IN_PROGRESS");
      if (result.outcome === "retryable") throw new PublicationError("PUBLICATION_RETRYABLE", 503);
      if (result.outcome === "lease_lost") throw new PublicationError("LEASE_LOST");
      if (result.outcome === "failed") {
        // The failure is durable even if a revoked actor can no longer read its details.
        const failed = await repository.statusData(actor, input.draftId).catch(() => null);
        throw new PublicationError("PUBLICATION_FAILED", 409, failed?.attempt?.id === reserved.id ? failed.attempt.failureCode ?? undefined : undefined);
      }
    }
    const data = await repository.statusData(actor, input.draftId);
    if (!data) throw new PublicationError("NOT_FOUND", 404);
    const attempt = data.attempt;
    if (!attempt || attempt.id !== reserved.id || attempt.workspaceId !== actor.workspaceId || attempt.invoiceId !== input.draftId
      || data.invoiceId !== input.draftId || attempt.invoiceVersion !== input.expectedVersion || data.invoiceVersion !== attempt.invoiceVersion
      || data.invoiceNumber !== attempt.invoiceNumber || attempt.state !== "finalized" || !attempt.finalizedAt
      || !attempt.artifact?.qrVerified || !attempt.link.activatedAt || data.commercialState === "draft" || !data.payableUntil) {
      throw new PublicationError("PUBLICATION_RETRYABLE", 503);
    }
    const invoiceUrl = publicationLink(attempt.link, "invoice-bearer", dependencies.getLinkConfig());
    const invoicePdfUrl = `${invoiceUrl}/pdf`;
    return {
      invoiceId: attempt.invoiceId, invoiceVersion: attempt.invoiceVersion, invoiceNumber: attempt.invoiceNumber,
      commercialState: deriveEffectiveCommercialState(data.commercialState, new Date(), new Date(data.payableUntil)),
      invoiceUrl, invoicePdfUrl, pdfFilename: attempt.artifact.pdfFilename, pdfContentHash: attempt.artifact.pdfContentHash,
      documentCommitment: attempt.artifact.documentCommitment,
      gmailLinkPackage: buildGmailPackage({ snapshot: attempt.snapshot, invoiceNumber: attempt.invoiceNumber, invoiceUrl, invoicePdfUrl }),
      sendApprovalRequired: true,
    };
  } };
}
