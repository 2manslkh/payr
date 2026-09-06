import { z } from "zod";
import { readAuthJson } from "../../../../../lib/auth/http";
import { privateJson, requireRequestSession } from "../../../../../lib/auth/runtime";
import { createInvoiceLifecycleService } from "../../../../../lib/invoices/lifecycle";
import { invoiceId, ownerActor } from "../../../../../lib/invoices/projections";
import { PublicationError } from "../../../../../lib/invoices/publication-contracts";
import { publicationErrorResponse } from "../../../../../lib/invoices/publication-http";
import { getPublicationLinkConfig, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";

const emptyBody = z.object({}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRequestSession(request, true);
    if (new URL(request.url).search) throw new PublicationError("INVALID_INPUT", 400);
    const id = invoiceId((await params).id);
    emptyBody.parse(await readAuthJson(request, true));
    const service = createInvoiceLifecycleService(getPublicationRepository(), getPublicationLinkConfig());
    return privateJson(await service.share(ownerActor(session), id));
  } catch (error) {
    return publicationErrorResponse(error);
  }
}
