import { z } from "zod";
import { IdentityError, walletSchema } from "../identity/contracts";
import type { InvoiceActor } from "../invoices/contracts";
import type { RpcClient } from "../db/repositories";

export const walletContextSchema = z.object({ workspaceId: z.string().uuid(),
  businessWallet: z.object({ address: walletSchema, network: z.literal("arc-testnet"),
    chainId: z.literal(5042002), agentControl: z.literal(false) }).strict().nullable(),
  invoicePayoutAddress: walletSchema,
}).strict();
export function createAccountContextService(client: RpcClient) {
  return async (actor: InvoiceActor, input: unknown) => {
    z.object({}).strict().parse(input);
    const { data, error } = await client.rpc("payr_wallet_context_v1", {
      p_workspace_id: actor.workspaceId, p_owner_wallet: actor.ownerWallet, p_connector_id: actor.connectorId,
    });
    if (error) {
      if (error.code === "P0001" && ["NOT_FOUND", "FORBIDDEN"].includes(error.message)) throw new IdentityError(error.message, error.message === "NOT_FOUND" ? 404 : 403);
      throw new IdentityError("DATABASE_ERROR", 500);
    }
    const parsed = walletContextSchema.safeParse(data);
    if (!parsed.success) throw new IdentityError("INVALID_DATABASE_RESPONSE", 500);
    return parsed.data;
  };
}
