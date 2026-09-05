import Link from "next/link";
import { PageHeading } from "../../../../../components/console-ui";

export default function InvoiceNotFound() {
  return <><PageHeading title="Invoice not found">This record is not available in your workspace.</PageHeading><Link className="button secondary" href="/app/invoices">Back to invoices</Link></>;
}
