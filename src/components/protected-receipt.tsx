import { PayrWordmark } from "./payr-wordmark";
import { receiptProofRows, type ReceiptView } from "../lib/documents/receipt-view";
import styles from "./protected-invoice.module.css";
import receiptStyles from "./protected-receipt.module.css";

// Commit Ledger document extension: settlement evidence, not dashboard chrome or a new payment action.
export function ProtectedReceipt({ view, qrDataUrl, pdfContentHash }: { view: ReceiptView; qrDataUrl: string; pdfContentHash: string }) {
  return <main className={styles.surface}>
    <header className={styles.masthead}><PayrWordmark /><span>Protected receipt</span></header>
    <div className={styles.heading}><div><h1>Receipt {view.invoiceNumber}</h1><p>Invoice version {view.invoiceVersion}. Immutable payment evidence.</p></div>
      <a className={styles.download} href={`${view.receiptUrl}/pdf`} referrerPolicy="no-referrer">Download receipt PDF</a></div>
    <div className={styles.layout}>
      <article className={styles.document} aria-label="Verified payment receipt"><h2>Settlement evidence</h2>
        <dl className={`${styles.proof} ${receiptStyles.proof}`}>
          {receiptProofRows(view).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{label === "Explorer"
            ? <a href={value} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">View transaction on Arc explorer</a>
            : <code>{value}</code>}</dd></div>)}
          <div><dt>Receipt PDF hash</dt><dd><code>{pdfContentHash}</code></dd></div>
        </dl>
        <footer className={styles.footnote}>This receipt records a verified USDC settlement. It does not alter the invoice&apos;s retained commercial state.</footer>
      </article>
      <aside className={`${styles.review} ${receiptStyles.settlement}`} aria-label="Verified settlement">
        <h2>Payment verified</h2><p className={`${styles.amount} ${view.amountDecimal.length > 18 ? styles.longAmount : ""}`}>{view.amountDecimal} USDC</p>
        <p className={styles.network}>{view.network}</p><dl className={styles.facts}>
          <div><dt>Exact atomic units</dt><dd><code>{view.amountAtomic}</code></dd></div>
          <div><dt>Settled at</dt><dd><time dateTime={view.blockTime}>{view.blockTime}</time></dd></div>
        </dl><p>One recorded payment. No further payment is requested.</p>
      </aside>
      <section className={styles.linkSection} aria-labelledby="receipt-link-heading"><h2 id="receipt-link-heading">Open this receipt</h2>
        {/* Local QR bytes never send the bearer to an optimizer or external image provider. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.qr} src={qrDataUrl} width={192} height={192} alt="QR code for this protected receipt" />
        <a className={styles.invoiceLink} href={view.receiptUrl} referrerPolicy="no-referrer">{view.receiptUrl}</a>
        <p>Anyone with this link or QR can read the receipt. Share it only with the intended recipient.</p>
      </section>
    </div>
  </main>;
}
