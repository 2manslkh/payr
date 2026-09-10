import { keccak256 } from "viem";
import { ARC_TESTNET_CHAIN_ID } from "../chain/arc";
import { DocumentUnavailableError, DocumentVerificationError, type PrivateDocumentStorage } from "../documents/contracts";
import type { PublicationLinkConfig } from "../invoices/publication-contracts";
import { publicationLink } from "../invoices/publication-links";
import { receiptRecipients } from "./address";
import type { InvoiceDeliveryWork, ReceiptEmailPayload } from "./outbox-contracts";
import { resendEmailPayloadSchema } from "./resend";
import { buildInvoiceEmail } from "./templates";

export async function prepareInvoiceEmail(work: InvoiceDeliveryWork, links: PublicationLinkConfig, storage: PrivateDocumentStorage): Promise<ReceiptEmailPayload> {
  const attempt = work.publication, artifact = attempt.artifact;
  const expected = receiptRecipients(attempt.snapshot.sender.contactEmail!, attempt.snapshot.client.contactEmail)
    .find((recipient) => recipient.normalizedRecipient === work.normalizedRecipient);
  if (attempt.id !== work.publicationAttemptId || attempt.workspaceId !== work.workspaceId || attempt.state !== "finalized"
    || !artifact?.qrVerified || attempt.chainId !== ARC_TESTNET_CHAIN_ID || !expected || expected.roles.join(",") !== work.roles.join(",")
    || work.emailConfig.templateVersion !== "invoice-issued-v1" || work.emailConfig.network !== "Arc Testnet") throw new DocumentVerificationError();
  // Read frozen bytes, never regenerate a document or consult mutable client/profile data.
  const stored = await storage.read(attempt.storageKey);
  if (!stored) throw new DocumentUnavailableError();
  if (stored.contentType !== "application/pdf" || stored.byteLength < 5 || stored.byteLength > 10485760
    || stored.byteLength !== artifact.byteLength || stored.bytes.length !== artifact.byteLength
    || !Buffer.from(stored.bytes.subarray(0, 5)).equals(Buffer.from("%PDF-"))
    || keccak256(stored.bytes) !== artifact.pdfContentHash) throw new DocumentVerificationError();
  const invoiceUrl = publicationLink(attempt.link, "invoice-bearer", { ...links, appOrigin: work.emailConfig.appOrigin });
  const content = buildInvoiceEmail({ audience: work.roles.length === 2 ? "both" : work.roles[0], network: "Arc Testnet", attachmentIncluded: true,
    clientBusinessName: attempt.snapshot.client.businessName, businessName: attempt.snapshot.sender.businessName!,
    invoiceNumber: attempt.invoiceNumber, amountDecimal: attempt.snapshot.amountDecimal, dueDate: attempt.snapshot.dueDate,
    invoiceUrl, invoicePdfUrl: `${invoiceUrl}/pdf` });
  // Fail preparation before the outbox records a provider-attempt marker.
  const payload = resendEmailPayloadSchema.safeParse({ from: work.emailConfig.from, to: [work.normalizedRecipient], subject: content.subject,
    html: content.htmlBody, text: content.textBody,
    attachments: [{ filename: artifact.pdfFilename, content: Buffer.from(stored.bytes).toString("base64") }] });
  if (!payload.success) throw new DocumentVerificationError();
  return payload.data;
}
