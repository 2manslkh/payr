import { z } from "zod";
import { readAuthJson, setSessionCookie } from "../../../../lib/auth/http";
import { requireTrustedOrigin } from "../../../../lib/auth/origin";
import { apiError, getIdentityConfig, privateJson } from "../../../../lib/auth/runtime";

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request, getIdentityConfig().appOrigin);
    z.object({}).strict().parse(await readAuthJson(request, true));
    const response = privateJson({ ok: true });
    setSessionCookie(response, null);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
