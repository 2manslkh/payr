import { readAuthJson } from "../../../../lib/auth/http";
import { admitNonceRequest } from "../../../../lib/auth/issuance";
import { requireTrustedOrigin } from "../../../../lib/auth/origin";
import { apiError, getIdentityConfig, getIdentityRuntime, privateJson, requireRequestSession } from "../../../../lib/auth/runtime";
import { createAuthService } from "../../../../lib/auth/service";
import { IdentityError, nonceRequestSchema } from "../../../../lib/identity/contracts";

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request, getIdentityConfig().appOrigin);
    const input = nonceRequestSchema.parse(await readAuthJson(request));
    if ((process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID) && input.purpose === "payr-login-v1") throw new IdentityError("FORBIDDEN", 403);
    const identity = input.purpose === "payr-payout-change-v1" ? await requireRequestSession(request, false) : undefined;
    const { repository, config } = getIdentityRuntime();
    await admitNonceRequest(repository, config, request, input.purpose === "payr-login-v1" ? input.wallet : identity!.ownerWallet, input.purpose);
    return privateJson(await createAuthService(repository, config).issue(input, identity));
  } catch (error) {
    return apiError(error);
  }
}
