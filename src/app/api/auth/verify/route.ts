import { readAuthJson, setSessionCookie } from "../../../../lib/auth/http";
import { requireTrustedOrigin } from "../../../../lib/auth/origin";
import { apiError, getIdentityConfig, getIdentityRuntime, privateJson, readRequestSession } from "../../../../lib/auth/runtime";
import { createAuthService } from "../../../../lib/auth/service";
import { createSessionCodec } from "../../../../lib/auth/session";
import { verifyRequestSchema } from "../../../../lib/identity/contracts";

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request, getIdentityConfig().appOrigin);
    const input = verifyRequestSchema.parse(await readAuthJson(request));
    const identity = await readRequestSession(request);
    const { repository, config } = getIdentityRuntime();
    const result = await createAuthService(repository, config).verify(input, identity ?? undefined);
    const response = privateJson(result);
    if (!result.profile) setSessionCookie(response, await createSessionCodec(config).seal(result.session));
    return response;
  } catch (error) {
    return apiError(error);
  }
}
