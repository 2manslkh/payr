import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { URL } from "node:url";
import { CONNECTOR_SCOPES, IdentityError, type IdentityConfig, type IdentityRepository } from "../identity/contracts";
import { createConnectorHasher } from "./crypto";

export function createConnectorAuthenticator(repository: IdentityRepository, config: IdentityConfig): {
  authenticate(input: { token: string; ip: string; action: string }): Promise<{ workspaceId: string; tokenId: string }>;
} {
  const hash = createConnectorHasher(config.connectorPepper);
  return {
    async authenticate({ token, ip, action }) {
      try {
        const parsed = typeof token === "string" && token.length === 80
          ? /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(token)
          : null;
        if (!parsed || Buffer.from(parsed[2], "base64url").toString("base64url") !== parsed[2]
          || !CONNECTOR_SCOPES.some((scope) => scope === action)
          || typeof ip !== "string" || ip.includes("%") || !isIP(ip)) {
          throw new IdentityError("CONNECTOR_INVALID", 401);
        }

        let normalizedIp = ip;
        if (isIP(ip) === 6) {
          normalizedIp = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
          // IPv4-mapped IPv6 must share the native IPv4 rate-limit bucket.
          const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalizedIp);
          if (mapped) {
            const high = parseInt(mapped[1], 16);
            const low = parseInt(mapped[2], 16);
            normalizedIp = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
          }
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
