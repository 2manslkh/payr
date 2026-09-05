import { expect, it } from "vitest";
import { createDraftRepository } from "./drafts";

it("scopes replay reads to the verified owner or connector instead of inventing an owner session", async () => {
  const calls: unknown[] = [];
  const repository = createDraftRepository({ rpc(name, parameters) {
    calls.push({ name, parameters });
    return Promise.resolve({ data: null, error: null });
  } });
  await expect(repository.findReplay({
    workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: null,
    connectorId: "00000000-0000-4000-8000-000000000002",
  }, "request-1", "a".repeat(64))).resolves.toBeNull();
  expect(calls).toEqual([{
    name: "payr_find_draft_replay_v1",
    parameters: {
      p_workspace_id: "00000000-0000-4000-8000-000000000001", p_owner_wallet: null,
      p_connector_id: "00000000-0000-4000-8000-000000000002", p_idempotency_key: "request-1", p_request_fingerprint: "a".repeat(64),
    },
  }]);
});
