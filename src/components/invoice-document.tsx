import type { BillingAddress } from "../lib/identity/contracts";
import type { ClientField, DraftSnapshot, InvoiceDetail } from "../lib/invoices/contracts";
import type { PublicationView } from "../lib/invoices/publication-contracts";
import { DateValue } from "./console-ui";
import { commercialLabels } from "./invoice-ui";
import { PublicationActions } from "./publication-actions";

const clientLabels: Record<ClientField, string> = {
  businessName: "Business name", billingAddress: "Billing address", contactName: "Contact name", contactEmail: "Contact email",
};
const defaultLabels = { issueDate: "Issue date", dueDate: "Due date", payableUntil: "Technical payable deadline" };
const sourceLabels = { workspace_date: "Workspace date (UTC)", sender_terms: "Saved sender payment terms", technical_deadline: "30 days after the due date (UTC)" };

function Address({ value }: { value: BillingAddress | null }) {
  if (!value) return <>Unavailable</>;
  return (
    <div className="invoice-address">
      {[value.line1, value.line2, value.city, value.region, value.postalCode, value.countryCode]
        .filter(Boolean).map((line, index) => <div key={index}>{line}</div>)}
    </div>
  );
}

function Provenance({ value }: { value: DraftSnapshot["clientProvenance"][ClientField] }) {
  if (value.kind === "saved_profile") return <>Saved client profile</>;
  if (value.kind === "user_provided") return <>User provided, declared confirmed</>;
  return <>Web source, declared confirmed: <span className="invoice-source">{value.url}</span></>;
}

