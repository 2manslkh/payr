import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DateValue, PageHeading } from "./console-ui";
import { commercialLabels, InvoiceReadError, invoiceTitle, OpenClaude } from "./invoice-ui";
import { AnimatedNumber, Skeleton } from "./console-motion";
import { WalletBalance } from "./wallet-balance";
import { getDashboardSession } from "../lib/auth/runtime";
import { ownerActor, receivablesDecimal } from "../lib/invoices/projections";
import { getDraftRepository } from "../lib/invoices/runtime";
import type { InvoiceOverview } from "../lib/invoices/contracts";
import styles from "./overview.module.css";

export default function OverviewPage() {
  return <Suspense fallback={<OverviewLoading />}><OverviewContent /></Suspense>;
}

function OverviewLoading() {
  return <>
    <PageHeading title="Overview">Your balance, what you&apos;re owed, and what&apos;s next.</PageHeading>
    <div role="status" aria-label="Loading overview...">
      <div className={styles.summary} aria-hidden="true">
        <div className={styles.loadingSummary}><Skeleton /><Skeleton /></div>
        <div className={styles.loadingSummary}><Skeleton /><Skeleton /></div>
      </div>
      <div className={styles.loadingRows}><Skeleton /><Skeleton /><Skeleton /></div>
    </div>
  </>;
}

export async function OverviewContent() {
  const session = await getDashboardSession();
  if (!session) redirect("/login");
  let overview: Promise<InvoiceOverview | null>;
  try {
    overview = getDraftRepository().getOverview(ownerActor(session)).catch(() => null);
  } catch { overview = Promise.resolve(null); }
  return (
    <div className={`${styles.surface} content-reveal`}>
      <PageHeading title="Overview" action={<OpenClaude />}>
        Your balance, what you&apos;re owed, and what&apos;s next.
      </PageHeading>
      <div className={styles.summary}>
        <WalletBalance ownerWallet={session.ownerWallet} />
        <Suspense fallback={<div className={`${styles.receivables} ${styles.loadingSummary}`} role="status" aria-label="Loading invoice records..."><Skeleton /><Skeleton /></div>}>
          <OverviewRecords overview={overview} />
        </Suspense>
      </div>
      <footer className={styles.installLink}><p>Connect Payr in <Link className="text-link" href="/app/connections">Connections</Link> to use its tools in Claude. Plugin installation is coming separately.</p><Link className="text-link" href="/install">Agent installation guide</Link></footer>
    </div>
  );
}

export async function OverviewRecords({ overview: pending }: { overview: Promise<InvoiceOverview | null> }) {
  const overview = await pending;
  const setupIncomplete = overview && (!overview.senderComplete || overview.clientCount === 0 || overview.activeConnectorCount === 0);
  return <>
        <section className={styles.receivables} aria-labelledby="receivables-heading">
          <div className={styles.metricHeading}><h2 id="receivables-heading">Outstanding receivables</h2><span>Workspace invoices</span></div>
          {overview ? <>
            <p className={styles.receivableAmount} data-testid="receivables"><AnimatedNumber value={receivablesDecimal(overview.receivablesAtomic)} /> <span className={styles.unit}>USDC</span></p>
            <p className={styles.outstanding}><strong><AnimatedNumber value={String(overview.outstandingInvoiceCount)} /></strong> {overview.outstandingInvoiceCount === 1 ? "invoice to receive" : "invoices to receive"}</p>
            {overview.receivablesUnavailableCount > 0 && <p className="attention">Known amount only. {overview.receivablesUnavailableCount} outstanding {overview.receivablesUnavailableCount === 1 ? "invoice has" : "invoices have"} an unavailable amount.</p>}
            <p className={styles.receivablesNote}>Unpaid published and expired invoices. Drafts and voids are excluded.</p>
            <div className={styles.receivablesFooter}><p>{overview.draftCount} {overview.draftCount === 1 ? "draft" : "drafts"} in progress</p><Link className="text-link" href="/app/invoices">View invoices</Link></div>
          </> : <InvoiceReadError href="/app" />}
        </section>
      {overview && <div className={`${styles.operations} ${overview.latestSettlement ? styles.withSettlement : ""}`}>
        <section className={styles.attention} aria-labelledby="invoice-attention-heading">
          <div className={styles.attentionHeader}><h2 id="invoice-attention-heading">Needs attention</h2><Link className="text-link" href="/app/invoices">View all invoices</Link></div>
          {overview.attention.length === 0 ? <div className={styles.empty}><h3>No invoices need attention</h3><p>Drafts and unpaid invoices will appear here, with expired invoices first.</p></div> : (
            <ol className={styles.attentionList} aria-label="Invoice attention">{overview.attention.map((invoice) => (
              <li key={invoice.id}>
                <div><Link className="text-link" href={`/app/invoices/${invoice.id}`}>{invoiceTitle(invoice)}</Link><p>{invoice.clientName ?? "Client unavailable"}</p><p className={styles.invoiceState}>{commercialLabels[invoice.commercialState]} / {invoice.paymentStatus === "paid" ? "Paid" : "Unpaid"}</p></div>
                <p className={styles.amount}>{invoice.amountDecimal === null ? "Amount unavailable" : `${invoice.amountDecimal} USDC`}</p>
              </li>
            ))}</ol>
          )}
        </section>
        {overview.latestSettlement && <section className={styles.proof} aria-labelledby="latest-settlement-heading">
          <h2 id="latest-settlement-heading">Latest settlement</h2>
          <p className={styles.proofLabel}>Verified onchain payment</p>
          <p className={styles.proofAmount}>{overview.latestSettlement.amountDecimal} USDC</p>
          <Link className="text-link" href={`/app/invoices/${overview.latestSettlement.invoiceId}`}>{overview.latestSettlement.invoiceNumber}</Link>
          <dl><dt>Transaction</dt><dd className="technical">{overview.latestSettlement.transactionHash}</dd><dt>Block time</dt><dd><DateValue value={overview.latestSettlement.blockTime} /></dd></dl>
        </section>}
      </div>}
      {setupIncomplete && overview && <section className={`ledger-section ${styles.setup}`}>
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
              <p>No active credentials are recorded. Review access limits, create a credential, and add Payr to Claude.</p>
            </div>
            <Link className="button secondary" href="/app/connections">View connections</Link>
          </li>}
        </ol>
      </section>}
  </>;
}
