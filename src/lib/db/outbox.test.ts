// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createOutboxRepository } from "./outbox";

it("never falls back to the historical queue when an automatic scoped claim is empty", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const receiptDocumentId = "00000000-0000-4000-8000-000000000001";
  expect(await createOutboxRepository({ rpc }, { receiptDocumentId }).claim()).toBeNull();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("payr_claim_automatic_receipt_delivery_v1", {
    p_id: null, p_receipt_document_id: receiptDocumentId,
  });
});

it("filters cron recovery by automatic eligibility and rejects malformed scopes", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  expect(await createOutboxRepository({ rpc }, {}).claim()).toBeNull();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("payr_claim_automatic_receipt_delivery_v1", { p_id: null, p_receipt_document_id: null });
  expect(() => createOutboxRepository({ rpc }, { receiptDocumentId: "invalid" })).toThrow();
});
