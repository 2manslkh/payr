import type { ReceiptDocumentState, SettlementStatus } from "../domain/status";
import type { LinkMaterial, PublicationAttempt, PublicationLinkConfig } from "../invoices/publication-contracts";

export type ReceiptArtifact = {
  storageKey: string; pdfFilename: string; contentType: "application/pdf"; byteLength: number;
  pdfContentHash: `0x${string}`; qrVerified: true;
};
export type ReceiptWork = {
  id: string; workspaceId: string; invoiceId: string; invoiceVersionId: string; settlementId: string;
  state: Exclude<ReceiptDocumentState, "not_applicable">; fence: string; attemptCount: number;
  leaseUntil: string | null; nextAttemptAt: string | null; failureCode: string | null;
  link: LinkMaterial; artifact: ReceiptArtifact | null; attempt: PublicationAttempt; settlement: SettlementStatus;
};
export type ReceiptRepository = {
  claim(id?: string): Promise<ReceiptWork | null>;
  complete(id: string, fence: string, artifact: ReceiptArtifact): Promise<boolean>;
  fail(id: string, fence: string, code: "ARTIFACT_VERIFICATION_FAILED" | "DOCUMENT_UNAVAILABLE"): Promise<boolean>;
  read(tokenId: string): Promise<ReceiptWork | null>;
};
export type ReceiptDocumentPort = {
  createOrRead(work: ReceiptWork, config: PublicationLinkConfig): Promise<ReceiptArtifact>;
};
