import type { DraftSnapshot } from "./contracts";
import type { GmailReadyPackage } from "./publication-contracts";
import { buildInvoiceEmail } from "../email/templates";

export function buildGmailPackage({ snapshot, invoiceNumber, invoiceUrl, invoicePdfUrl }: { snapshot: DraftSnapshot; invoiceNumber: string; invoiceUrl: string; invoicePdfUrl: string }): GmailReadyPackage {
  if (!snapshot.sender.businessName) throw new Error("Invoice email requires the confirmed sender business name");
  const { subject, textBody, htmlBody } = buildInvoiceEmail({ invoiceNumber, businessName: snapshot.sender.businessName,
    amountDecimal: snapshot.amountDecimal, dueDate: snapshot.dueDate, invoiceUrl, invoicePdfUrl });
  return {
    to: [snapshot.client.contactEmail], subject, textBody, htmlBody,
    paymentUrl: invoiceUrl, invoicePdfUrl,
  };
}
