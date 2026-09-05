import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeading } from "../../../../../components/console-ui";
import { InvoiceDocument } from "../../../../../components/invoice-document";
import { InvoiceReadError, invoiceTitle, InvoiceWorkflow, OpenClaude } from "../../../../../components/invoice-ui";
import { getDashboardSession } from "../../../../../lib/auth/runtime";
import { DraftError } from "../../../../../lib/invoices/errors";
import { invoiceId, ownerActor } from "../../../../../lib/invoices/projections";
import { getDraftRepository } from "../../../../../lib/invoices/runtime";

export const metadata = { title: "Invoice | Payr" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getDashboardSession();
  if (!session) redirect("/login");
  let id;
  try {
    id = invoiceId((await params).id);
  } catch {
    notFound();
  }
  let detail;
  try {
    detail = await getDraftRepository().getInvoiceDetail(ownerActor(session), id);
  } catch (error) {
    if (error instanceof DraftError && error.code === "NOT_FOUND") notFound();
    return <><PageHeading title="Invoice">Your workspace record.</PageHeading><InvoiceReadError href={`/app/invoices/${id}`} /></>;
  }
  if (!detail) notFound();
  return (
    <div className="invoice-surface">
      <Link className="text-link invoice-back" href="/app/invoices">Back to invoices</Link>
      <PageHeading title={invoiceTitle(detail.invoice)} action={<OpenClaude />}>
        Current version {detail.invoice.version}. Read-only facts saved with this version, not live profile data.
      </PageHeading>
      <InvoiceDocument detail={detail} />
      <InvoiceWorkflow />
    </div>
  );
}
