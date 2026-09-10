import { z } from "zod";
import { ACCOUNT_SCOPES, accountScopesSchema, operationNames, type GatewayRepository } from "../agent-api/contracts";
import { IdentityError } from "../identity/contracts";
import type { RpcClient } from "./repositories";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const hash = z.string().length(64).regex(/^[0-9a-f]{64}$/);
const serviceId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).refine((value) => value.trim() === value);
const wallet = z.string().length(42).regex(/^0x[0-9a-f]{40}$/);
const timestamp = z.iso.datetime({ offset: true });
const challenge = z.object({
  id: uuid, serviceId, wallet, challenge: z.string().length(43).regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
  domain: z.string().min(1).max(253).regex(/^[a-z0-9.\[\]:-]+$/), uri: z.string().min(1).max(261),
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  issuedAt: z.iso.datetime({ precision: 3 }), expiresAt: z.iso.datetime({ precision: 3 }), consumedAt: timestamp.nullable(),
  scopes: accountScopesSchema, expiresInDays: z.number().int().min(1).max(7),
}).strict().refine((value) => value.domain.trim() === value.domain && (value.uri === `https://${value.domain}`
  || (/^(localhost|127\.0\.0\.1|\[::1\]):[0-9]{1,5}$/.test(value.domain) && value.uri === `http://${value.domain}`))
  && Date.parse(value.expiresAt) > Date.parse(value.issuedAt)
  && Date.parse(value.expiresAt) - Date.parse(value.issuedAt) <= 300_000
  && (value.consumedAt === null || (Date.parse(value.consumedAt) >= Date.parse(value.issuedAt)
    && Date.parse(value.consumedAt) < Date.parse(value.expiresAt))));
const credential = z.object({
  id: uuid, createdAt: timestamp, expiresAt: timestamp, revokedAt: timestamp.nullable(), lastUsedAt: timestamp.nullable(),
  scopes: accountScopesSchema,
}).strict().refine((value) => Date.parse(value.expiresAt) > Date.parse(value.createdAt)
  && Date.parse(value.expiresAt) - Date.parse(value.createdAt) <= 7 * 86_400_000
  && (value.revokedAt === null || Date.parse(value.revokedAt) >= Date.parse(value.createdAt))
  && (value.lastUsedAt === null || Date.parse(value.lastUsedAt) >= Date.parse(value.createdAt)));
const account = z.object({ workspaceId: uuid, ownerWallet: wallet, credential, senderSetupRequired: z.boolean() }).strict();
const accountAuth = z.object({ serviceId, id: uuid, tokenHash: hash }).strict();
const retry = z.object({ retryAfterSeconds: z.number().int().min(1).max(60) }).strict();
const admissionFailure = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("denied"), code: z.enum(["UNAUTHORIZED", "FORBIDDEN"]) }).strict(),
  retry.extend({ outcome: z.literal("rate_limited") }),
]);
const errorStatuses: Readonly<Record<string, number>> = {
  UNAUTHORIZED: 401, FORBIDDEN: 403, INVALID_INPUT: 400, NONCE_INVALID_OR_USED: 400,
  NOT_FOUND: 404, CONNECTOR_CONFLICT: 409, GATEWAY_KEY_CONFLICT: 409, RATE_LIMITED: 429,
};

/** Hashes and verifiedWallet come from trusted TS. No raw credentials or owner actor parameters cross this seam. */
export function createGatewayRepository(client: RpcClient): GatewayRepository {
  function input<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new IdentityError("INVALID_INPUT", 400);
    return result.data;
  }
  async function call<T>(name: string, parameters: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let result;
    try { result = await client.rpc(name, parameters); }
    catch { throw new IdentityError("DATABASE_ERROR", 503); }
    if (result.error) {
      const { code, message, details } = result.error;
      if (["P0001", "22023"].includes(code ?? "") && Object.hasOwn(errorStatuses, message)) {
        if (message === "RATE_LIMITED") {
          let parsed;
          try { parsed = retry.safeParse(JSON.parse(details ?? "")); } catch { /* Never expose database details. */ }
          if (!parsed?.success) throw new IdentityError("INVALID_DATABASE_RESPONSE", 503);
          throw new IdentityError(message, 429, parsed.data.retryAfterSeconds);
        }
        throw new IdentityError(message, errorStatuses[message]);
      }
      throw new IdentityError("DATABASE_ERROR", 503);
    }
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) throw new IdentityError("INVALID_DATABASE_RESPONSE", 503);
    return parsed.data;
  }
  return {
    async admitService(value) {
      const v = input(z.object({ id: uuid, tokenHash: hash, operation: z.enum(operationNames), ipHash: hash }).strict(), value);
      return call("payr_admit_gateway_service_v1", { p_id: v.id, p_token_hash: v.tokenHash,
        p_operation: v.operation, p_ip_hash: v.ipHash }, z.object({ serviceId }).strict());
    },
    async issueChallenge(value) {
      const v = input(z.object({ challenge: challenge.refine((c) => c.consumedAt === null), walletHash: hash, ipHash: hash }).strict(), value);
      await call("payr_issue_agent_challenge_v1", { p_challenge: v.challenge, p_wallet_hash: v.walletHash,
        p_ip_hash: v.ipHash }, z.object({ issued: z.literal(true) }).strict());
    },
    async findChallenge(value) {
      const v = input(z.object({ id: uuid, serviceId }).strict(), value);
      return call("payr_find_agent_challenge_v1", { p_id: v.id, p_service_id: v.serviceId },
        challenge.refine((c) => c.id === v.id && c.serviceId === v.serviceId).nullable());
    },
    async completeRegistration(value) {
      const v = input(z.object({ challengeId: uuid, serviceId, verifiedWallet: wallet, connectorId: uuid, tokenHash: hash }).strict(), value);
      return call("payr_complete_agent_registration_v1", { p_challenge_id: v.challengeId, p_service_id: v.serviceId,
        p_verified_wallet: v.verifiedWallet, p_connector_id: v.connectorId, p_token_hash: v.tokenHash },
      account.refine((a) => a.credential.id === v.connectorId && a.ownerWallet === v.verifiedWallet && a.credential.revokedAt === null));
    },
    async admitAccount(value) {
      const v = input(accountAuth.extend({ action: z.enum([...ACCOUNT_SCOPES, "wallet:read"]), ipHash: hash }), value);
      const result = await call("payr_admit_agent_account_v1", { p_service_id: v.serviceId, p_id: v.id, p_token_hash: v.tokenHash,
        p_action: v.action, p_ip_hash: v.ipHash },
      z.union([account.refine((a) => a.credential.id === v.id && a.credential.revokedAt === null && a.credential.scopes.includes(v.action)), admissionFailure]));
      // The RPC returns denials normally so its audit commits before we throw at the TS boundary.
      if ("outcome" in result) {
        if (result.outcome === "rate_limited") throw new IdentityError("RATE_LIMITED", 429, result.retryAfterSeconds);
        throw new IdentityError(result.code, result.code === "UNAUTHORIZED" ? 401 : 403);
      }
      return result;
    },
    async revokeAccount(value) {
      const v = input(accountAuth, value);
      return call("payr_revoke_agent_account_v1", { p_service_id: v.serviceId, p_id: v.id, p_token_hash: v.tokenHash },
        z.object({ credentialId: z.literal(v.id), revoked: z.literal(true) }).strict());
    },
  };
}
