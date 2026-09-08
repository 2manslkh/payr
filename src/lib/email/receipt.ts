import { DocumentVerificationError, type PrivateDocumentStorage } from "../documents/contracts";
import { createReceiptDocumentPort } from "../documents/receipt-storage";
import { buildReceiptView } from "../documents/receipt-view";
import type { PublicationLinkConfig } from "../invoices/publication-contracts";
import { readReceiptBytes } from "../receipts/bytes";
import type { DeliveryWork, ReceiptEmailPayload } from "./outbox-contracts";
import { buildReceiptEmail } from "./templates";
import { receiptRecipients, receiptSenderSchema } from "./address";

export async function prepareReceiptEmail(work: DeliveryWork, config: PublicationLinkConfig, storage: PrivateDocumentStorage, from: string): Promise<ReceiptEmailPayload> {
  const receipt = work.receipt;
  const expected = receiptRecipients(receipt.attempt.snapshot.sender.contactEmail!, receipt.attempt.snapshot.client.contactEmail)
    .find((entry) => entry.normalizedRecipient === work.normalizedRecipient);
  if (!expected || expected.roles.join(",") !== work.roles.join(",") || receipt.state !== "ready" || !receipt.artifact) throw new DocumentVerificationError();
  await createReceiptDocumentPort(storage).createOrRead(receipt, config);
  const bytes = await readReceiptBytes(receipt, storage);
  const view = buildReceiptView(receipt, config);
  const content = buildReceiptEmail({ audience: work.roles.length === 2 ? "both" : work.roles[0],
    invoiceNumber: view.invoiceNumber, businessName: receipt.attempt.snapshot.sender.businessName!,
    clientBusinessName: receipt.attempt.snapshot.client.businessName, amountDecimal: view.amountDecimal, settledAt: view.blockTime,
    transactionHash: view.transactionHash, receiptUrl: view.receiptUrl });
  return { from: receiptSenderSchema.parse(from), to: [work.normalizedRecipient], subject: content.subject,
    html: content.htmlBody, text: content.textBody,
    attachments: [{ filename: receipt.artifact.pdfFilename, content: Buffer.from(bytes).toString("base64") }] };
}
