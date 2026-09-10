import { z } from "zod";
import { readAuthJson } from "../../../../lib/auth/http";
import { apiError, getIdentityRuntime, privateJson, requireRequestSession } from "../../../../lib/auth/runtime";
import { createSupabaseAdminClient } from "../../../../lib/db/admin";
import { accountCredentialHash, mintAgentCredential } from "../../../../lib/agent-api/credentials";
import { accountScopesSchema } from "../../../../lib/agent-api/contracts";
import { connectorScopesSchema, IdentityError } from "../../../../lib/identity/contracts";

const inputSchema = z.object({ serviceId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  expiresInDays: z.number().int().min(1).max(7), scopes: accountScopesSchema }).strict();
const connectorSchema = z.object({ id: z.string().uuid(), createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }), revokedAt: z.iso.datetime({ offset: true }).nullable(),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(), scopes: connectorScopesSchema }).strict();

export async function POST(request: Request) {
  try {
    const identity = await requireRequestSession(request, true);
    if (!identity.privyUserId) throw new IdentityError("AUTH_REQUIRED", 401);
    const input = inputSchema.parse(await readAuthJson(request));
    const { config } = getIdentityRuntime();
    const { id, token } = mintAgentCredential("account");
    const { data, error } = await createSupabaseAdminClient().rpc("payr_privy_gateway_credential_v1", {
      p_user_id: identity.privyUserId, p_workspace_id: identity.workspaceId, p_service_id: input.serviceId,
      p_id: id, p_token_hash: accountCredentialHash(config.connectorPepper, token),
      p_expires_at: new Date(Date.now() + input.expiresInDays * 86400_000).toISOString(), p_scopes: input.scopes,
    });
    if (error) {
      if (["P0001", "22023"].includes(error.code ?? "") && ["NOT_FOUND", "FORBIDDEN", "INVALID_INPUT", "CONNECTOR_CONFLICT"].includes(error.message)) {
        const statuses: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID_INPUT: 400, CONNECTOR_CONFLICT: 409 };
        throw new IdentityError(error.message, statuses[error.message]);
      }
      throw new IdentityError("DATABASE_ERROR", 500);
    }
    const connector = connectorSchema.safeParse(data);
    if (!connector.success || connector.data.id !== id) throw new IdentityError("INVALID_DATABASE_RESPONSE", 500);
    return privateJson({ connector: connector.data, token, endpointUrl: "", serviceId: input.serviceId });
  } catch (error) { return apiError(error); }
}
