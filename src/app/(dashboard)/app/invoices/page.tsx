import Link from "next/link";
import { PageHeading } from "../../../../components/console-ui";

export const metadata = { title: "Invoices | Payr" };

export default function InvoicesPage() {
  return (
    <>
      <PageHeading title="Invoices">
        A record of published work, with payment evidence kept separate.
      </PageHeading>
      <section className="ledger-section empty-state">
        <svg
          className="empty-document"
          viewBox="0 0 64 80"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M8 1h32l16 16v62H8zM40 1v17h16M18 34h28M18 44h28M18 54h16" />
        </svg>
        <h2>Publication comes next</h2>
        <p>
          Invoice publication is not available in this release. When the workflow is ready, invoices created
          through Claude will appear here after publication.
        </p>
        <p>
          For now, prepare your sender profile and confirmed client details. There is no browser invoice
          editor.
        </p>
        <div className="actions">
          <Link className="button" href="/app/settings">
            Set up sender details
          </Link>
          <Link className="button secondary" href="/app/clients">
            Manage clients
          </Link>
        </div>
      </section>
    </>
  );
}
