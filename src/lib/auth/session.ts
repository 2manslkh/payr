import { randomUUID } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import { IdentityError, SESSION_LIFETIME_SECONDS, walletSchema, type IdentityConfig, type IdentitySession } from "../identity/contracts";

export type SessionCodec = Readonly<{
  seal(identity: IdentitySession, now?: Date): Promise<string>;
  open(token: string, now?: Date): Promise<IdentitySession | null>;
}>;

const identitySchema = z.object({ workspaceId: z.string().uuid(), ownerWallet: walletSchema }).strict();

export function createSessionCodec(config: Pick<IdentityConfig, "appOrigin" | "chainId" | "sessionKey">): SessionCodec {
  if (config.sessionKey.byteLength !== 32) throw new IdentityError("CONFIGURATION_ERROR", 503);
  const { appOrigin, chainId } = config;
  const key = new Uint8Array(config.sessionKey);
  return {
    async seal(identity, now = new Date()) {
      const parsed = identitySchema.parse(identity);
      const issuedAt = Math.floor(now.getTime() / 1000);
      return new EncryptJWT({ ...parsed, chainId })
        .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
        .setIssuer(appOrigin)
        .setJti(randomUUID())
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + SESSION_LIFETIME_SECONDS)
        .encrypt(key);
    },
    async open(token, now = new Date()) {
      try {
        const { payload } = await jwtDecrypt(token, key, {
          issuer: appOrigin, currentDate: now,
          keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"],
          requiredClaims: ["iss", "jti", "iat", "exp"],
        });
        if (payload.chainId !== chainId || !z.string().uuid().safeParse(payload.jti).success
          || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
          || payload.iat! > Math.floor(now.getTime() / 1000)
          || payload.exp! - payload.iat! !== SESSION_LIFETIME_SECONDS) return null;
        const identity = identitySchema.safeParse({ workspaceId: payload.workspaceId, ownerWallet: payload.ownerWallet });
        if (!identity.success || identity.data.ownerWallet !== payload.ownerWallet) return null;
        return identity.data;
      } catch {
        return null;
      }
    },
  };
}
