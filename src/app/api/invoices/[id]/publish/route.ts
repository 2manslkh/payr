import { z } from "zod";
import { readAuthJson } from "../../../../../lib/auth/http";
import { privateJson, requireRequestSession } from "../../../../../lib/auth/runtime";
import { createPublicationService, publishInvoiceSchema } from "../../../../../lib/invoices/publication";
import { publicationErrorResponse } from "../../../../../lib/invoices/publication-http";
import { getPublicationConfig, getPublicationDocumentPort, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireRequestSession(request, true);
    const draftId = z.string().uuid().parse((await params).id);
    const body = publishInvoiceSchema.omit({ draftId: true }).parse(await readAuthJson(request));
    const documents = getPublicationDocumentPort();
    const config = getPublicationConfig();
    const service = createPublicationService(getPublicationRepository(), config, documents);
    return privateJson(await service.publish({
      workspaceId: identity.workspaceId, ownerWallet: identity.ownerWallet, connectorId: null,
    }, { ...body, draftId }));
  } catch (error) { return publicationErrorResponse(error); }
}
