import type { DraftSnapshot } from "./contracts";
import type { GmailReadyPackage } from "./publication-contracts";

export function buildGmailPackage({ snapshot, invoiceNumber, invoiceUrl, invoicePdfUrl }: { snapshot: DraftSnapshot; invoiceNumber: string; invoiceUrl: string; invoicePdfUrl: string }): GmailReadyPackage {
  const subject = `Invoice ${invoiceNumber} from ${snapshot.sender.businessName}`;
  const lines = [subject, `Amount: ${snapshot.amountDecimal} USDC on Arc`, `Due: ${snapshot.dueDate}`,
    `Payment: ${invoiceUrl}`, `Invoice PDF: ${invoicePdfUrl}`];
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return {
    to: [snapshot.client.contactEmail], subject, textBody: lines.join("\n"),
    htmlBody: lines.map((line) => `<p>${line.replace(/[&<>"']/g, (character) => escapes[character])}</p>`).join("\n"),
    paymentUrl: invoiceUrl, invoicePdfUrl,
  };
}
