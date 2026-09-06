import type { CommercialState } from "../domain/invoice";
import type { DeliveryStatus, InvoiceStatusResult, ReceiptDocumentState, SettlementStatus } from "../domain/status";
import type { DraftSnapshot, InvoiceActor, InvoiceDocumentPort } from "./contracts";

export type PublicationState = "reserved" | "rendering" | "stored" | "finalized" | "failed";
export type PublicationFailure = "ARTIFACT_VERIFICATION_FAILED" | "PROFILE_CONFLICT" | "CLIENT_CONFLICT" | "AUTH_REVOKED" | "DEADLINE_EXPIRED" | "VERSION_CONFLICT";
export type LinkMaterial = { tokenId: string; keyVersion: number; verifierHash: string; expiresAt: string; activatedAt: string | null; revokedAt: string | null };
export type PublicationLinkConfig = { appOrigin: string; explorerOrigin: string; activeKeyVersion: number; keys: ReadonlyMap<number, Uint8Array> };
export type PublicationConfig = PublicationLinkConfig & { chainId: number; contractAddress: `0x${string}` };
export type PublicationArtifact = {
  pdfFilename: string; contentType: "application/pdf"; byteLength: number;
  invoiceDataHash: `0x${string}`; pdfContentHash: `0x${string}`; documentCommitment: `0x${string}`; qrVerified: true;
};
export type PublicationAttempt = {
  id: string; workspaceId: string; invoiceId: string; invoiceVersionId: string; invoiceVersion: number;
  invoiceNumber: string; state: PublicationState; snapshot: DraftSnapshot;
  chainId: number; contractAddress: `0x${string}`; invoiceKey: `0x${string}`; publicationSalt: `0x${string}`;
  storageKey: string; link: LinkMaterial; leaseOwner: string | null; leaseUntil: string | null; fence: string;
  artifact: PublicationArtifact | null; failureCode: PublicationFailure | null; finalizedAt: string | null;
};
export type PublishInvoiceInput = { draftId: string; expectedVersion: number; approval: true; idempotencyKey: string };
export type PublicationReservation = PublishInvoiceInput & {
  requestFingerprint: string; attemptId: string; invoiceKey: `0x${string}`; publicationSalt: `0x${string}`;
  tokenId: string; keyVersion: number; verifierHash: string; chainId: number; contractAddress: `0x${string}`;
};
export type PublicationFence = { attemptId: string; leaseOwner: string; fence: string };
export type VoidInvoiceInput = { invoiceId: string; expectedVersion: number; approval: true; idempotencyKey: string };
export type VoidWrite = VoidInvoiceInput & { requestFingerprint: string };
export type VoidResult = { invoiceId: string; invoiceVersion: number; commercialState: "voided"; voidedAt: string };
export type GmailReadyPackage = { to: string[]; subject: string; textBody: string; htmlBody: string; paymentUrl: string; invoicePdfUrl: string };
export type SharedInvoiceLinks = { invoiceUrl: string; invoicePdfUrl: string; pdfFilename: string };
export type PublishedInvoiceResult = SharedInvoiceLinks & {
  invoiceId: string; invoiceVersion: number; invoiceNumber: string; commercialState: CommercialState;
  pdfContentHash: `0x${string}`; documentCommitment: `0x${string}`; gmailLinkPackage: GmailReadyPackage; sendApprovalRequired: true;
};
export type PublicationStatusData = {
  invoiceId: string; invoiceVersion: number; invoiceNumber: string | null; commercialState: CommercialState;
  payableUntil: string | null; voidedAt: string | null; snapshot: DraftSnapshot | null;
  attempt: PublicationAttempt | null; settlement: SettlementStatus | null;
  receipt: null | {
    state: Exclude<ReceiptDocumentState, "not_applicable">; link: LinkMaterial;
    artifact: null | { pdfFilename: string; pdfContentHash: `0x${string}` };
  };
  deliveries: DeliveryStatus[];
};
export type PublicationRepository = {
  reserve(actor: InvoiceActor, input: PublicationReservation): Promise<PublicationAttempt>;
  claim(attemptId: string | null, leaseOwner: string): Promise<PublicationAttempt | null>;
  store(input: PublicationFence & { artifact: PublicationArtifact }): Promise<PublicationAttempt | null>;
  finalize(input: PublicationFence): Promise<PublicationAttempt | null>;
  fail(input: PublicationFence & { failureCode: PublicationFailure }): Promise<PublicationAttempt | null>;
  statusData(actor: InvoiceActor, invoiceId: string): Promise<PublicationStatusData | null>;
  voidInvoice(actor: InvoiceActor, input: VoidWrite): Promise<VoidResult>;
  expire(limit: number): Promise<{ expired: number }>;
};
export type PublicationWorkerResult = { outcome: "idle" | "busy" | "finalized" | "failed" | "retryable" | "lease_lost"; attemptId?: string };
export type PublicationView = { state: PublicationState | null; failureCode: PublicationFailure | null; canShare: boolean; canVoid: boolean };
export type PublicationService = { publish(actor: InvoiceActor, input: unknown): Promise<PublishedInvoiceResult> };
export type InvoiceLifecycleService = {
  status(actor: InvoiceActor, invoiceId: string): Promise<InvoiceStatusResult>;
  share(actor: InvoiceActor, invoiceId: string): Promise<SharedInvoiceLinks>;
  void(actor: InvoiceActor, input: unknown): Promise<VoidResult>;
};
export type PublicationWorker = { run(attemptId?: string): Promise<PublicationWorkerResult> };
export type { InvoiceDocumentPort };

export class PublicationError extends Error {
  constructor(public readonly code: string, public readonly status = 409, public readonly failureCode?: PublicationFailure) {
    super(code); this.name = "PublicationError";
  }
}
