import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isDeepStrictEqual } from "node:util";
import { ProtectedReceipt } from "../../../components/protected-receipt";
import { buildReceiptView } from "../../../lib/documents/receipt-view";
import { receiptQrDataUrl } from "../../../lib/documents/receipt-pdf";
import { createReceiptDocumentPort } from "../../../lib/documents/receipt-storage";
import { createReceiptRuntime } from "../../../lib/receipts/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Protected receipt | Payr", robots: { index: false, follow: false } };

export default async function ReceiptPage({ params }: { params: Promise<{ slug: string }> }) {
  let props = null;
  try {
    const { slug } = await params;
    const runtime = createReceiptRuntime();
    const target = await runtime.access.resolve(slug);
    if (target) {
      const view = buildReceiptView(target, runtime.config);
      const artifact = await createReceiptDocumentPort(runtime.storage).createOrRead(target, runtime.config);
      const qrDataUrl = await receiptQrDataUrl(view.receiptUrl);
      const current = await runtime.access.resolve(slug);
      if (current) {
        if (current.id !== target.id || !isDeepStrictEqual(current.artifact, target.artifact)
          || !isDeepStrictEqual(buildReceiptView(current, runtime.config), view)) throw new Error();
        props = { view, qrDataUrl, pdfContentHash: artifact.pdfContentHash };
      }
    }
  } catch { redirect("/receipt/system/unavailable"); }
  if (!props) notFound();
  return <ProtectedReceipt {...props} />;
}