export function InvoiceDocument({ detail, publication }: { detail: InvoiceDetail; publication: PublicationView | null }) {
  const { invoice, version, history } = detail;
  const snapshot = version?.snapshot;
  const published = invoice.commercialState !== "draft";
  return (
    <div className="invoice-detail-layout">
      <article className="invoice-document" aria-label="Immutable invoice record">
        <div className="section-heading">
          <h2>Version {invoice.version}</h2>
          <span>{invoice.invoiceNumber ?? "Invoice number not assigned"}</span>
        </div>
        {snapshot ? <>
          <div className="invoice-parties">
            <section aria-labelledby="invoice-sender-heading">
              <h3 id="invoice-sender-heading">From</h3>
              <p>{snapshot.sender.businessName ?? "Unavailable"}</p>
              <Address value={snapshot.sender.billingAddress} />
              <p>{snapshot.sender.contactName}<br />{snapshot.sender.contactEmail}</p>
              <dl className="invoice-facts">
                <dt>Sender revision</dt><dd>{snapshot.sender.revision}</dd>
                <dt>Invoice prefix</dt><dd>{snapshot.sender.invoicePrefix ?? "Unavailable"}</dd>
                <dt>Saved payment terms</dt>
                <dd>{snapshot.sender.defaultPaymentTermsDays === null ? "Not set" : `${snapshot.sender.defaultPaymentTermsDays} days`}</dd>
              </dl>
            </section>
            <section aria-labelledby="invoice-client-heading">
              <h3 id="invoice-client-heading">Bill to</h3>
              <p>{snapshot.client.businessName}</p>
              <Address value={snapshot.client.billingAddress} />
              <p>{snapshot.client.contactName}<br />{snapshot.client.contactEmail}</p>
              <dl className="invoice-facts">
                <dt>Client alias</dt><dd>{snapshot.clientReference.alias ?? "Not assigned"}</dd>
                <dt>Client revision</dt><dd>{snapshot.clientReference.revision ?? "Not saved"}</dd>
                <dt>Client ID</dt><dd className="technical">{snapshot.clientReference.id ?? "Not saved"}</dd>
              </dl>
            </section>
          </div>
          <dl className="invoice-dates">
            <div><dt>Issue date</dt><dd><time dateTime={snapshot.issueDate}>{snapshot.issueDate}</time></dd></div>
            <div><dt>Due date</dt><dd><time dateTime={snapshot.dueDate}>{snapshot.dueDate}</time></dd></div>
            <div><dt>Technical payable deadline</dt><dd><DateValue value={snapshot.payableUntil} /></dd></div>
          </dl>
          <table className="ledger-table invoice-items">
            <caption className="sr-only">Line items in the current version</caption>
            <thead><tr>
              <th scope="col">Description</th>
              <th scope="col" className="invoice-amount">Amount (USDC)</th>
            </tr></thead>
            <tbody>{snapshot.items.map((item, index) => (
              <tr key={index}>
                <td data-label="Description" className="invoice-plain-text">{item.description}</td>
                <td data-label="Amount (USDC)" className="invoice-amount">{item.amountDecimal} USDC</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="invoice-document-total"><h3>Total</h3><p className="invoice-amount">{snapshot.amountDecimal} USDC</p></div>
          <section className="invoice-document-section"><h3>Memo</h3><p className="invoice-plain-text">{snapshot.memo || "No memo provided."}</p></section>
          <section className="invoice-document-section">
            <h2>Applied defaults</h2>
            {snapshot.appliedDefaults.length ? (
              <dl className="invoice-facts">{snapshot.appliedDefaults.map((entry) => (
                <div key={entry.field}>
                  <dt>{defaultLabels[entry.field]}</dt>
                  <dd>{entry.value}<span className="invoice-fact-note">{sourceLabels[entry.source]}</span></dd>
                </div>
              ))}</dl>
            ) : <p>No defaults were applied to this version.</p>}
          </section>
          <section className="invoice-document-section">
            <h2>Client provenance</h2>
            <p>Confirmation records the authorized caller&apos;s declaration, not independent verification. Sources are displayed as text and are not fetched.</p>
            <dl className="invoice-facts">{(Object.keys(clientLabels) as ClientField[]).map((field) => (
              <div key={field}>
                <dt>{clientLabels[field]}</dt>
                <dd><Provenance value={snapshot.clientProvenance[field]} /></dd>
              </div>
            ))}</dl>
          </section>
          <section className="invoice-document-section">
            <h2>{published ? "Approved client changes" : "Pending client changes"}</h2>
            {snapshot.proposedClientChanges.kind === "none" ? <p>{published ? "No client-profile changes were proposed in this version." : "No pending client-profile changes."}</p> : <>
              {published ? <p>Applied at publication: {snapshot.proposedClientChanges.kind === "create" ? "client profile creation" : "client profile update"} with these approved fields. This historical diff is retained in the immutable version, not a new pending change.</p> : <p>{snapshot.proposedClientChanges.kind === "create" ? "Create a client profile with these confirmed fields at publication." : "Update the referenced client profile with these confirmed fields at publication."} No client profile has been changed by this draft.</p>}
              <dl className="invoice-facts">{(Object.keys(clientLabels) as ClientField[]).map((field) => {
                const proposal = snapshot.proposedClientChanges.fields[field];
                if (!proposal) return null;
                return (
                  <div key={field}>
                    <dt>{clientLabels[field]}</dt>
                    <dd>
                      {typeof proposal.value === "string" ? proposal.value : <Address value={proposal.value} />}
                      <span className="invoice-fact-note"><Provenance value={proposal.provenance} /></span>
                    </dd>
                  </div>
                );
              })}</dl>
              {!published && <p>Any future publication approval must name this exact draft version and these pending changes.</p>}
            </>}
          </section>
        </> : (
          <div className="empty-state">
            <h3>Snapshot unavailable</h3>
            <p>No draft snapshot is available for this legacy record. Only recorded summary facts and version history are shown.</p>
            <dl className="invoice-facts">
              <dt>Client</dt><dd>{invoice.clientName ?? "Unavailable"}</dd>
              <dt>Amount</dt><dd>{invoice.amountDecimal === null ? "Unavailable" : `${invoice.amountDecimal} USDC`}</dd>
              <dt>Issue date</dt><dd>{invoice.issueDate ?? "Unavailable"}</dd>
              <dt>Due date</dt><dd>{invoice.dueDate ?? "Unavailable"}</dd>
              <dt>Technical payable deadline</dt>
              <dd>{invoice.payableUntil ? <DateValue value={invoice.payableUntil} /> : "Unavailable"}</dd>
            </dl>
          </div>
        )}
      </article>
      <aside className="invoice-proof-rail" aria-label="Invoice state and history">
        <section className="invoice-rail-section">
          <h2>Record state</h2>
          <dl className="invoice-facts">
            <dt>Commercial state</dt><dd>{commercialLabels[invoice.commercialState]}</dd>
            <dt>Payment</dt>
            <dd className={invoice.paymentStatus === "paid" ? "invoice-paid" : undefined}>{invoice.paymentStatus === "paid" ? "Paid" : "Unpaid"}</dd>
            <dt>Invoice ID</dt><dd className="technical">{invoice.id}</dd>
            <dt>Updated</dt><dd><DateValue value={invoice.updatedAt} /></dd>
          </dl>
          <p className="muted">{invoice.paymentStatus === "paid" ? "A settlement is recorded. Commercial state remains a separate fact." : "No settlement is recorded for this invoice."}</p>
        </section>
        {publication ? (
          <PublicationActions
            invoiceId={invoice.id}
            version={invoice.version}
            state={publication.state}
            failureCode={publication.failureCode}
            canShare={publication.canShare}
            canVoid={publication.canVoid && invoice.commercialState === "published" && invoice.paymentStatus === "unpaid"}
          />
        ) : (
          <section className="invoice-rail-section" role="alert">
            <h2>Publication status could not load</h2>
            <p>Sharing and voiding are unavailable until the record can be checked. Reload this page to try again. Your immutable record has not changed.</p>
          </section>
        )}
        {snapshot && (
          <section className="invoice-rail-section">
            <h2>Payment destination</h2>
            <p className="technical wallet-address">{snapshot.sender.payoutWallet}</p>
            <p className="muted">Payout wallet saved in this version. {published ? "Publication and payment settlement are separate facts." : "A draft does not authorize payment."}</p>
          </section>
        )}
        <section className="invoice-rail-section">
          <h2>Version history</h2>
          {history.length ? (
            <ol className="invoice-history">{history.map((entry) => (
              <li key={entry.id}>
                <h3>Version {entry.version}</h3>
                {entry.version === invoice.version && <p>Current version</p>}
                <p><DateValue value={entry.createdAt} /></p>
              </li>
            ))}</ol>
          ) : <p className="muted">No version history is available.</p>}
        </section>
      </aside>
    </div>
  );
}
