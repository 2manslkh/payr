import { privateJson, requireRequestSession } from "../../../lib/auth/runtime";
import { invoiceQuery, ownerActor, safeDraftError } from "../../../lib/invoices/projections";
import { getDraftRepository } from "../../../lib/invoices/runtime";

export async function GET(request: Request) {
  try {
    const session = await requireRequestSession(request, false);
    const query = invoiceQuery(new URL(request.url).searchParams);
    return privateJson(await getDraftRepository().listInvoices(ownerActor(session), query));
  } catch (error) {
    return safeDraftError(error);
  }
}
