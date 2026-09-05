import { createHmac } from "node:crypto";
import { IdentityError, type IdentityConfig, type IdentityRepository } from "../identity/contracts";
import { normalizeIp } from "../security/ip";

export async function admitNonceRequest(
  repository: IdentityRepository, config: IdentityConfig, request: Request, wallet: string,
): Promise<void> {
  // Only Vercel's overwritten header is trusted; other runtimes share one conservative bucket.
  const ip = process.env.VERCEL === "1"
    ? normalizeIp(request.headers.get("x-vercel-forwarded-for") ?? "")
    : "127.0.0.1";
  if (ip === null) throw new IdentityError("INVALID_INPUT");
  const hash = (purpose: string, value: string) => createHmac("sha256", config.connectorPepper)
    .update(`payr:nonce-${purpose}:v1:${value}`).digest("hex");
  const result = await repository.admitNonceIssuance({ walletHash: hash("wallet", wallet), ipHash: hash("ip", ip) });
  if (!result.allowed) throw new IdentityError("RATE_LIMITED", 429, Math.max(1, result.retryAfterSeconds));
}
