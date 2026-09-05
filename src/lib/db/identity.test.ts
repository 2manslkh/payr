import { expect, it } from "vitest";
import { createIdentityRepository } from "./identity";

it("passes both workspace and owner to private identity reads", async () => {
  const calls: unknown[] = [];
  const repository = createIdentityRepository({
    rpc(name, parameters) {
      calls.push({ name, parameters });
      return Promise.resolve({ data: [], error: null });
    },
  });
  await expect(repository.listClients({ workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` })).resolves.toEqual([]);
  expect(calls).toEqual([{
    name: "payr_list_clients_v1",
    parameters: { p_workspace_id: "00000000-0000-4000-8000-000000000001", p_owner_wallet: `0x${"1".repeat(40)}` },
  }]);
});
