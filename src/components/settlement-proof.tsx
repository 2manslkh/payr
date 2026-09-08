import type { SettlementManagementView } from "../lib/invoices/lifecycle";
import { ReceiptLinks } from "./receipt-links";
import styles from "./settlement-proof.module.css";

export function SettlementProof({ invoiceId, version, proof }: { invoiceId: string; version: number; proof: SettlementManagementView }) {
  const s = proof.settlement;
  const receiptLabels = { not_applicable: "Unavailable", pending: "Queued", rendering: "Generating", retry_wait: "Retry scheduled", ready: "Ready", failed: "Failed" };
  const emailLabels = { not_applicable: "Not applicable", queued: "Queued", sending: "Sending", sent: "Accepted by email provider", failed: "Failed", manual_review: "Needs manual review" };
  return <>
    <section className={styles.proof} aria-label="Verified settlement proof"><h2>Payment verified</h2><p className={styles.amount}>{s.amountDecimal} USDC</p>
      <p>{s.chainId === 5042002 ? "USDC on Arc Testnet" : `Chain ${s.chainId}`}</p>
      <dl><div><dt>Transaction</dt><dd><a href={proof.transactionUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><code>{s.transactionHash}</code></a></dd></div>
        <div><dt>Block / log</dt><dd><code>{s.blockNumber} / {s.logIndex}</code></dd></div>
        <div><dt>Settled at</dt><dd><time dateTime={s.blockTime}>{s.blockTime}</time></dd></div>
        <div><dt>Payee</dt><dd><code>{s.payee}</code></dd></div>
        <div><dt>Document commitment</dt><dd><code>{s.documentCommitment}</code></dd></div></dl>
      {proof.settledAfterVoid && <p>Settlement occurred after the invoice was voided. Its commercial state remains voided.</p>}
    </section>
    <section className="invoice-rail-section"><h2>Receipt and delivery</h2><dl className="invoice-facts">
      <dt>Receipt PDF</dt><dd>{receiptLabels[proof.receiptState]}</dd>
      <dt>Receipt email</dt><dd>{emailLabels[proof.receiptEmailState]}</dd>
      {proof.receiptPdfContentHash && <><dt>Receipt PDF hash</dt><dd><code>{proof.receiptPdfContentHash}</code></dd></>}
    </dl><p className="muted">Receipt generation and delivery are separate from payment. Provider acceptance is not confirmation of inbox delivery.</p>
      <ReceiptLinks invoiceId={invoiceId} version={version} ready={proof.canRevealReceipt} pdfContentHash={proof.receiptPdfContentHash} />
    </section>
  </>;
}
