import { randomBytes, randomUUID } from "node:crypto";
import { verifyMessage } from "viem";
import { z } from "zod";
import { IdentityError, NONCE_LIFETIME_SECONDS, nonceRequestSchema, verifyRequestSchema, type AuthNonce, type IdentityConfig, type IdentityRepository, type IdentitySession, type NonceRequest, type NonceResponse, type SenderProfile, type VerifyRequest } from "../identity/contracts";
import { buildAuthMessage } from "./message";

export type AuthService = Readonly<{
  issue(input: NonceRequest, identity?: IdentitySession): Promise<NonceResponse>;
  verify(input: VerifyRequest, identity?: IdentitySession): Promise<{ session: IdentitySession; profile?: SenderProfile }>;
}>;

const storedWallet = z.string().regex(/^0x[0-9a-f]{40}$/);
const storedNonceSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid().nullable(), wallet: storedWallet,
  purpose: z.enum(["payr-login-v1", "payr-payout-change-v1"]),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine((value) => Buffer.from(value, "base64url").toString("base64url") === value),
  domain: z.string(), uri: z.string(), chainId: z.number().int().positive(),
  issuedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }), consumedAt: z.null(),
  payoutFrom: storedWallet.nullable(), payoutTo: storedWallet.nullable(), profileRevision: z.number().int().positive().nullable(),
}).strict().refine((nonce) => nonce.purpose === "payr-login-v1"
  ? nonce.workspaceId === null && nonce.payoutFrom === null && nonce.payoutTo === null && nonce.profileRevision === null
  : nonce.workspaceId !== null && nonce.payoutFrom !== null && nonce.payoutTo !== null
    && nonce.payoutFrom !== nonce.payoutTo && nonce.profileRevision !== null);

export function createAuthService(repository: IdentityRepository, config: IdentityConfig, now: () => Date = () => new Date()): AuthService {
  return {
    async issue(input, identity) {
      const parsed = nonceRequestSchema.parse(input);
      let profile: SenderProfile | undefined;
      if (parsed.purpose === "payr-payout-change-v1") {
        if (!identity) throw new IdentityError("AUTH_REQUIRED", 401);
        profile = await repository.getProfile(identity);
        if (profile.revision !== parsed.expectedRevision) throw new IdentityError("REVISION_CONFLICT", 409);
        if (profile.payoutWallet === parsed.newPayoutWallet) throw new IdentityError("INVALID_INPUT");
      }
      const issuedAt = now();
      const nonce: AuthNonce = {
        id: randomUUID(), workspaceId: profile ? identity!.workspaceId : null,
        wallet: parsed.purpose === "payr-login-v1" ? parsed.wallet : identity!.ownerWallet, purpose: parsed.purpose,
        challenge: randomBytes(32).toString("base64url"), domain: new URL(config.appOrigin).host,
        uri: config.appOrigin, chainId: config.chainId, issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + NONCE_LIFETIME_SECONDS * 1000).toISOString(),
        consumedAt: null, payoutFrom: profile?.payoutWallet ?? null,
        payoutTo: parsed.purpose === "payr-payout-change-v1" ? parsed.newPayoutWallet : null,
        profileRevision: profile?.revision ?? null,
      };
      await repository.issueNonce(nonce);
      return { nonceId: nonce.id, message: buildAuthMessage(nonce), expiresAt: nonce.expiresAt };
    },
    async verify(input, identity) {
      const parsed = verifyRequestSchema.parse(input);
      const nonce = await repository.findNonce(parsed.nonceId);
      if (!nonce || !storedNonceSchema.safeParse(nonce).success || nonce.id !== parsed.nonceId
        || nonce.domain !== new URL(config.appOrigin).host || nonce.uri !== config.appOrigin || nonce.chainId !== config.chainId) {
        throw new IdentityError("NONCE_INVALID_OR_USED");
      }
      const time = now().getTime();
      const issuedAt = Date.parse(nonce.issuedAt);
      const expiresAt = Date.parse(nonce.expiresAt);
      if (!Number.isFinite(time) || issuedAt > time || time >= expiresAt || expiresAt <= issuedAt
        || expiresAt - issuedAt > NONCE_LIFETIME_SECONDS * 1000) throw new IdentityError("NONCE_INVALID_OR_USED");
      if (nonce.purpose === "payr-payout-change-v1") {
        if (!identity) throw new IdentityError("AUTH_REQUIRED", 401);
        if (identity.workspaceId !== nonce.workspaceId || identity.ownerWallet !== nonce.wallet) throw new IdentityError("NONCE_INVALID_OR_USED");
        const profile = await repository.getProfile(identity);
        if (profile.revision !== nonce.profileRevision || profile.payoutWallet !== nonce.payoutFrom) throw new IdentityError("NONCE_INVALID_OR_USED");
      }
      let valid = false;
      try {
        valid = await verifyMessage({ address: nonce.wallet as `0x${string}`, message: buildAuthMessage(nonce), signature: parsed.signature as `0x${string}` });
      } catch { /* Invalid EOA signatures are indistinguishable from a failed recovery. */ }
      if (!valid) throw new IdentityError("SIGNATURE_INVALID", 401);
      if (nonce.purpose === "payr-payout-change-v1") {
        return { session: identity!, profile: await repository.applyPayoutChange(identity!, nonce.id) };
      }
      return { session: await repository.completeLogin(nonce.id, nonce.wallet) };
    },
  };
}
