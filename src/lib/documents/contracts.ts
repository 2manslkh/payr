import type { DraftSnapshot } from "../invoices/contracts";
import type { LinkMaterial, PublicationAttempt, PublicationState, PublicationStatusData } from "../invoices/publication-contracts";

export type CanonicalInvoiceDocument = {
  schemaVersion: "payr.invoice-document.v1";
  invoiceId: string; invoiceVersion: number; invoiceNumber: string;
  invoiceKey: `0x${string}`; chainId: number; contractAddress: `0x${string}`;
  invoice: DraftSnapshot;
};
export type PublishedInvoiceParty = {
  businessName: string; contactName: string; contactEmail: string; addressLines: string[];
};
export type PublishedInvoiceView = {
  invoiceNumber: string; invoiceVersion: number; issueDate: string; dueDate: string; payableUntil: string;
  sender: PublishedInvoiceParty; client: PublishedInvoiceParty;
  items: Array<{ description: string; amountDecimal: string; amountAtomic: string }>;
  amountDecimal: string; amountAtomic: string; memo: string; payoutWallet: string;
  asset: "USDC"; network: "Arc"; invoiceUrl: string;
};
export type StoredDocument = { bytes: Uint8Array; contentType: string; byteLength: number };
export type PrivateDocumentStorage = {
  read(storageKey: string): Promise<StoredDocument | null>;
  create(storageKey: string, bytes: Uint8Array): Promise<"created" | "exists">;
};
export type InvoiceAccessCandidate = LinkMaterial & {
  purpose: "invoice-bearer" | "receipt-bearer";
  workspaceId: string; invoiceId: string; invoiceVersionId: string;
};
export type InvoiceAccessTarget = PublicationStatusData & { attempt: PublicationAttempt };
export type DocumentRepository = {
  findCandidate(tokenId: string): Promise<InvoiceAccessCandidate | null>;
  readTarget(tokenId: string): Promise<InvoiceAccessTarget | null>;
  storageState(storageKey: string): Promise<PublicationState | null>;
  admit(scope: "ip" | "token", keyHash: string): Promise<{ allowed: boolean }>;
};
export type PdfInspection = { pageCount: number; qrDestinations: string[]; text: string };

export class DocumentVerificationError extends Error {
  constructor() { super("ARTIFACT_VERIFICATION_FAILED"); this.name = "DocumentVerificationError"; }
}
export class DocumentUnavailableError extends Error {
  constructor() { super("DOCUMENT_UNAVAILABLE"); this.name = "DocumentUnavailableError"; }
}
