import { z } from "zod";
import { addressSchema, IdentityError, type IdentityRepository, type IdentitySession } from "../identity/contracts";
import type { RpcClient } from "./repositories";

const uuid = z.string().uuid();
const wallet = z.string().regex(/^0x[0-9a-f]{40}$/);
const revision = z.number().int().positive().max(2147483647);
// Keep timestamp strings intact, including PostgreSQL microseconds. Never round via Date.
const timestamp = z.iso.datetime({ offset: true });
const session = z.object({ workspaceId: uuid, ownerWallet: wallet }).strict();
const nonce = z.object({
  id: uuid, workspaceId: uuid.nullable(), wallet, purpose: z.enum(["payr-login-v1", "payr-payout-change-v1"]),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
  domain: z.string().min(1).max(253), uri: z.string().min(1).max(512),
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  issuedAt: timestamp, expiresAt: timestamp, consumedAt: timestamp.nullable(),
  payoutFrom: wallet.nullable(), payoutTo: wallet.nullable(), profileRevision: revision.nullable(),
}).strict().refine((value) => value.purpose === "payr-login-v1"
  ? value.workspaceId === null && value.payoutFrom === null && value.payoutTo === null && value.profileRevision === null
  : value.workspaceId !== null && value.payoutFrom !== null && value.payoutTo !== null
    && value.payoutFrom !== value.payoutTo && value.profileRevision !== null);
const profile = z.object({
  id: uuid, revision, businessName: z.string().min(1).max(200).nullable(), billingAddress: addressSchema.nullable(),
  contactName: z.string().min(1).max(200).nullable(), contactEmail: z.email().max(254).nullable(),
  payoutWallet: wallet, invoicePrefix: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,31}$/).nullable(),
  defaultPaymentTermsDays: z.number().int().min(0).max(365).nullable(),
}).strict();
const clientProfile = z.object({
  id: uuid, revision, alias: z.string().min(1).max(100), businessName: z.string().min(1).max(200),
  billingAddress: addressSchema, contactName: z.string().min(1).max(200), contactEmail: z.email().max(254),
  provenance: z.record(z.string().regex(/^(alias|businessName|billingAddress|contactName|contactEmail)$/),
    z.object({ kind: z.literal("user_provided"), confirmed: z.literal(true) }).strict()),
}).strict();
const connector = z.object({
  id: uuid, createdAt: timestamp, expiresAt: timestamp, revokedAt: timestamp.nullable(), lastUsedAt: timestamp.nullable(),
  scopes: z.tuple([z.literal("invoice:draft"), z.literal("invoice:publish"), z.literal("invoice:status"), z.literal("invoice:void")]),
}).strict();
const connectorRecord = connector.extend({ workspaceId: uuid, tokenHash: z.string().regex(/^[0-9a-f]{64}$/) });
const admission = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("allowed"), workspaceId: uuid, tokenId: uuid }).strict(),
  z.object({ outcome: z.literal("denied") }).strict(),
  z.object({ outcome: z.literal("rate_limited"), retryAfterSeconds: z.number().int().min(1).max(60) }).strict(),
]);
const audit = z.object({
  id: uuid, tokenId: uuid.nullable(), action: z.string().regex(/^[a-z][a-z0-9_.:-]{0,63}$/),
  outcome: z.enum(["allowed", "denied", "rate_limited", "succeeded"]), createdAt: timestamp,
}).strict();
const errorStatuses: Readonly<Record<string, number>> = {
  NOT_FOUND: 404, NONCE_INVALID_OR_USED: 400, INVALID_INPUT: 400, REVISION_CONFLICT: 409,
  CLIENT_ALIAS_CONFLICT: 409, CONNECTOR_CONFLICT: 409,
};

export function createIdentityRepository(client: RpcClient): IdentityRepository {
  async function call<T>(name: string, parameters: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let result;
    try {
      result = await client.rpc(name, parameters);
    } catch {
      throw new IdentityError("DATABASE_ERROR", 500);
    }
    if (result.error) {
      const status = Object.hasOwn(errorStatuses, result.error.message) ? errorStatuses[result.error.message] : undefined;
      if (status && ["P0001", "22023"].includes(result.error.code ?? "")) {
        throw new IdentityError(result.error.message, status);
      }
      throw new IdentityError("DATABASE_ERROR", 500);
    }
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) throw new IdentityError("INVALID_DATABASE_RESPONSE", 500);
    return parsed.data;
  }
  function scope(identity: IdentitySession) {
    return { p_workspace_id: identity.workspaceId, p_owner_wallet: identity.ownerWallet };
  }
  return {
    admitNonceIssuance: (input) => call("payr_admit_nonce_issuance_v1", {
      p_wallet_hash: input.walletHash, p_ip_hash: input.ipHash,
    }, z.object({ allowed: z.boolean(), retryAfterSeconds: z.number().int().min(0).max(60) }).strict()),
    issueNonce: (input) => call("payr_issue_auth_nonce_v1", { p_nonce: input }, nonce),
    findNonce: (id) => call("payr_find_auth_nonce_v1", { p_nonce_id: id }, nonce.nullable()),
    completeLogin: (id, verifiedWallet) => call("payr_complete_login_v1", { p_nonce_id: id, p_verified_wallet: verifiedWallet }, session),
    applyPayoutChange: (identity, id) => call("payr_apply_payout_change_v1", { ...scope(identity), p_nonce_id: id }, profile),
    getProfile: (identity) => call("payr_get_sender_profile_v1", scope(identity), profile),
    saveProfile: (identity, input) => call("payr_save_sender_profile_v1", { ...scope(identity), p_input: input }, profile),
    listClients: (identity) => call("payr_list_clients_v1", scope(identity), z.array(clientProfile)),
    saveClient: (identity, input) => call("payr_save_client_v1", { ...scope(identity), p_input: input }, clientProfile),
    listConnectors: (identity) => call("payr_list_connectors_v1", scope(identity), z.array(connector)),
    createConnector: (identity, input) => call("payr_create_connector_v1", {
      ...scope(identity), p_id: input.id, p_token_hash: input.tokenHash, p_expires_at: input.expiresAt,
    }, connector),
    revokeConnector: (identity, id) => call("payr_revoke_connector_v1", { ...scope(identity), p_id: id }, connector),
    findConnector: (id) => call("payr_find_connector_v1", { p_id: id }, connectorRecord.nullable()),
    admitConnector: (input) => call("payr_admit_connector_v1", {
      p_id: input.id, p_token_hash: input.tokenHash, p_ip_hash: input.ipHash, p_action: input.action,
    }, admission),
    listActivity: (identity) => call("payr_list_activity_v1", scope(identity), z.array(audit).max(100)),
  };
}
