import { readAuthJson } from "../../../../lib/auth/http";
import { requireTrustedOrigin } from "../../../../lib/auth/origin";
import { apiError, getIdentityConfig, getIdentityRuntime, privateJson, requireRequestSession } from "../../../../lib/auth/runtime";
import { createAuthService } from "../../../../lib/auth/service";
import { nonceRequestSchema } from "../../../../lib/identity/contracts";

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request, getIdentityConfig().appOrigin);
    const input = nonceRequestSchema.parse(await readAuthJson(request));
    const identity = input.purpose === "payr-payout-change-v1" ? await requireRequestSession(request, false) : undefined;
    const { repository, config } = getIdentityRuntime();
    return privateJson(await createAuthService(repository, config).issue(input, identity));
  } catch (error) {
    return apiError(error);
  }
}
