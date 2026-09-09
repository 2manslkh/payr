import { pathToFileURL } from "node:url";
import { operationNames } from "../src/lib/agent-api/contracts";
import { mintAgentCredential, serviceCredentialHash } from "../src/lib/agent-api/credentials";
import { createSupabaseAdminClient } from "../src/lib/db/admin";
import type { RpcClient } from "../src/lib/db/repositories";
import { z } from "zod";

export async function administerGatewayKey(args: string[], environment: Record<string, string | undefined>, client?: RpcClient) {
  const [action, serviceId, ...rest] = args;
  if (!["create", "revoke"].includes(action) || !/^[a-z][a-z0-9_-]{0,63}$/.test(serviceId ?? "")
    || (action === "create" ? rest.length !== 1 || rest[0] !== "--confirm"
      : rest.length !== 2 || rest[1] !== "--confirm" || !z.string().uuid().safeParse(rest[0]).success)) {
    throw new Error("Usage: gateway-key.ts create <service-id> --confirm OR revoke <service-id> <key-id> --confirm. Inject the target environment explicitly.");
  }
  const rpc = client ?? createSupabaseAdminClient({ SUPABASE_URL: environment.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: environment.SUPABASE_SERVICE_ROLE_KEY });
  if (action === "create") {
    const credential = mintAgentCredential("service");
    const result = await rpc.rpc("payr_admin_provision_gateway_key_v1", { p_id: credential.id, p_service_id: serviceId,
      p_token_hash: serviceCredentialHash(credential.token), p_allowed_operations: [...operationNames] });
    if (result.error) throw new Error("Gateway key operation failed. Inspect administrative state before retrying; provider details are redacted.");
    const metadata = z.object({ id: z.literal(credential.id), serviceId: z.literal(serviceId),
      allowedOperations: z.array(z.enum(operationNames)).length(operationNames.length),
    }).strict().parse(result.data);
    return { ...metadata, serviceCredential: credential.token };
  }
  const id = rest[0].toLowerCase();
  const result = await rpc.rpc("payr_admin_revoke_gateway_key_v1", { p_id: id, p_service_id: serviceId });
  if (result.error) throw new Error("Gateway key revocation failed; provider details are redacted.");
  return z.object({ id: z.literal(id), revoked: z.literal(true) }).strict().parse(result.data);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // No .env auto-loading: the operator explicitly selects the target and supplies its secrets.
    const result = await administerGatewayKey(process.argv.slice(2), process.env);
    console.error("Administrative operation completed. A newly created service credential is shown once; store it privately and do not record this terminal.");
    console.log(JSON.stringify(result));
  } catch {
    console.error("Gateway administration failed. Usage: gateway-key.ts create <service-id> --confirm OR revoke <service-id> <key-id> --confirm. Check target configuration and key metadata before retrying.");
    process.exitCode = 1;
  }
}
