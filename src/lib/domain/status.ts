import {
  deriveDisplayStatus,
  deriveEffectiveCommercialState,
  derivePaymentStatus,
  deriveSettledAfterVoid,
  type CommercialState,
  type DisplayStatus,
  type PaymentStatus,
} from "./invoice";

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
  hasSettlement: boolean,
  deliveries: ReadonlyArray<Pick<DeliveryStatus, "state">>,
): ReceiptEmailState {
  if (!hasSettlement) {
    return "not_applicable";
  }
  if (deliveries.some(({ state }) => state === "manual_review")) {
    return "manual_review";
  }
  if (deliveries.some(({ state }) => state === "failed")) {
    return "failed";
  }
  if (deliveries.some(({ state }) => state === "sending")) {
    return "sending";
  }
  if (deliveries.length > 0 && deliveries.every(({ state }) => state === "sent")) {
    return "sent";
  }
  return "queued";
}

export function buildInvoiceStatus(facts: InvoiceStatusFacts): InvoiceStatusResult {
  const hasSettlement = facts.settlement !== null;
  const settlementFacts =
    facts.settlement === null ? null : { blockTime: new Date(facts.settlement.blockTime) };
  const commercialState =
    facts.payableUntil === null
      ? facts.commercialState
      : deriveEffectiveCommercialState(facts.commercialState, facts.now, new Date(facts.payableUntil));
  let receipt: ReceiptStatus;

  if (!hasSettlement || facts.receiptDocument === null) {
    receipt = {
      state: "not_applicable",
      pageUrl: null,
      pdfUrl: null,
      pdfFilename: null,
      pdfContentHash: null,
    };
  } else if (facts.receiptDocument.state === "ready") {
    receipt = facts.receiptDocument;
  } else {
    receipt = {
      state: facts.receiptDocument.state,
      pageUrl: null,
      pdfUrl: null,
      pdfFilename: null,
      pdfContentHash: null,
    };
  }

  return {
    schemaVersion: "payr.invoice-status.v1",
    invoiceId: facts.invoiceId,
    invoiceVersion: facts.invoiceVersion,
    invoiceNumber: facts.invoiceNumber,
    commercialState,
    paymentStatus: derivePaymentStatus(settlementFacts),
    displayStatus: deriveDisplayStatus(commercialState, settlementFacts),
    payableUntil: facts.payableUntil,
    settlement: facts.settlement,
    explorer: hasSettlement ? facts.explorer : null,
    settledAfterVoid:
      settlementFacts === null ? false : deriveSettledAfterVoid(facts.voidedAt, settlementFacts),
    invoiceDocument: facts.invoiceDocument,
    receipt,
    receiptEmail: {
      state: deriveReceiptEmailState(hasSettlement, facts.deliveries),
      deliveries: hasSettlement ? facts.deliveries : [],
    },
  };
}

export function redactPublicInvoiceStatus(status: InvoiceStatusResult): PublicInvoiceStatusResult {
  if (status.commercialState === "draft" || status.invoiceNumber === null || status.payableUntil === null) {
    throw new Error("Public invoice status requires a published invoice number and payable deadline");
  }

  return {
    schemaVersion: "payr.public-invoice-status.v1",
    invoiceVersion: status.invoiceVersion,
    invoiceNumber: status.invoiceNumber,
    commercialState: status.commercialState,
    paymentStatus: status.paymentStatus,
    displayStatus: status.displayStatus,
    payableUntil: status.payableUntil,
    settlement: status.settlement === null ? null : {
      chainId: status.settlement.chainId,
      contractAddress: status.settlement.contractAddress,
      invoiceVersion: status.settlement.invoiceVersion,
      transactionHash: status.settlement.transactionHash,
      logIndex: status.settlement.logIndex,
      blockNumber: status.settlement.blockNumber,
      blockTime: status.settlement.blockTime,
      payer: status.settlement.payer,
      payee: status.settlement.payee,
      amountDecimal: status.settlement.amountDecimal,
      amountAtomic: status.settlement.amountAtomic,
      documentCommitment: status.settlement.documentCommitment,
    },
    explorer: status.explorer === null ? null : { transactionUrl: status.explorer.transactionUrl },
    settledAfterVoid: status.settledAfterVoid,
    receipt: {
      state: status.receipt.state,
      pageUrl: status.receipt.pageUrl,
      pdfUrl: status.receipt.pdfUrl,
      pdfFilename: status.receipt.pdfFilename,
      pdfContentHash: status.receipt.pdfContentHash,
    },
    receiptEmailState: status.receiptEmail.state,
  };
}
