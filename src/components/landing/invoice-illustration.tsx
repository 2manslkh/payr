import styles from "./workflow.module.css";

/** Inert demonstration document, not a payable invoice or a live settlement. */
export function InvoiceIllustration() {
  return (
    <div className={styles.documentScene} aria-hidden="true">
      <div className={styles.backSheet} />
      <div className={styles.proofSheet}>
        <span className={styles.proofSymbol}>
          <svg viewBox="0 0 32 32" fill="none"><path d="m9 16 5 5 10-11" stroke="currentColor" strokeWidth="2" /></svg>
        </span>
        <span>Verified.</span>
        <small>Invoice-linked.</small>
        <div className={styles.proofRules}><i /><i /><i /></div>
      </div>
      <div className={styles.paper} data-invoice-paper>
        <div className={styles.paperTop}><span>Payr</span><span>Invoice</span></div>
        <div className={styles.paperNumber}>PAYR-0042</div>
        <div className={styles.paperTitle}>Service delivered.</div>
        <div className={styles.paperParties}><span>From<strong>Alex Morgan</strong></span><span>Bill to<strong>Studio North</strong></span></div>
        <div className={styles.paperLine}><span>Web development</span><strong>2,400.00</strong></div>
        <div className={styles.paperTotal}><span>Total due</span><strong>2,400.00 <small>USDC</small></strong></div>
        <div className={styles.paperBottom}><span>Protected payment link</span><svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" /></svg></div>
      </div>
    </div>
  );
}
