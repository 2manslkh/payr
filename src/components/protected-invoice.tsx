import type { PublishedInvoiceView } from "../lib/documents/contracts";
import type { InvoiceStatusResult } from "../lib/domain/status";
import { PayrWordmark } from "./payr-wordmark";
import styles from "./protected-invoice.module.css";

export type ProtectedInvoiceProps = Pick<InvoiceStatusResult, "commercialState" | "paymentStatus" | "displayStatus"> & {
  view: PublishedInvoiceView;
  qrDataUrl: string;
  pdfContentHash: string;
  documentCommitment: string;
};

// Commit Ledger extension: read the frozen document, review exact payment facts,
// and download its immutable PDF. No workspace chrome or payment simulation.
export function ProtectedInvoice({ view, qrDataUrl, pdfContentHash, documentCommitment, commercialState, paymentStatus, displayStatus }: ProtectedInvoiceProps) {
  const commercialLabels = { draft: "Draft", published: "Published", voided: "Voided", expired: "Expired" };
  return (
    <main className={styles.surface}>
      <header className={styles.masthead}>
        <PayrWordmark />
        <span>Protected invoice</span>
      </header>
      <div className={styles.heading}>
        <div><h1>Invoice {view.invoiceNumber}</h1><p>Version {view.invoiceVersion} <span aria-hidden="true">/</span> Immutable commercial record</p></div>
        <a className={styles.download} href={`${view.invoiceUrl}/pdf`} referrerPolicy="no-referrer">Download invoice PDF</a>
      </div>
      <div className={styles.layout}>
        <article className={styles.document} aria-label="Immutable invoice">
          <div className={styles.parties}>
            {(["sender", "client"] as const).map((party) => (
              <section key={party} aria-labelledby={`${party}-heading`}>
                <h2 id={`${party}-heading`}>{party === "sender" ? "From" : "Bill to"}</h2>
                <p className={styles.business}>{view[party].businessName}</p>
                <div className={styles.address}>{view[party].addressLines.map((line, index) => <div key={index}>{line}</div>)}</div>
                <p>{view[party].contactName}<br />{view[party].contactEmail}</p>
              </section>
            ))}
          </div>
          <dl className={styles.dates}>
            <div><dt>Issue date</dt><dd><time dateTime={view.issueDate}>{view.issueDate}</time></dd></div>
            <div><dt>Due date</dt><dd><time dateTime={view.dueDate}>{view.dueDate}</time></dd></div>
          </dl>
          <table className={styles.items}>
            <caption>Confirmed work</caption>
            <thead><tr><th scope="col">Description</th><th scope="col">Amount (USDC)</th></tr></thead>
            <tbody>{view.items.map((item, index) => (
              <tr key={index}><td>{item.description}</td><td>{item.amountDecimal} USDC</td></tr>
            ))}</tbody>
          </table>
          <div className={styles.total}><h2>Total</h2><p>{view.amountDecimal} USDC</p></div>
          {view.memo && <section className={styles.section}><h2>Memo</h2><p className={styles.plainText}>{view.memo}</p></section>}
          <section className={styles.section} aria-labelledby="document-proof-heading">
            <h2 id="document-proof-heading">Document proof</h2>
            <p>These values identify the finalized PDF and its invoice commitment. The PDF does not contain its own hash.</p>
            <dl className={styles.proof}>
              <div><dt>PDF content hash</dt><dd><code>{pdfContentHash}</code></dd></div>
              <div><dt>Document commitment</dt><dd><code>{documentCommitment}</code></dd></div>
            </dl>
          </section>
          <footer className={styles.footnote}>Generic commercial invoice / payment request. Not a tax-compliance document.</footer>
        </article>
        <aside className={styles.review}>
          <section aria-labelledby="payment-review-heading">
            <h2 id="payment-review-heading">Payment review</h2>
            <p className={`${styles.amount} ${view.amountDecimal.length > 18 ? styles.longAmount : ""}`}>{view.amountDecimal} USDC</p>
            <p className={styles.network}>{view.asset} on {view.network}</p>
            <dl className={styles.facts}>
              <div><dt>Payee</dt><dd>{view.sender.businessName}</dd></div>
              <div><dt>Full payout wallet</dt><dd><code>{view.payoutWallet}</code></dd></div>
              <div><dt>Technical payable deadline</dt><dd><time dateTime={view.payableUntil}>{view.payableUntil}</time></dd></div>
            </dl>
            <dl className={styles.state}>
              <div><dt>Commercial state</dt><dd>{commercialLabels[commercialState]}</dd></div>
              <div><dt>Payment status</dt><dd className={paymentStatus === "paid" ? styles.paid : undefined}>{paymentStatus === "paid" ? "Paid" : "Unpaid"}</dd></div>
            </dl>
            <p className={styles.notice}>{displayStatus === "Paid"
              ? "A verified settlement is recorded. The commercial state remains a separate fact."
              : commercialState === "expired"
                ? "The payment deadline has passed. This immutable invoice remains available to read and download."
                : "No verified settlement is recorded. Payment is not available on this page. Do not send a direct transfer as a substitute."}</p>
          </section>
        </aside>
        <section className={styles.linkSection} aria-labelledby="invoice-link-heading">
            <h2 id="invoice-link-heading">Open this invoice</h2>
            {/* A local data URL avoids sending the bearer to an image optimizer or QR service. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.qr} src={qrDataUrl} width={192} height={192} alt="QR code for this protected invoice" />
            <a className={styles.invoiceLink} href={view.invoiceUrl} referrerPolicy="no-referrer">{view.invoiceUrl}</a>
            <p>Anyone with this link or QR code can read the invoice. Share it only with the intended recipient.</p>
        </section>
      </div>
    </main>
  );
}
