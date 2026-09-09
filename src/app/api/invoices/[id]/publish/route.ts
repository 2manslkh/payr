import { z } from "zod";
import { readPublicationApproval } from "../../../../../lib/invoices/approval-input";
import { getIdentityRuntime, privateJson, requireRequestSession } from "../../../../../lib/auth/runtime";
import { createConnectorAuthenticator } from "../../../../../lib/connectors/auth";
import { IdentityError } from "../../../../../lib/identity/contracts";
import type { InvoiceActor } from "../../../../../lib/invoices/contracts";
import { createPublicationService } from "../../../../../lib/invoices/publication";
import { publicationErrorResponse } from "../../../../../lib/invoices/publication-http";
import { getPublicationConfig, getPublicationDocumentPort, getPublicationLinkConfig, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let actor: InvoiceActor;
    if (request.headers.has("authorization")) {
      if (process.env.PAYR_AGENT_GATEWAY_ONLY === "true") throw new IdentityError("FORBIDDEN", 403);
      // An explicit machine credential must never fall back to an owner cookie.
      const token = /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!token) throw new IdentityError("AUTH_REQUIRED", 401);
      const { config, repository } = getIdentityRuntime();
      if (new URL(request.url).origin !== config.appOrigin
        || (request.headers.has("origin") && request.headers.get("origin") !== config.appOrigin)) {
        throw new IdentityError("ORIGIN_NOT_ALLOWED", 403);
      }
      const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? "" : "127.0.0.1";
      const identity = await createConnectorAuthenticator(repository, config).authenticate({ token, ip, action: "invoice:publish" });
      actor = { workspaceId: identity.workspaceId, ownerWallet: null, connectorId: identity.tokenId };
    } else {
      const identity = await requireRequestSession(request, true);
      actor = { workspaceId: identity.workspaceId, ownerWallet: identity.ownerWallet, connectorId: null };
    }
    const draftId = z.string().uuid().parse((await params).id);
    const body = await readPublicationApproval(request);
    const service = createPublicationService(getPublicationRepository(), {
      getReservationConfig: getPublicationConfig, getLinkConfig: getPublicationLinkConfig, getDocuments: getPublicationDocumentPort,
    });
    return privateJson(await service.publish(actor, { ...body, draftId }));
  } catch (error) {
    if (error instanceof IdentityError && error.code === "CONNECTOR_INVALID") error = new IdentityError("AUTH_REQUIRED", 401);
    if (error instanceof IdentityError && error.code === "CONNECTOR_UNAVAILABLE") error = new IdentityError("CONFIGURATION_ERROR", 503);
    const response = publicationErrorResponse(error);
    if (response.status === 401 && request.headers.has("authorization")) response.headers.set("WWW-Authenticate", 'Bearer realm="Payr"');
    return response;
  }
}
