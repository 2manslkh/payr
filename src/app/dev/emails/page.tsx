import { notFound } from "next/navigation";
import { buildInvoiceEmail, buildReceiptEmail } from "../../../lib/email/templates";
import { EmailPreview } from "./preview";

export const metadata = { title: "Email previews | Payr", robots: { index: false, follow: false } };

export default function EmailPreviewsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const logoOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const invoice = {
    clientBusinessName: "Fieldwork Labs", network: "Arc Testnet" as const, attachmentIncluded: true,
    invoiceNumber: "INV-2026-000042", businessName: "Northline Studio", amountDecimal: "2450.00",
    dueDate: "2026-09-30", invoiceUrl: "https://payr.example/invoice/demo", invoicePdfUrl: "https://payr.example/invoice/demo/pdf",
  };
  const receipt = {
    ...invoice, clientBusinessName: "Fieldwork Labs", settledAt: "2026-09-06T14:32:08Z",
    transactionHash: `0x${"a1b2c3d4".repeat(8)}`, receiptUrl: "https://payr.example/receipt/demo",
  };
  const long = { businessName: "Northline Architecture, Research & International Design Partnership",
    clientBusinessName: "Fieldwork Laboratories & International Infrastructure Research Cooperative",
    amountDecimal: "12345678901234567890.123456789012345678" };
  const previews = [
    { label: "Invoice / Client", ...buildInvoiceEmail({ ...invoice, audience: "client" }, logoOrigin) },
    { label: "Invoice / Issuer", ...buildInvoiceEmail({ ...invoice, audience: "issuer" }, logoOrigin) },
    { label: "Invoice / Both roles", ...buildInvoiceEmail({ ...invoice, audience: "both" }, logoOrigin) },
    { label: "Receipt / Client", ...buildReceiptEmail({ ...receipt, audience: "client" }, logoOrigin) },
    { label: "Receipt / Issuer", ...buildReceiptEmail({ ...receipt, audience: "issuer" }, logoOrigin) },
    { label: "Receipt / Both roles", ...buildReceiptEmail({ ...receipt, audience: "both" }, logoOrigin) },
    { label: "Invoice / Client / Long content", ...buildInvoiceEmail({ ...invoice, ...long, audience: "client" }, logoOrigin) },
    { label: "Invoice / Issuer / Long content", ...buildInvoiceEmail({ ...invoice, ...long, audience: "issuer" }, logoOrigin) },
    { label: "Invoice / Both roles / Long content", ...buildInvoiceEmail({ ...invoice, ...long, audience: "both" }, logoOrigin) },
    { label: "Receipt / Long content", ...buildReceiptEmail({ ...receipt, ...long, audience: "both" }, logoOrigin) },
  ];
  return <EmailPreview previews={previews} />;
}
