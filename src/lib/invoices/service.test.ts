import { expect, it, vi } from "vitest";
import type { DraftRepository } from "./contracts";
import { createInvoiceDraftService } from "./service";

it("reports structured omissions without reserving an idempotency key or creating a draft", async () => {
  const saveDraft = vi.fn();
  const repository = {
    findReplay: vi.fn().mockResolvedValue(null),
    getContext: vi.fn().mockResolvedValue({ sender: null, client: null, previous: null, commercialState: null }),
    saveDraft,
  } as unknown as DraftRepository;
  await expect(createInvoiceDraftService(repository).createDraft({
    workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}`, connectorId: null,
  }, { idempotencyKey: "missing-fields" })).rejects.toMatchObject({
    code: "MISSING_FIELDS", status: 422,
    details: { missingFields: expect.arrayContaining([{ path: "items", reason: "required" }]) },
  });
  expect(saveDraft).not.toHaveBeenCalled();
});
