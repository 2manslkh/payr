import { createHmac } from "node:crypto";
import { readAuthJson, setSessionCookie } from "../../../../lib/auth/http";
import { requireTrustedOrigin } from "../../../../lib/auth/origin";
import { apiError, getIdentityRuntime, privateJson } from "../../../../lib/auth/runtime";
import { createSessionCodec } from "../../../../lib/auth/session";
import { createSupabaseAdminClient } from "../../../../lib/db/admin";
import { createPrivyRepository } from "../../../../lib/db/privy";
import { IdentityError } from "../../../../lib/identity/contracts";
import { createPrivyProvider } from "../../../../lib/privy/provider";
import { createPrivyLoginService } from "../../../../lib/privy/service";
import { normalizeIp } from "../../../../lib/security/ip";

export async function POST(request: Request): Promise<Response> {
  try {
    const { config, repository } = getIdentityRuntime();
    requireTrustedOrigin(request, config.appOrigin);
    const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token || token.length > 8192) throw new IdentityError("AUTH_REQUIRED", 401);
    const input = await readAuthJson(request);
    const ip = process.env.VERCEL === "1" ? normalizeIp(request.headers.get("x-vercel-forwarded-for") ?? "") : "local";
    if (ip === null) throw new IdentityError("INVALID_INPUT", 400);
    const hash = (value: string) => createHmac("sha256", config.connectorPepper).update(value).digest("hex");
    // This RPC's wallet quota gives a conservative five verifications/IP/minute.
    // Separate phase namespaces preserve five verified-subject requests without double-charging the IP bucket.
    // A verified request still consumes two of the shared 300/minute global admissions.
    const verificationIpHash = hash(`privy-verify-ip:${ip}`);
    const verificationAdmission = await repository.admitNonceIssuance({ walletHash: verificationIpHash, ipHash: verificationIpHash });
    if (!verificationAdmission.allowed) throw new IdentityError("RATE_LIMITED", 429, verificationAdmission.retryAfterSeconds);
    const provider = createPrivyProvider();
    const userId = await provider.verifyToken(token);
    const admission = await repository.admitNonceIssuance({ walletHash: hash(`privy:${userId}`), ipHash: hash(`privy-ip:${ip}`) });
    if (!admission.allowed) throw new IdentityError("RATE_LIMITED", 429, admission.retryAfterSeconds);
    const result = await createPrivyLoginService({ ...provider, verifyToken: async () => userId,
      repository: createPrivyRepository(createSupabaseAdminClient()), appOrigin: config.appOrigin, chainId: config.chainId })(token, input);
    const response = privateJson(result);
    if ("session" in result) setSessionCookie(response, result.session ? await createSessionCodec(config).seal(result.session) : null);
    return response;
  } catch (error) { return apiError(error); }
}
