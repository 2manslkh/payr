import { keccak256 } from "viem";
import { DocumentUnavailableError, DocumentVerificationError, type PrivateDocumentStorage } from "./contracts";
import { buildReceiptView, receiptProofRows } from "./receipt-view";
import type { ReceiptDocumentPort } from "../receipts/contracts";

export function createReceiptDocumentPort(storage: PrivateDocumentStorage): ReceiptDocumentPort {
  return { async createOrRead(work, config) {
    const view = buildReceiptView(work, config);
    const storageKey = `workspace/${work.workspaceId}/receipt/${work.id}.pdf`;
    let stored = await storage.read(storageKey);
    if (!stored) {
      if (work.state !== "rendering") throw new DocumentUnavailableError();
      const { renderReceiptPdf } = await import("./receipt-pdf");
      await storage.create(storageKey, await renderReceiptPdf(view));
      stored = await storage.read(storageKey);
    }
    if (!stored) throw new DocumentUnavailableError();
    if (stored.contentType !== "application/pdf" || stored.byteLength !== stored.bytes.byteLength
      || stored.byteLength < 5 || stored.byteLength > 10485760) throw new DocumentVerificationError();
    const bytes = new Uint8Array(stored.bytes);
    const { inspectInvoicePdf } = await import("./pdf-verification");
    const inspection = await inspectInvoicePdf(bytes);
    const expected = ["Payr", "Receipt", view.invoiceNumber, `Version ${view.invoiceVersion}`, "Amount settled", `${view.amountDecimal} USDC`,
      `Atomic units: ${view.amountAtomic} atomic units`, ...receiptProofRows(view).flat(), "Receipt verification",
      "Open this protected receipt to inspect settlement proof.", view.receiptUrl, "Verified settlement record"];
    const compact = (value: string) => value.replace(/\s+/g, "");
    if (inspection.pageCount !== 1 || inspection.qrDestinations.length !== 1 || inspection.qrDestinations[0] !== view.receiptUrl
      || compact(inspection.text) !== compact(expected.join("\n")) || inspection.textItems.some((item) =>
        item.page !== 1 || ![item.x, item.y, item.width, item.height].every(Number.isFinite) || item.width <= 0 || item.height <= 0
        || item.x < 0 || item.x + item.width > 595.5 || item.y < item.height || item.y > 842.5)) throw new DocumentVerificationError();
    const artifact = { storageKey, pdfFilename: `receipt-${view.invoiceNumber}-v${view.invoiceVersion}.pdf`, contentType: "application/pdf" as const,
      byteLength: bytes.byteLength, pdfContentHash: keccak256(bytes), qrVerified: true as const };
    if (work.artifact && (work.artifact.pdfContentHash !== artifact.pdfContentHash || work.artifact.byteLength !== artifact.byteLength)) throw new DocumentVerificationError();
    return artifact;
  } };
}
