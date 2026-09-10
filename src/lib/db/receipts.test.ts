import { expect, it, vi } from "vitest";
import { createReceiptRepository } from "./receipts";
import { testReceiptWork } from "../receipts/test-support";

it("validates the exact claimed receipt binding and keeps bigint fences as strings", async () => {
  const { work } = testReceiptWork();
  work.fence = "9007199254740993";
  const rpc = vi.fn().mockResolvedValue({ data: work, error: null });
  expect(await createReceiptRepository({ rpc }).claim(work.id)).toEqual(work);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("payr_claim_receipt_v1", { p_id: work.id });
  work.settlement = { ...work.settlement, amountAtomic: "1" };
  await expect(createReceiptRepository({ rpc }).claim(work.id)).rejects.toThrow("DOCUMENT_UNAVAILABLE");
});

it("uses the future-only fair queue for scheduled receipt generation without unrestricted fallback", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  expect(await createReceiptRepository({ rpc }).claim()).toBeNull();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("payr_claim_next_automatic_receipt_v1", {});
});
