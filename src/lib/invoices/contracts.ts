import type { CommercialState, DisplayStatus, PaymentStatus } from "../domain/invoice";
import type { BillingAddress, SenderProfile, ClientProfile } from "../identity/contracts";

export type InboundProvenance = { kind: "user_provided" } | { kind: "web_source"; url: string };
export type ClientField = "businessName" | "billingAddress" | "contactName" | "contactEmail";
export type ConfirmedField<T> = { value: T; provenance: InboundProvenance; confirmed: true };
export type ProposedClientFields = {
  businessName?: ConfirmedField<string>;
  billingAddress?: ConfirmedField<BillingAddress>;
  contactName?: ConfirmedField<string>;
  contactEmail?: ConfirmedField<string>;
};
export type CreateInvoiceDraftInput = {
  draftId?: string;
  expectedVersion?: number;
  client?: { id?: string; alias?: string; proposed?: ProposedClientFields };
  items?: Array<{ description?: string; amount?: string }>;
  issueDate?: string;
  dueDate?: string;
  useDefaultTerms?: boolean;
  memo?: string;
  idempotencyKey: string;
};
export type InvoiceActor = {
  workspaceId: string;
  ownerWallet: string | null;
  connectorId: string | null;
};
export type ClientBilling = { businessName: string; billingAddress: BillingAddress; contactName: string; contactEmail: string };
export type AppliedDefault = {
  field: "issueDate" | "dueDate" | "payableUntil";
  value: string;
  source: "workspace_date" | "sender_terms" | "technical_deadline";
};
export type DraftSnapshot = {
  schemaVersion: "payr.draft.v1";
  sender: SenderProfile;
  client: ClientBilling;
  clientReference: { id: string | null; alias: string | null; revision: number | null };
  clientProvenance: Record<ClientField, InboundProvenance | { kind: "saved_profile" }>;
  proposedClientChanges: { kind: "none" | "create" | "update"; fields: ProposedClientFields };
  items: Array<{ description: string; amountDecimal: string; amountAtomic: string }>;
  issueDate: string;
  dueDate: string;
  payableUntil: string;
  amountDecimal: string;
  amountAtomic: string;
  memo: string;
  appliedDefaults: AppliedDefault[];
};
export type DraftVersion = { id: string; draftId: string; version: number; snapshot: DraftSnapshot; createdAt: string };
export type DraftContext = {
  sender: SenderProfile | null;
  client: ClientProfile | null;
  previous: DraftVersion | null;
  commercialState: CommercialState | null;
};
export type DraftWrite = {
  draftId: string | null;
  expectedVersion: number | null;
  idempotencyKey: string;
  requestFingerprint: string;
  snapshot: DraftSnapshot;
};
export type DraftResult = {
  code: "DRAFT_READY";
  draftCreated: true;
  draftId: string;
  version: number;
  preview: DraftSnapshot;
  previewText: string;
  canonicalInvoiceJson: string;
  approvalInstruction: string;
};
export type InvoiceSummary = {
  id: string;
  invoiceNumber: string | null;
  version: number;
  clientName: string | null;
  amountDecimal: string | null;
  amountAtomic: string | null;
  issueDate: string | null;
  dueDate: string | null;
  payableUntil: string | null;
  commercialState: CommercialState;
  paymentStatus: PaymentStatus;
  displayStatus: DisplayStatus;
  updatedAt: string;
};
export type InvoiceQuery = { search: string; commercialState: CommercialState | null; limit: number; offset: number };
export type InvoicePage = { items: InvoiceSummary[]; hasMore: boolean };
export type InvoiceDetail = {
  invoice: InvoiceSummary;
  version: DraftVersion | null;
  history: Array<{ id: string; version: number; createdAt: string }>;
};
export type InvoiceOverview = {
  senderComplete: boolean;
  clientCount: number;
  activeConnectorCount: number;
  invoiceCount: number;
  draftCount: number;
  receivablesAtomic: string;
  attention: InvoiceSummary[];
  latestSettlement: null | { invoiceId: string; invoiceNumber: string; transactionHash: string; blockTime: string; amountDecimal: string };
};
export type DraftRepository = {
  findReplay(actor: InvoiceActor, idempotencyKey: string, requestFingerprint: string): Promise<DraftVersion | null>;
  getContext(actor: InvoiceActor, input: { draftId: string | null; clientId: string | null; clientAlias: string | null }): Promise<DraftContext>;
  saveDraft(actor: InvoiceActor, input: DraftWrite): Promise<DraftVersion>;
  listInvoices(actor: InvoiceActor, query: InvoiceQuery): Promise<InvoicePage>;
  getInvoiceDetail(actor: InvoiceActor, id: string): Promise<InvoiceDetail | null>;
  getOverview(actor: InvoiceActor): Promise<InvoiceOverview>;
};

export type InvoiceDocumentPort = {
  createOrRead(input: {
    storageKey: string; canonicalInvoiceJson: string; invoiceNumber: string; invoiceUrl: string; publicationSalt: `0x${string}`;
  }): Promise<{
    bytes: Uint8Array; contentType: "application/pdf"; byteLength: number;
    invoiceDataHash: `0x${string}`; pdfContentHash: `0x${string}`; documentCommitment: `0x${string}`; decodedQrDestination: string;
  }>;
};
