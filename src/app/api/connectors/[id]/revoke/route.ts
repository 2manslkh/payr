import { z } from "zod";
import { apiError, getIdentityRuntime, privateJson, requireRequestSession } from "../../../../../lib/auth/runtime";
import { connectorMetadata } from "../../../../../lib/connectors/metadata";
import { IdentityError } from "../../../../../lib/identity/contracts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireRequestSession(request, true);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new IdentityError("INVALID_INPUT");
    const { repository } = getIdentityRuntime();
    return privateJson({ connector: connectorMetadata(await repository.revokeConnector(identity, id)) });
  } catch (error) {
    return apiError(error);
  }
}
