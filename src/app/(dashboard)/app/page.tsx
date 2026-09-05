import Link from "next/link";
import { redirect } from "next/navigation";
import { DateValue, PageHeading } from "../../../components/console-ui";
import { commercialLabels, InvoiceReadError, invoiceTitle, InvoiceWorkflow, OpenClaude } from "../../../components/invoice-ui";
import { getDashboardSession } from "../../../lib/auth/runtime";
import { ownerActor, receivablesDecimal } from "../../../lib/invoices/projections";
import { getDraftRepository } from "../../../lib/invoices/runtime";

export const metadata = { title: "Overview | Payr" };

export default async function OverviewPage() {
  const session = await getDashboardSession();
  if (!session) redirect("/login");
  let overview;
  try {
    overview = await getDraftRepository().getOverview(ownerActor(session));
  } catch {
    return <><PageHeading title="Overview">Your workspace records.</PageHeading><InvoiceReadError href="/app" /></>;
  }
  const setupIncomplete = !overview.senderComplete || overview.clientCount === 0 || overview.activeConnectorCount === 0;
  return (
    <div className="invoice-surface">
      <PageHeading title="Overview" action={<OpenClaude />}>
        Your receivables, draft reviews, and recorded payment evidence.
      </PageHeading>
      <section className="invoice-receivables" aria-labelledby="receivables-heading">
        <div><h2 id="receivables-heading">Receivables</h2><p className="muted">Drafts are excluded. Payment evidence is recorded separately.</p></div>
        <p className="invoice-total" data-testid="receivables">{receivablesDecimal(overview.receivablesAtomic)} USDC</p>
        <p className="invoice-counts">{overview.invoiceCount} invoices in the workspace <span>{overview.draftCount} drafts</span></p>
      </section>
      {setupIncomplete && <section className="ledger-section">
        <div className="section-heading">
          <h2>Prepare your workspace</h2>
          <span>Only incomplete steps are shown</span>
        </div>
        <ol className="setup-list">
          {!overview.senderComplete && <li>
            <div>
              <h3>Set your sender identity</h3>
              <p>Add your business and billing details, payment terms, and invoice prefix. Review the wallet that will receive payment.</p>
            </div>
            <Link className="button secondary" href="/app/settings">Open settings</Link>
          </li>}
          {overview.clientCount === 0 && <li>
            <div>
              <h3>Keep client details ready</h3>
              <p>Save confirmed billing information so drafts can use the right client record.</p>
            </div>
            <Link className="button secondary" href="/app/clients">Manage clients</Link>
          </li>}
          {overview.activeConnectorCount === 0 && <li>
            <div>
              <h3>Review agent access</h3>
              <p>No active credentials are recorded. Review access limits before connecting an agent in a future release.</p>
            </div>
            <Link className="button secondary" href="/app/connections">View connections</Link>
          </li>}
        </ol>
      </section>}
      <section className="ledger-section" aria-labelledby="invoice-attention-heading">
        <div className="section-heading"><h2 id="invoice-attention-heading">Needs attention</h2><Link className="text-link" href="/app/invoices">View all invoices</Link></div>
        {overview.attention.length === 0 ? <div className="empty-state"><h3>No invoices need attention</h3><p>Drafts and invoices requiring review will appear here.</p></div> : (
          <ol className="invoice-attention" aria-label="Invoice attention">{overview.attention.map((invoice) => (
            <li key={invoice.id}>
              <div><Link className="text-link" href={`/app/invoices/${invoice.id}`}>{invoiceTitle(invoice)}</Link><p>{invoice.clientName ?? "Client unavailable"}</p></div>
              <p>{commercialLabels[invoice.commercialState]} <span className="muted">/ {invoice.paymentStatus === "paid" ? "Paid" : "Unpaid"}</span></p>
              <p className="invoice-amount">{invoice.amountDecimal === null ? "Amount unavailable" : `${invoice.amountDecimal} USDC`}</p>
            </li>
          ))}</ol>
        )}
      </section>
      {overview.latestSettlement && <section className="invoice-settlement" aria-labelledby="latest-settlement-heading">
        <h2 id="latest-settlement-heading">Latest settlement</h2>
        <Link className="text-link" href={`/app/invoices/${overview.latestSettlement.invoiceId}`}>{overview.latestSettlement.invoiceNumber}</Link>
        <p className="invoice-total">{overview.latestSettlement.amountDecimal} USDC</p>
        <dl className="record-details"><dt>Transaction</dt><dd className="technical">{overview.latestSettlement.transactionHash}</dd><dt>Block time</dt><dd><DateValue value={overview.latestSettlement.blockTime} /></dd></dl>
      </section>}
      <InvoiceWorkflow />
    </div>
  );
}
