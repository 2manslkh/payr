import { drainInvoiceEmails } from "../../../../lib/email/invoice-runtime";
import { privateWorkerRequest } from "../../../../lib/workers/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export function GET(request: Request) {
  return privateWorkerRequest(request, () => drainInvoiceEmails({ limit: 8 }), process.env.PAYR_INVOICE_CRON_SECRET ?? process.env.CRON_SECRET);
}
