import { z } from "zod";
import { IdentityError } from "../identity/contracts";
import { linkChallengeSchema, privyAccountSchema, type PrivyRepository } from "../privy/contracts";
import type { RpcClient } from "./repositories";

export function createPrivyRepository(client: RpcClient): PrivyRepository {
  async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const statuses: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, NONCE_INVALID_OR_USED: 400,
        IDENTITY_CONFLICT: 409, INVALID_INPUT: 400 };
      if (["P0001", "22023"].includes(error.code ?? "") && Object.hasOwn(statuses, error.message)) {
        throw new IdentityError(error.message, statuses[error.message]);
      }
      throw new IdentityError("DATABASE_ERROR", 500);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new IdentityError("INVALID_DATABASE_RESPONSE", 500);
    return parsed.data;
  }
  return {
    account: (userId) => call("payr_privy_account_v1", { p_user_id: userId }, privyAccountSchema.nullable()),
    saveWallet: (userId, wallet) => call("payr_privy_wallet_v1", { p_user_id: userId, p_wallet_id: wallet.id, p_address: wallet.address }, privyAccountSchema),
    createWorkspace: (userId) => call("payr_privy_create_workspace_v1", { p_user_id: userId }, privyAccountSchema),
    issueLink: (userId, wallet, origin, chainId) => call("payr_privy_issue_link_v1", {
      p_user_id: userId, p_owner_wallet: wallet, p_origin: origin, p_chain_id: chainId,
    }, linkChallengeSchema),
    findLink: (userId, nonceId) => call("payr_privy_find_link_v1", { p_user_id: userId, p_nonce_id: nonceId }, linkChallengeSchema.nullable()),
    completeLink: (userId, nonceId) => call("payr_privy_complete_link_v1", { p_user_id: userId, p_nonce_id: nonceId }, privyAccountSchema),
  };
}
