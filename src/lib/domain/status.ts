import type { CommercialState, DisplayStatus, PaymentStatus } from "./invoice";

export type ReceiptDocumentState =
  | "not_applicable"
  | "pending"
  | "rendering"
  | "retry_wait"
  | "ready"
  | "failed";

export type DeliveryState = "pending" | "sending" | "retry_wait" | "sent" | "manual_review" | "failed";
export type ReceiptEmailState = "not_applicable" | "queued" | "sending" | "sent" | "failed" | "manual_review";

export type SettlementStatus = Readonly<{
  chainId: number;
  contractAddress: `0x${string}`;
  invoiceVersion: number;
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber: string;
  blockTime: string;
  payer: `0x${string}`;
  payee: `0x${string}`;
  amountDecimal: string;
  amountAtomic: string;
  documentCommitment: `0x${string}`;
}>;

export type ReadyInvoiceDocument = Readonly<{
  state: "ready";
  pageUrl: string;
  pdfUrl: string;
  pdfFilename: string;
  pdfContentHash: `0x${string}`;
}>;

export type ReceiptStatus = Readonly<{
  state: ReceiptDocumentState;
  pageUrl: string | null;
  pdfUrl: string | null;
  pdfFilename: string | null;
  pdfContentHash: `0x${string}` | null;
}>;

export type DeliveryStatus = Readonly<{
  roles: Array<"issuer" | "client">;
  normalizedRecipient: string;
  state: DeliveryState;
  providerMessageId: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
}>;

export type InvoiceStatusResult = Readonly<{
  schemaVersion: "payr.invoice-status.v1";
  invoiceId: string;
  invoiceVersion: number;
  invoiceNumber: string | null;
  commercialState: CommercialState;
  paymentStatus: PaymentStatus;
  displayStatus: DisplayStatus;
  payableUntil: string | null;
  settlement: SettlementStatus | null;
  explorer: { transactionUrl: string } | null;
  settledAfterVoid: boolean;
  invoiceDocument: ReadyInvoiceDocument | null;
  receipt: ReceiptStatus;
  receiptEmail: Readonly<{
    state: ReceiptEmailState;
    deliveries: DeliveryStatus[];
  }>;
}>;

export type PublicInvoiceStatusResult = Readonly<{
  schemaVersion: "payr.public-invoice-status.v1";
  invoiceVersion: number;
  invoiceNumber: string;
  commercialState: CommercialState;
  paymentStatus: PaymentStatus;
  displayStatus: DisplayStatus;
  payableUntil: string;
  settlement: SettlementStatus | null;
  explorer: { transactionUrl: string } | null;
  settledAfterVoid: boolean;
  receipt: ReceiptStatus;
  receiptEmailState: ReceiptEmailState;
}>;

export type ReceiptDocumentFacts =
  | Readonly<{ state: Exclude<ReceiptDocumentState, "not_applicable" | "ready"> }>
  | Readonly<{
      state: "ready";
      pageUrl: string;
      pdfUrl: string;
      pdfFilename: string;
      pdfContentHash: `0x${string}`;
    }>;

export type InvoiceStatusFacts = Readonly<{
  invoiceId: string;
  invoiceVersion: number;
  invoiceNumber: string | null;
  commercialState: CommercialState;
  payableUntil: string | null;
  now: Date;
  voidedAt: Date | null;
  settlement: SettlementStatus | null;
  explorer: { transactionUrl: string } | null;
  invoiceDocument: ReadyInvoiceDocument | null;
  receiptDocument: ReceiptDocumentFacts | null;
  deliveries: DeliveryStatus[];
}>;

export function deriveReceiptEmailState(
  _hasSettlement: boolean,
  _deliveries: ReadonlyArray<Pick<DeliveryStatus, "state">>,
): ReceiptEmailState {
  throw new Error("F1 implementation pending");
}

export function buildInvoiceStatus(_facts: InvoiceStatusFacts): InvoiceStatusResult {
  throw new Error("F1 implementation pending");
}

export function redactPublicInvoiceStatus(_status: InvoiceStatusResult): PublicInvoiceStatusResult {
  throw new Error("F1 implementation pending");
}
