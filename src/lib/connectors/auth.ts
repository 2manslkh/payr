import { timingSafeEqual } from "node:crypto";
import { normalizeIp } from "../security/ip";
import { CONNECTOR_SCOPES, IdentityError, type IdentityConfig, type IdentityRepository } from "../identity/contracts";
import { createConnectorHasher } from "./crypto";

export function createConnectorAuthenticator(repository: IdentityRepository, config: IdentityConfig): {
  authenticate(input: { token: string; ip: string; action: string }): Promise<{ workspaceId: string; tokenId: string }>;
} {
  const hash = createConnectorHasher(config.connectorPepper);
  return {
    async authenticate({ token, ip, action }) {
      try {
        const normalizedIp = normalizeIp(ip);
        const parsed = typeof token === "string" && token.length === 80
          ? /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(token)
          : null;
        if (!parsed || Buffer.from(parsed[2], "base64url").toString("base64url") !== parsed[2]
          || !CONNECTOR_SCOPES.some((scope) => scope === action)
          || normalizedIp === null) {
          throw new IdentityError("CONNECTOR_INVALID", 401);
        }

        const id = parsed[1];
        const tokenHash = hash("connector", token);
        const record = await repository.findConnector(id);
        if (!record || record.id !== id || !/^[0-9a-f]{64}$/.test(record.tokenHash)
          || !timingSafeEqual(Buffer.from(tokenHash, "hex"), Buffer.from(record.tokenHash, "hex"))
          || record.revokedAt !== null || !(Date.parse(record.expiresAt) > Date.now())
          || !record.scopes.some((scope) => scope === action)) {
          throw new IdentityError("CONNECTOR_INVALID", 401);
        }

        // Admission rechecks the credential and lifecycle under database locks.
        const admission = await repository.admitConnector({ id, tokenHash, ipHash: hash("connector-ip", normalizedIp), action });
        if (admission.outcome === "rate_limited") {
          if (!Number.isInteger(admission.retryAfterSeconds) || admission.retryAfterSeconds < 1 || admission.retryAfterSeconds > 60) {
            throw new IdentityError("CONNECTOR_UNAVAILABLE", 503);
          }
          throw new IdentityError("RATE_LIMITED", 429, admission.retryAfterSeconds);
        }
        if (admission.outcome !== "allowed") {
          throw new IdentityError("CONNECTOR_INVALID", 401);
        }
        return { workspaceId: admission.workspaceId, tokenId: admission.tokenId };
      } catch (error) {
        if (error instanceof IdentityError) throw error;
        throw new IdentityError("CONNECTOR_UNAVAILABLE", 503);
      }
    },
  };
}
