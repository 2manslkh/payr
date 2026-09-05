import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeading } from "../../../../components/console-ui";
import { commercialLabels, InvoiceLedger, InvoiceReadError, InvoiceWorkflow, OpenClaude } from "../../../../components/invoice-ui";
import { getDashboardSession } from "../../../../lib/auth/runtime";
import { COMMERCIAL_STATES } from "../../../../lib/domain/invoice";
import type { InvoiceQuery } from "../../../../lib/invoices/contracts";
import { invoiceQuery, MAX_INVOICE_OFFSET, ownerActor, type InvoiceSearchParams } from "../../../../lib/invoices/projections";
import { getDraftRepository } from "../../../../lib/invoices/runtime";

export const metadata = { title: "Invoices | Payr" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<InvoiceSearchParams> }) {
  const session = await getDashboardSession();
  if (!session) redirect("/login");
  let query: InvoiceQuery;
  try {
    query = invoiceQuery(await searchParams);
  } catch {
    return <><PageHeading title="Invoices">Search your workspace records.</PageHeading><InvoiceReadError href="/app/invoices" invalidQuery /></>;
  }
  let page;
  try {
    page = await getDraftRepository().listInvoices(ownerActor(session), query);
  } catch {
    return <><PageHeading title="Invoices">Your workspace records.</PageHeading><InvoiceReadError href="/app/invoices" /></>;
  }
  function pageHref(offset: number) {
    return `/app/invoices?${new URLSearchParams({ search: query.search, state: query.commercialState ?? "", offset: String(offset) })}`;
  }
  const filtered = query.search !== "" || query.commercialState !== null || query.offset > 0;
  const nextOffset = query.offset + query.limit;
  return (
    <div className="invoice-surface">
      <PageHeading title="Invoices" action={<OpenClaude />}>
        Drafts and immutable invoice records, with payment evidence kept separate.
      </PageHeading>
      <section className="ledger-section">
        <form key={JSON.stringify([query.search, query.commercialState])} className="invoice-toolbar" role="search" aria-label="Filter invoices" action="/app/invoices" method="get">
          <label className="field"><span>Search invoices</span><input name="search" type="search" maxLength={200} defaultValue={query.search} placeholder="Invoice number or client" /></label>
          <label className="field"><span>Commercial state</span><select name="state" defaultValue={query.commercialState ?? ""}>
            <option value="">All states</option>{COMMERCIAL_STATES.map((state) => <option key={state} value={state}>{commercialLabels[state]}</option>)}
          </select></label>
          <button className="button" type="submit">Apply filters</button>
          {filtered && <Link className="text-link" href="/app/invoices">Clear filters</Link>}
        </form>
        {page.items.length ? <InvoiceLedger items={page.items} /> : <div className="empty-state">
          <h2>{filtered ? "No matching invoices" : "No invoices yet"}</h2>
          <p>{filtered ? "Try another client or invoice number, or clear the filters to see all records." : "Your first draft will appear here before publication. Prepare your sender profile and confirmed client details while Claude MCP is being connected."}</p>
        </div>}
        <nav className="invoice-pagination" aria-label="Invoice pages">
          <p className="muted">{page.items.length ? `Showing ${query.offset + 1}-${query.offset + page.items.length}` : "0 results on this page"}</p>
          <div className="actions">
            {query.offset > 0 && <Link className="button secondary" href={pageHref(Math.max(0, query.offset - query.limit))}>Previous page</Link>}
            {page.hasMore && nextOffset <= MAX_INVOICE_OFFSET && <Link className="button secondary" href={pageHref(nextOffset)}>Next page</Link>}
          </div>
          {page.hasMore && nextOffset > MAX_INVOICE_OFFSET && <p className="muted">Narrow your search to see more invoices.</p>}
        </nav>
      </section>
      <InvoiceWorkflow />
    </div>
  );
}
