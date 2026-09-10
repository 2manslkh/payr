import { expect, it, vi } from "vitest";
import { createAccountContextService } from "./account-context";

const actor = { workspaceId: "00000000-0000-4000-8000-000000000001", connectorId: "00000000-0000-4000-8000-000000000002", ownerWallet: null };
it("passes only the authenticated actor to the scope-enforcing RPC", async () => {
  const result = { workspaceId: actor.workspaceId, businessWallet: { address: `0x${"1".repeat(40)}`, network: "arc-testnet", chainId: 5042002, agentControl: false }, invoicePayoutAddress: `0x${"2".repeat(40)}` };
  const rpc = vi.fn(async () => ({ data: result, error: null }));
  expect(await createAccountContextService({ rpc })(actor, {})).toEqual(result);
  expect(rpc).toHaveBeenCalledWith("payr_wallet_context_v1", { p_workspace_id: actor.workspaceId, p_owner_wallet: null, p_connector_id: actor.connectorId });
});
it("rejects target overrides before querying and never returns database error details", async () => {
  const rpc = vi.fn(async () => ({ data: null, error: { message: "sensitive data" } }));
  const service = createAccountContextService({ rpc });
  await expect(service(actor, { workspaceId: actor.workspaceId })).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
  await expect(service(actor, {})).rejects.toMatchObject({ code: "DATABASE_ERROR" });
});
