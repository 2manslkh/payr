import Link from "next/link";
import { PageHeading } from "../../../components/console-ui";

export const metadata = { title: "Overview | Payr" };

export default function OverviewPage() {
  return (
    <>
      <PageHeading
        title="Overview"
        action={
          <a className="button" href="https://claude.ai/new" target="_blank" rel="noreferrer">
            Open Claude
          </a>
        }
      >
        Set up the details your future invoices will use.
      </PageHeading>
      <section className="ledger-section">
        <div className="section-heading">
          <h2>Prepare your workspace</h2>
          <span className="muted">Start with your sender details</span>
        </div>
        <ol className="setup-list">
          <li>
            <div>
              <h3>Set your sender identity</h3>
              <p>
                Add your business and billing details, payment terms, and invoice prefix. Review the wallet
                that will receive payment.
              </p>
            </div>
            <Link className="button secondary" href="/app/settings">
              Open settings
            </Link>
          </li>
          <li>
            <div>
              <h3>Keep client details ready</h3>
              <p>Save confirmed billing information so future drafts can use the right client record.</p>
            </div>
            <Link className="button secondary" href="/app/clients">
              Manage clients
            </Link>
          </li>
          <li>
            <div>
              <h3>Review agent access</h3>
              <p>
                Manage short-lived credentials and their limits. The Claude MCP endpoint is not functional
                yet.
              </p>
            </div>
            <Link className="button secondary" href="/app/connections">
              View connections
            </Link>
          </li>
        </ol>
      </section>
      <section className="ruled-section future-state">
        <h2>The ledger starts with a published invoice</h2>
        <p>
          Invoice publication, payment, and settlement are coming in later releases. There are no receivable
          totals or verified settlement records to display in this console yet.
        </p>
        <p>Open Claude starts a new conversation; it does not connect Claude to Payr.</p>
        <Link className="text-link" href="/app/invoices">
          View invoice availability
        </Link>
      </section>
    </>
  );
}
