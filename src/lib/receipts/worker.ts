import { DocumentVerificationError } from "../documents/contracts";
import type { PublicationLinkConfig } from "../invoices/publication-contracts";
import type { ReceiptDocumentPort, ReceiptRepository } from "./contracts";

export function createReceiptWorker(repository: ReceiptRepository, documents: ReceiptDocumentPort, config: PublicationLinkConfig) {
  return { async run(id?: string) {
    const work = await repository.claim(id);
    if (!work) return { outcome: "idle" as const };
    if (work.state !== "rendering") return { outcome: "failed" as const, id: work.id };
    try {
      const artifact = await documents.createOrRead(work, config);
      return { outcome: await repository.complete(work.id, work.fence, artifact) ? "ready" as const : "lease_lost" as const, id: work.id };
    } catch (error) {
      const invalid = error instanceof DocumentVerificationError;
      const saved = await repository.fail(work.id, work.fence, invalid ? "ARTIFACT_VERIFICATION_FAILED" : "DOCUMENT_UNAVAILABLE");
      return { outcome: !saved ? "lease_lost" as const : invalid ? "failed" as const : "retry_wait" as const, id: work.id };
    }
  } };
}
