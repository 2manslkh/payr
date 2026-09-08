import { buildInvoiceStatus, redactPublicInvoiceStatus } from "../domain/status";
import type { InvoiceAccessTarget } from "../documents/contracts";
import type { PublicationLinkConfig } from "../invoices/publication-contracts";
import { publicationLink } from "../invoices/publication-links";

export function publicPaymentStatus(target: InvoiceAccessTarget, config: PublicationLinkConfig, now = new Date()) {
  const receipt = target.receipt;
  if (receipt?.state === "ready" && !receipt.artifact) throw new Error("Receipt unavailable");
  const receiptUrl = receipt?.state === "ready" ? publicationLink(receipt.link, "receipt-bearer", config) : null;
  return redactPublicInvoiceStatus(buildInvoiceStatus({ invoiceId: target.invoiceId, invoiceVersion: target.invoiceVersion,
    invoiceNumber: target.invoiceNumber, commercialState: target.commercialState, payableUntil: target.payableUntil,
    now, voidedAt: target.voidedAt ? new Date(target.voidedAt) : null, settlement: target.settlement,
    explorer: target.settlement ? { transactionUrl: new URL(`/tx/${target.settlement.transactionHash}`, config.explorerOrigin).href } : null,
    invoiceDocument: null,
    receiptDocument: receipt ? receipt.state === "ready" ? { state: "ready", pageUrl: receiptUrl!, pdfUrl: `${receiptUrl}/pdf`,
      pdfFilename: receipt.artifact!.pdfFilename, pdfContentHash: receipt.artifact!.pdfContentHash } : { state: receipt.state } : null,
    deliveries: target.deliveries,
  }));
}
