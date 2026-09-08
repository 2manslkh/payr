import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { keccak256, toHex } from "viem";
import { ProtectedInvoice, type ProtectedInvoiceProps } from "../../../components/protected-invoice";
import { buildInvoiceStatus, type InvoiceStatusFacts } from "../../../lib/domain/status";
import { buildPublishedInvoiceView, parseCanonicalInvoiceDocument } from "../../../lib/documents/invoice-view";
import { invoiceQrDataUrl } from "../../../lib/documents/invoice-pdf";
import { createDocumentRuntime } from "../../../lib/documents/runtime";
import { canonicalPublicationJson, publicationLink } from "../../../lib/invoices/publication-links";
import { createWalletPaymentEnv } from "../../../config/env";
import { publicPaymentStatus } from "../../../lib/payments/public-status";
import { validatePaymentStatus } from "../../../lib/payments/payment-contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Protected invoice | Payr", robots: { index: false, follow: false } };

export default async function InvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  let props: ProtectedInvoiceProps | null = null;
  try {
    const { slug } = await params;
    const runtime = createDocumentRuntime();
    // Independent authorization, without charging Proxy's admission a second time.
    const target = await runtime.access.resolve(slug);
    if (target) {
      const { attempt } = target;
      const artifact = attempt.artifact;
      const json = canonicalPublicationJson(attempt);
      if (!artifact || keccak256(toHex(json)) !== artifact.invoiceDataHash) throw new Error();
      const document = parseCanonicalInvoiceDocument(json);
      const invoiceUrl = new URL(`/invoice/${slug}`, runtime.config.appOrigin).href;
      const view = buildPublishedInvoiceView(document, invoiceUrl);
      const qrDataUrl = await invoiceQrDataUrl(invoiceUrl);
      const receipt = target.receipt;
      let receiptDocument: InvoiceStatusFacts["receiptDocument"] = null;
      if (receipt !== null) {
        if (receipt.state === "ready") {
          if (!receipt.artifact) throw new Error();
          const receiptUrl = publicationLink(receipt.link, "receipt-bearer", runtime.config);
          receiptDocument = { state: "ready", pageUrl: receiptUrl, pdfUrl: `${receiptUrl}/pdf`,
            pdfFilename: receipt.artifact.pdfFilename, pdfContentHash: receipt.artifact.pdfContentHash };
        } else receiptDocument = { state: receipt.state };
      }
      const status = buildInvoiceStatus({
        invoiceId: target.invoiceId, invoiceVersion: target.invoiceVersion, invoiceNumber: target.invoiceNumber,
        commercialState: target.commercialState, payableUntil: target.payableUntil, now: new Date(),
        voidedAt: target.voidedAt === null ? null : new Date(target.voidedAt), settlement: target.settlement,
        explorer: null, invoiceDocument: null, receiptDocument, deliveries: target.deliveries,
      });
      props = { view, qrDataUrl, pdfContentHash: artifact.pdfContentHash, documentCommitment: artifact.documentCommitment,
        commercialState: status.commercialState, paymentStatus: status.paymentStatus, displayStatus: status.displayStatus,
        receipt: status.receipt, receiptEmailState: status.receiptEmail.state };
      const wallet = createWalletPaymentEnv();
      if (wallet && document.chainId === 5042002) {
        const setup = { ...wallet, invoiceKey: document.invoiceKey, contractAddress: document.contractAddress,
          documentCommitment: artifact.documentCommitment, payee: view.payoutWallet as `0x${string}`,
          amountAtomic: view.amountAtomic, amountDecimal: view.amountDecimal, payableUntil: view.payableUntil };
        props.payment = { setup, initialStatus: validatePaymentStatus(publicPaymentStatus(target, runtime.config), setup) };
      }
    }
  } catch {
    // Server Components cannot set a 503 status. Never throw provider errors (or
    // carry the bearer into an error URL); the terminal response is a private 503.
    redirect("/invoice/system/unavailable");
  }
  if (!props) notFound();
  return <ProtectedInvoice {...props} />;
}
