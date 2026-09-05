import { privateJson, requireRequestSession } from "../../../../lib/auth/runtime";
import { DraftError } from "../../../../lib/invoices/errors";
import { invoiceId, ownerActor, safeDraftError } from "../../../../lib/invoices/projections";
import { getDraftRepository } from "../../../../lib/invoices/runtime";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRequestSession(request, false);
    if (new URL(request.url).search) throw new DraftError("INVALID_INPUT", 400);
    const id = invoiceId((await params).id);
    const detail = await getDraftRepository().getInvoiceDetail(ownerActor(session), id);
    if (!detail) throw new DraftError("NOT_FOUND", 404);
    return privateJson(detail);
  } catch (error) {
    return safeDraftError(error);
  }
}
