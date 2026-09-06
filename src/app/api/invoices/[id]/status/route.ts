import { privateJson, requireRequestSession } from "../../../../../lib/auth/runtime";
import { createInvoiceLifecycleService } from "../../../../../lib/invoices/lifecycle";
import { invoiceId, ownerActor } from "../../../../../lib/invoices/projections";
import { PublicationError } from "../../../../../lib/invoices/publication-contracts";
import { publicationErrorResponse } from "../../../../../lib/invoices/publication-http";
import { getPublicationLinkConfig, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRequestSession(request, false);
    if (new URL(request.url).search || request.body !== null) throw new PublicationError("INVALID_INPUT", 400);
    const id = invoiceId((await params).id);
    const service = createInvoiceLifecycleService(getPublicationRepository(), getPublicationLinkConfig);
    return privateJson(await service.status(ownerActor(session), id));
  } catch (error) {
    return publicationErrorResponse(error);
  }
}
