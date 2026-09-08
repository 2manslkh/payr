import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import { keccak256 } from "viem";
import { settledFixture, sql } from "./settlement.test-support";
import { createReceiptRepository } from "./receipts";
import { createOutboxRepository } from "./outbox";
import { createPrivateDocumentStorage } from "../documents/invoice-storage";
import { createReceiptDocumentPort } from "../documents/receipt-storage";
import { createReceiptWorker } from "../receipts/worker";
import { createOutboxWorker } from "../email/outbox";
import { prepareReceiptEmail } from "../email/receipt";
import { createResendReceiptProvider } from "../email/resend";

it("claims a receipt once with a string fence and its immutable invoice and settlement facts", async () => {
  const { db, receiptDocumentId, target } = await settledFixture();
  const [first, second] = await Promise.all([
    db.rpc("payr_claim_receipt_v1", { p_id: receiptDocumentId }), db.rpc("payr_claim_receipt_v1", { p_id: receiptDocumentId }),
  ]);
  expect(first.error).toBeNull(); expect(second.error).toBeNull();
  const rows = [first.data, second.data].filter(Boolean);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: receiptDocumentId, state: "rendering", fence: "1", attemptCount: 1, artifact: null,
    attempt: { invoiceId: target.invoiceId }, settlement: { amountAtomic: target.snapshot.amountAtomic } });
});

it("retries transient receipt failures with exact backoff and fences terminal failure", async () => {
  const { db, receiptDocumentId: id } = await settledFixture();
  await db.rpc("payr_claim_receipt_v1", { p_id: id });
  const retry = await db.rpc("payr_fail_receipt_v1", { p_id: id, p_fence: "1", p_code: "DOCUMENT_UNAVAILABLE" });
  expect(retry.error).toBeNull(); expect(retry.data).toBe(true);
  expect(sql(`select state::text||':'||round(extract(epoch from next_attempt_at-updated_at))::text from public.receipt_documents where id='${id}';`)).toBe("retry_wait:60");
  expect((await db.rpc("payr_claim_receipt_v1", { p_id: id })).data).toBeNull();
  sql(`update public.receipt_documents set next_attempt_at=clock_timestamp()-interval '1 second' where id='${id}';`);
  expect((await db.rpc("payr_claim_receipt_v1", { p_id: id })).data).toMatchObject({ fence: "2" });
  expect((await db.rpc("payr_fail_receipt_v1", { p_id: id, p_fence: "1", p_code: "ARTIFACT_VERIFICATION_FAILED" })).data).toBe(false);
  expect((await db.rpc("payr_fail_receipt_v1", { p_id: id, p_fence: "2", p_code: "ARTIFACT_VERIFICATION_FAILED" })).data).toBe(true);
  expect(sql(`select state from public.receipt_documents where id='${id}';`)).toBe("failed");
  expect((await db.rpc("payr_claim_receipt_v1", { p_id: id })).data).toBeNull();
});

it("protects receipt identity even before the artifact is ready", async () => {
  const { receiptDocumentId: id } = await settledFixture();
  expect(() => sql(`update public.receipt_documents set verifier_hash='${"b".repeat(64)}' where id='${id}';`)).toThrow();
});

it("generates a real private receipt once and retries identical email bytes independently of an old invoice key", async () => {
  const keys = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
  const { db, actor, receiptDocumentId: id, receiptTokenId, settlementId } = await settledFixture(true, keys, 2);
  const config = { keys, appOrigin: "https://example.test", explorerOrigin: "https://explorer.test" };
  const storage = createPrivateDocumentStorage(db), receipts = createReceiptRepository(db);
  const worker = createReceiptWorker(receipts, createReceiptDocumentPort(storage), config);
  expect(await worker.run(id)).toEqual({ outcome: "ready", id });
  expect(await worker.run(id)).toEqual({ outcome: "idle" });
  const ready = (await receipts.read(receiptTokenId))!;
  const stored = (await storage.read(ready.artifact!.storageKey))!;
  expect(keccak256(stored.bytes)).toBe(ready.artifact!.pdfContentHash);
  const listed = await db.storage.from("documents").list(`workspace/${actor.workspaceId}/receipt`);
  expect(listed.error).toBeNull(); expect(listed.data).toHaveLength(1);
  const deliveryId = sql(`select id from public.email_deliveries where settlement_id='${settlementId}';`);
  const request = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ id: "00000000-0000-4000-8000-000000000001" }));
  const outbox = createOutboxWorker(createOutboxRepository(db), (work) => prepareReceiptEmail(work, config, storage, "Payr <sender@example.test>"), createResendReceiptProvider("test-only-provider-key", request));
  expect(await outbox.run(deliveryId)).toEqual({ outcome: "retry_wait", id: deliveryId });
  keys.delete(1);
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2032-01-01T00:00:00Z"));
  try {
    sql(`update public.email_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id='${deliveryId}';`);
    expect(await outbox.run(deliveryId)).toEqual({ outcome: "sent", id: deliveryId });
  } finally { clock.mockRestore(); }
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body);
  expect(request.mock.calls[0][1].headers["Idempotency-Key"]).toBe(request.mock.calls[1][1].headers["Idempotency-Key"]);
  const payload = JSON.parse(request.mock.calls[1][1].body);
  expect(payload.to).toEqual(["owner@example.test"]);
  expect(new Uint8Array(Buffer.from(payload.attachments[0].content, "base64"))).toEqual(stored.bytes);
  expect(await outbox.run(deliveryId)).toEqual({ outcome: "idle" });
}, 120_000);

it("reclaims stale rendering, rejects its old fence, and exposes only a complete immutable ready artifact", async () => {
  const { db, receiptDocumentId: id, receiptTokenId, actor, target } = await settledFixture();
  const pending = await db.rpc("payr_read_receipt_v1", { p_token_id: receiptTokenId });
  expect(pending.error).toBeNull(); expect(pending.data).toBeNull();
  await db.rpc("payr_claim_receipt_v1", { p_id: id });
  sql(`update public.receipt_documents set lease_until=clock_timestamp()-interval '1 second' where id='${id}';`);
  const claimed = await db.rpc("payr_claim_receipt_v1", { p_id: id });
  expect(claimed.data).toMatchObject({ fence: "2", attemptCount: 2 });
  const artifact = { storageKey: `workspace/${actor.workspaceId}/receipt/${id}.pdf`,
    pdfFilename: `receipt-${target.invoiceNumber}-v1.pdf`, contentType: "application/pdf", byteLength: 123,
    pdfContentHash: `0x${"a".repeat(64)}`, qrVerified: true };
  const stale = await db.rpc("payr_complete_receipt_v1", { p_id: id, p_fence: "1", p_artifact: artifact });
  expect(stale.error).toBeNull(); expect(stale.data).toBe(false);
  const ready = await db.rpc("payr_complete_receipt_v1", { p_id: id, p_fence: "2", p_artifact: artifact });
  expect(ready.error).toBeNull(); expect(ready.data).toBe(true);
  const read = await db.rpc("payr_read_receipt_v1", { p_token_id: receiptTokenId });
  expect(read.error).toBeNull(); expect(read.data).toMatchObject({ state: "ready", artifact });
  expect((await db.rpc("payr_claim_receipt_v1", { p_id: id })).data).toBeNull();
  expect((await db.rpc("payr_complete_receipt_v1", { p_id: id, p_fence: "2", p_artifact: artifact })).data).toBe(false);
  expect(() => sql(`update public.receipt_documents set content_hash='0x${"b".repeat(64)}' where id='${id}';`)).toThrow();
});
