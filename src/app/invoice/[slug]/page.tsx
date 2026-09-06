import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { keccak256, toHex } from "viem";
import { ProtectedInvoice, type ProtectedInvoiceProps } from "../../../components/protected-invoice";
import { buildInvoiceStatus } from "../../../lib/domain/status";
import { buildPublishedInvoiceView, parseCanonicalInvoiceDocument } from "../../../lib/documents/invoice-view";
import { invoiceQrDataUrl } from "../../../lib/documents/invoice-pdf";
import { createDocumentRuntime } from "../../../lib/documents/runtime";
import { canonicalPublicationJson } from "../../../lib/invoices/publication-links";

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
      const status = buildInvoiceStatus({
        invoiceId: target.invoiceId, invoiceVersion: target.invoiceVersion, invoiceNumber: target.invoiceNumber,
        commercialState: target.commercialState, payableUntil: target.payableUntil, now: new Date(),
        voidedAt: target.voidedAt === null ? null : new Date(target.voidedAt), settlement: target.settlement,
        explorer: null, invoiceDocument: null, receiptDocument: null, deliveries: [],
      });
      props = { view, qrDataUrl, pdfContentHash: artifact.pdfContentHash, documentCommitment: artifact.documentCommitment,
        commercialState: status.commercialState, paymentStatus: status.paymentStatus, displayStatus: status.displayStatus };
    }
  } catch {
    // Server Components cannot set a 503 status. Never throw provider errors (or
    // carry the bearer into an error URL); the terminal response is a private 503.
    redirect("/invoice/system/unavailable");
  }
  if (!props) notFound();
  return <ProtectedInvoice {...props} />;
}
