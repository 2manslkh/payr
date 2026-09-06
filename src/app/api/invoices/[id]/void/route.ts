import { privateJson, requireRequestSession } from "../../../../../lib/auth/runtime";
import { readPublicationApproval } from "../../../../../lib/invoices/approval-input";
import { createInvoiceLifecycleService } from "../../../../../lib/invoices/lifecycle";
import { invoiceId, ownerActor } from "../../../../../lib/invoices/projections";
import { PublicationError } from "../../../../../lib/invoices/publication-contracts";
import { publicationErrorResponse } from "../../../../../lib/invoices/publication-http";
import { getPublicationLinkConfig, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRequestSession(request, true);
    if (new URL(request.url).search) throw new PublicationError("INVALID_INPUT", 400);
    const id = invoiceId((await params).id);
    const input = await readPublicationApproval(request);
    const service = createInvoiceLifecycleService(getPublicationRepository(), getPublicationLinkConfig);
    return privateJson(await service.void(ownerActor(session), { ...input, invoiceId: id }));
  } catch (error) {
    return publicationErrorResponse(error);
  }
}
