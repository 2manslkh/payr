import styles from "../../../components/protected-invoice.module.css";

export default function InvoiceNotFound() {
  return <main className={styles.surface}><h1>Invoice not found.</h1><p>Ask the sender for the invoice link.</p></main>;
}
