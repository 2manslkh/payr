import { createHash } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { IdentityError } from "../identity/contracts";
import { businessWalletSchema } from "./contracts";

let cachedClient: { appId: string; appSecret: string; client: PrivyClient } | undefined;

export function createPrivyProvider() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const policyId = process.env.PRIVY_WALLET_POLICY_ID;
  if (!appId || !appSecret || !policyId) {
    cachedClient = undefined;
    throw new IdentityError("CONFIGURATION_ERROR", 503);
  }
  const acceptedPolicies = new Set([policyId, ...(process.env.PRIVY_ACCEPTED_WALLET_POLICY_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean)]);
  // The SDK owns JWKS caching and in-flight fetch coalescing. Keep only the active app credentials.
  if (cachedClient?.appId !== appId || cachedClient.appSecret !== appSecret) {
    cachedClient = undefined;
    cachedClient = { appId, appSecret, client: new PrivyClient({ appId, appSecret, timeout: 15_000, maxRetries: 1 }) };
  }
  const client = cachedClient.client;
  return {
    async verifyToken(token: string) {
      try { return (await client.utils().auth().verifyAccessToken(token)).user_id; }
      catch { throw new IdentityError("AUTH_REQUIRED", 401); }
    },
    async ensureWallet(userId: string) {
      // External IDs remain unique after Privy's idempotency response cache expires.
      const externalId = `payr_${createHash("sha256").update(`${appId}:${userId}`).digest("hex").slice(0, 56)}`;
      const lookup = () => client.wallets().get(`ext_wal_${externalId}`);
      let wallet;
      try { wallet = await lookup(); }
      catch (error) {
        if (!(error instanceof Error && "status" in error && error.status === 404)) throw new IdentityError("WALLET_UNAVAILABLE", 503);
        try {
          wallet = await client.wallets().create({ chain_type: "ethereum", owner: { user_id: userId },
            external_id: externalId, idempotency_key: externalId, policy_ids: [policyId], additional_signers: [] });
        } catch {
          // Creation may have succeeded in another tab or before a network timeout.
          try { wallet = await lookup(); } catch { throw new IdentityError("WALLET_UNAVAILABLE", 503); }
        }
      }
      if (wallet.chain_type !== "ethereum" || wallet.external_id !== externalId || !wallet.owner_id
        || wallet.additional_signers.length !== 0 || wallet.policy_ids.length !== 1 || !acceptedPolicies.has(wallet.policy_ids[0])) {
        throw new IdentityError("WALLET_CONTROL_MISMATCH", 503);
      }
      const owner = await client.keyQuorums().get(wallet.owner_id);
      if (owner.authorization_threshold !== 1 || owner.user_ids?.length !== 1 || owner.user_ids[0] !== userId
        || owner.authorization_keys.length || owner.key_quorum_ids?.length) throw new IdentityError("WALLET_CONTROL_MISMATCH", 503);
      return businessWalletSchema.parse({ id: wallet.id, address: wallet.address });
    },
  };
}
