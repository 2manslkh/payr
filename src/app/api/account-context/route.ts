import { apiError, privateJson, requireRequestSession } from "../../../lib/auth/runtime";
import { createSupabaseAdminClient } from "../../../lib/db/admin";
import { createAccountContextService } from "../../../lib/privy/account-context";

export async function GET(request: Request) {
  try {
    const identity = await requireRequestSession(request);
    return privateJson(await createAccountContextService(createSupabaseAdminClient())({ ...identity, connectorId: null }, {}));
  } catch (error) { return apiError(error); }
}
