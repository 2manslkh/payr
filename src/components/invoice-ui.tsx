import Link from "next/link";
import type { CommercialState } from "../lib/domain/invoice";
import type { InvoiceSummary } from "../lib/invoices/contracts";

export const commercialLabels: Record<CommercialState, string> = {
  draft: "Draft", published: "Published", voided: "Voided", expired: "Expired",
};

export function invoiceTitle(invoice: InvoiceSummary): string {
  return invoice.invoiceNumber ?? `${invoice.commercialState === "draft" ? "Draft" : "Invoice"} ${invoice.id.slice(0, 8)}`;
}

export function OpenClaude() {
  return <a className="button" href="https://claude.ai/new" target="_blank" rel="noreferrer">Open Claude</a>;
}

export function InvoiceWorkflow() {
  return (
    <section className="ruled-section invoice-workflow" aria-labelledby="invoice-workflow-heading">
      <h2 id="invoice-workflow-heading">Draft in Claude. Review here.</h2>
      <p>Drafts and revisions appear here as read-only records. They are not published invoices and do not create a payment request. Publication is not available in this release.</p>
      <p>Claude MCP is not available yet. Open Claude starts a conversation; it does not connect Claude to Payr. There is no browser invoice editor.</p>
    </section>
  );
}

export function InvoiceReadError({ href, invalidQuery = false }: { href: string; invalidQuery?: boolean }) {
  return (
    <div className="notice error" role="alert">
      <h2>{invalidQuery ? "Invalid invoice filters" : "Invoices could not load"}</h2>
      <p>{invalidQuery ? "Use a search of up to 200 characters and one commercial state. Clear the filters to start again." : "Your records have not changed. Reload this page to try again."}</p>
      <div className="actions"><a className="button secondary" href={href}>{invalidQuery ? "Clear filters" : "Reload page"}</a></div>
    </div>
  );
}

export function InvoiceLedger({ items }: { items: InvoiceSummary[] }) {
  return (
    <table className="ledger-table invoice-table">
      <caption className="sr-only">Invoices with separate commercial and payment states</caption>
      <thead><tr>
        <th scope="col">Invoice / Client</th>
        <th scope="col" className="invoice-amount">Amount (USDC)</th>
        <th scope="col">Due date</th>
        <th scope="col">Commercial state</th>
        <th scope="col">Payment</th>
      </tr></thead>
      <tbody>{items.map((invoice) => (
        <tr key={invoice.id}>
          <td data-label="Invoice / Client">
            <Link className="text-link" href={`/app/invoices/${invoice.id}`}>{invoiceTitle(invoice)}</Link>
            <span>{invoice.clientName ?? "Client unavailable"}</span>
            <span>Version {invoice.version}</span>
          </td>
          <td data-label="Amount (USDC)" className="invoice-amount">{invoice.amountDecimal === null ? "Unavailable" : `${invoice.amountDecimal} USDC`}</td>
          <td data-label="Due date">{invoice.dueDate ? <time dateTime={invoice.dueDate}>{invoice.dueDate}</time> : "Unavailable"}</td>
          <td data-label="Commercial state">{commercialLabels[invoice.commercialState]}</td>
          <td data-label="Payment" className={invoice.paymentStatus === "paid" ? "invoice-paid" : undefined}>{invoice.paymentStatus === "paid" ? "Paid" : "Unpaid"}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
