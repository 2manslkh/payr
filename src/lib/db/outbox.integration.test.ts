import { expect, it, vi } from "vitest";
import { settledFixture, sql } from "./settlement.test-support";
import { createIdentityRepository } from "./identity";
import { createOutboxRepository } from "./outbox";
import { createOutboxWorker } from "../email/outbox";
import type { ReceiptDeliveryWork, ReceiptEmailPayload, ReceiptEmailProvider } from "../email/outbox-contracts";

it("injects retry jitter samples at both bounds, caps the delay, and rejects invalid samples", () => {
  for (const attempt of [0, 1, 5, 6, 2147483647]) {
    const cap = Math.min(1800, 30 * 2 ** Math.min(attempt, 6));
    for (const sample of [0, 0.5, 1]) {
      expect(Number(sql(`select extract(epoch from public.payr_worker_retry_sample_v1('2030-01-01Z',${attempt},${sample})-'2030-01-01Z'::timestamptz);`)))
        .toBe(cap * (0.5 + sample / 2));
    }
  }
  for (const sample of ["null", "-0.1", "1.1", "'NaN'", "'Infinity'"]) {
    expect(() => sql(`select public.payr_worker_retry_sample_v1('2030-01-01Z',1,${sample});`)).toThrow();
  }
  expect(sql(`select bool_and(delay between 30 and 60),count(distinct delay)>1 from
    (select extract(epoch from public.payr_worker_retry_at_v1('2030-01-01Z',1)-'2030-01-01Z'::timestamptz) delay from generate_series(1,20)) samples;`))
    .toBe("t|t");
  expect(sql(`select has_function_privilege('anon','public.payr_worker_retry_sample_v1(timestamptz,integer,double precision)','execute'),
    has_function_privilege('authenticated','public.payr_worker_retry_sample_v1(timestamptz,integer,double precision)','execute'),
    has_function_privilege('service_role','public.payr_worker_retry_sample_v1(timestamptz,integer,double precision)','execute');`)).toBe("f|f|f");
});

async function fixture(ready = true, blockTime?: string) {
  const value = await settledFixture(false, undefined, 1, undefined, blockTime);
  const { db, receiptDocumentId, actor, target } = value;
  if (ready) {
    await db.rpc("payr_claim_receipt_v1", { p_id: receiptDocumentId });
    // Protocol fixture metadata; real stored-byte/QR verification is tested through the document/worker seams.
    const completion = await db.rpc("payr_complete_receipt_v1", { p_id: receiptDocumentId, p_fence: "1", p_artifact: {
      storageKey: `workspace/${actor.workspaceId}/receipt/${receiptDocumentId}.pdf`, pdfFilename: `receipt-${target.invoiceNumber}-v1.pdf`,
      contentType: "application/pdf", byteLength: 123, pdfContentHash: `0x${"a".repeat(64)}`, qrVerified: true,
    } });
    expect(completion.error).toBeNull(); expect(completion.data).toBe(true);
  }
  const deliveryId = sql(`select id from public.email_deliveries where settlement_id='${value.settlementId}' order by normalized_recipient limit 1;`);
  return { ...value, deliveryId };
}

it("does not claim before receipt readiness and grants one concurrent sender a fenced logical delivery", async () => {
  const pending = await fixture(false);
  const denied = await pending.db.rpc("payr_claim_delivery_v1", { p_id: pending.deliveryId });
  expect(denied.error).toBeNull(); expect(denied.data).toBeNull();
  const { db, deliveryId } = await fixture();
  const results = await Promise.all([db.rpc("payr_claim_delivery_v1", { p_id: deliveryId }), db.rpc("payr_claim_delivery_v1", { p_id: deliveryId })]);
  for (const result of results) expect(result.error).toBeNull();
  const claimed = results.map((result) => result.data).filter(Boolean);
  expect(claimed).toHaveLength(1);
  expect(claimed[0]).toMatchObject({ id: deliveryId, state: "sending", fence: "1", attemptCount: 1,
    firstProviderAttemptAt: null, providerRequestStartedAt: null, ambiguousSince: null, payloadHash: null, receipt: { state: "ready" } });
});

it("recovers future receipts fairly without generating the historical queue", async () => {
  const old = await fixture(false);
  const activation = sql("select activated_at from public.receipt_email_activation;");
  try {
    sql("update public.receipt_email_activation set activated_at=clock_timestamp();");
    const late = await fixture(false, new Date(Date.parse(activation) - 60_000).toISOString());
    const first = await fixture(false);
    const next = await fixture(false);
    const claimed = await first.db.rpc("payr_claim_next_automatic_receipt_v1");
    expect(claimed.error).toBeNull(); expect(claimed.data).toMatchObject({ id: first.receiptDocumentId, state: "rendering", fence: "1" });
    const failed = await first.db.rpc("payr_fail_receipt_v1", { p_id: first.receiptDocumentId, p_fence: "1", p_code: "DOCUMENT_UNAVAILABLE" });
    expect(failed.error).toBeNull(); expect(failed.data).toBe(true);
    sql(`update public.receipt_documents set next_attempt_at=clock_timestamp()-interval '1 second' where id='${first.receiptDocumentId}';`);
    const rotated = await first.db.rpc("payr_claim_next_automatic_receipt_v1");
    expect(rotated.error).toBeNull(); expect(rotated.data).toMatchObject({ id: next.receiptDocumentId, state: "rendering" });
    const retried = await first.db.rpc("payr_claim_next_automatic_receipt_v1");
    expect(retried.error).toBeNull(); expect(retried.data).toMatchObject({ id: first.receiptDocumentId, fence: "2" });
    const empty = await first.db.rpc("payr_claim_next_automatic_receipt_v1");
    expect(empty.error).toBeNull(); expect(empty.data).toBeNull();
    expect(sql(`select bool_and(state='pending' and fence=0) from public.receipt_documents where id in ('${old.receiptDocumentId}','${late.receiptDocumentId}');`)).toBe("t");
  } finally {
    sql(`update public.receipt_email_activation set activated_at='${activation}'::timestamptz;`);
  }
  expect(sql(`select has_function_privilege('anon','public.payr_claim_next_automatic_receipt_v1()','execute'),
    has_function_privilege('authenticated','public.payr_claim_next_automatic_receipt_v1()','execute'),
    has_function_privilege('service_role','public.payr_claim_next_automatic_receipt_v1()','execute');`)).toBe("f|f|t");
});

it("restricts automatic delivery to post-cutover payments and the requested receipt, retaining fenced claims", async () => {
  const old = await fixture();
  // Simulate installation after an existing queue, without changing immutable settlement facts.
  const activation = sql("select activated_at from public.receipt_email_activation;");
  try {
    sql("update public.receipt_email_activation set activated_at=clock_timestamp();");
    const late = await fixture(true, new Date(Date.parse(activation) - 60_000).toISOString());
    const fresh = await fixture();
    const other = await fixture();
    const args = { p_id: null, p_receipt_document_id: fresh.receiptDocumentId };
    const denied = await old.db.rpc("payr_claim_automatic_receipt_delivery_v1", { p_id: old.deliveryId, p_receipt_document_id: null });
    expect(denied.error).toBeNull(); expect(denied.data).toBeNull();
    const lateDenied = await late.db.rpc("payr_claim_automatic_receipt_delivery_v1", { p_id: null, p_receipt_document_id: late.receiptDocumentId });
    expect(lateDenied.error).toBeNull(); expect(lateDenied.data).toBeNull();
    const mismatch = await fresh.db.rpc("payr_claim_automatic_receipt_delivery_v1", { ...args, p_id: other.deliveryId });
    expect(mismatch.error).toBeNull(); expect(mismatch.data).toBeNull();
    const claims = await Promise.all([1, 2, 3].map(() => fresh.db.rpc("payr_claim_automatic_receipt_delivery_v1", args)));
    for (const result of claims) expect(result.error).toBeNull();
    const claimed = claims.map((result) => result.data).filter(Boolean);
    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((row) => row.id)).size).toBe(2);
    for (const row of claimed) expect(row).toMatchObject({ receiptDocumentId: fresh.receiptDocumentId, fence: "1", state: "sending" });
    const recovered = await fresh.db.rpc("payr_claim_automatic_receipt_delivery_v1", { p_id: null, p_receipt_document_id: null });
    expect(recovered.error).toBeNull(); expect(recovered.data).toMatchObject({ receiptDocumentId: other.receiptDocumentId });
    const second = await fresh.db.rpc("payr_claim_automatic_receipt_delivery_v1", { p_id: null, p_receipt_document_id: null });
    expect(second.error).toBeNull(); expect(second.data).toMatchObject({ receiptDocumentId: other.receiptDocumentId });
    const exhausted = await fresh.db.rpc("payr_claim_automatic_receipt_delivery_v1", { p_id: null, p_receipt_document_id: null });
    expect(exhausted.error).toBeNull(); expect(exhausted.data).toBeNull();
    expect(sql(`select bool_and(state='pending' and fence=0) from public.email_deliveries where settlement_id='${old.settlementId}';`)).toBe("t");
    expect(sql(`select bool_and(state='pending' and fence=0) from public.email_deliveries where settlement_id='${late.settlementId}';`)).toBe("t");
  } finally {
    sql(`update public.receipt_email_activation set activated_at='${activation}'::timestamptz;`);
  }
  expect(sql(`select has_function_privilege('anon','public.payr_claim_automatic_receipt_delivery_v1(uuid,uuid)','execute'),
    has_function_privilege('authenticated','public.payr_claim_automatic_receipt_delivery_v1(uuid,uuid)','execute'),
    has_function_privilege('service_role','public.payr_claim_automatic_receipt_delivery_v1(uuid,uuid)','execute'),
    has_table_privilege('service_role','public.receipt_email_activation','update');`)).toBe("f|f|t|f");
});

// Protocol-only payload: real PDF preparation and stored-byte verification live in receipt-workers.integration.test.ts.
async function prepareAutomaticEmail(work: ReceiptDeliveryWork): Promise<ReceiptEmailPayload> {
  return { from: "Payr <sender@example.test>", to: [work.normalizedRecipient], subject: "Receipt",
    html: "<p>Paid</p>", text: "Paid", attachments: [{ filename: work.receipt.artifact!.pdfFilename, content: "cGRm" }] };
}

it.each(["retry_wait", "expired_lease"] as const)("runs scoped automatic delivery through %s recovery with identical provider key and payload", async (recovery) => {
  const unrelated = await fixture();
  const { db, receiptDocumentId, deliveryId: id, settlementId } = await fixture();
  const repository = createOutboxRepository(db, { receiptDocumentId });
  const prepare = vi.fn(prepareAutomaticEmail);
  const send = vi.fn<ReceiptEmailProvider["send"]>()
    .mockImplementationOnce(async () => {
      // Expire after begin has persisted the request marker, simulating an escaped request and lost sender.
      if (recovery === "expired_lease") {
        sql(`update public.email_deliveries set lease_until=clock_timestamp()-interval '1 second' where id='${id}';`);
        return { kind: "sent", providerMessageId: "lost-sender" };
      }
      return { kind: "retry", code: "PROVIDER_RATE_LIMITED" };
    })
    .mockResolvedValue({ kind: "sent", providerMessageId: "recovered-sender" });
  const worker = createOutboxWorker(repository, prepare, { send });
  expect(await worker.run(id)).toEqual({ outcome: recovery === "retry_wait" ? "retry_wait" : "lease_lost", id });
  const before = sql(`select provider_idempotency_key,provider_payload_hash,first_provider_attempt_at from public.email_deliveries where id='${id}';`);
  expect(sql(`select state,fence,attempt_count,provider_request_started_at is not null,provider_payload_hash is not null
    from public.email_deliveries where id='${id}';`)).toBe(`${recovery === "retry_wait" ? "retry_wait|1|1|f" : "sending|1|1|t"}|t`);
  if (recovery === "retry_wait") {
    expect(await worker.run(id)).toEqual({ outcome: "idle" });
    sql(`update public.email_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id='${id}';`);
  }
  expect(await worker.run(id)).toEqual({ outcome: "sent", id });
  expect(prepare.mock.calls[1][0]).toMatchObject({ id, receiptDocumentId, fence: "2", attemptCount: 2, providerRequestStartedAt: null });
  expect(prepare.mock.calls[1][0].ambiguousSince !== null).toBe(recovery === "expired_lease");
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
  expect(send.mock.calls[1][1]).toBe(send.mock.calls[0][1]);
  expect(sql(`select provider_idempotency_key,provider_payload_hash,first_provider_attempt_at from public.email_deliveries where id='${id}';`)).toBe(before);
  expect(sql(`select state,fence,attempt_count,provider_message_id from public.email_deliveries where id='${id}';`)).toBe("sent|2|2|recovered-sender");
  expect(await repository.finish(id, "1", { kind: "sent", providerMessageId: "stale-sender" })).toBeNull();
  expect(await worker.run(id)).toEqual({ outcome: "idle" });
  const sibling = sql(`select id from public.email_deliveries where settlement_id='${settlementId}' and id<>'${id}';`);
  expect(await worker.run()).toEqual({ outcome: "sent", id: sibling });
  expect(await worker.run()).toEqual({ outcome: "idle" });
  expect(await worker.run(unrelated.deliveryId)).toEqual({ outcome: "idle" });
  expect(send).toHaveBeenCalledTimes(3);
  expect(prepare.mock.calls.every(([work]) => work.receiptDocumentId === receiptDocumentId)).toBe(true);
  expect(sql(`select bool_and(state='pending' and fence=0 and attempt_count=0 and provider_request_started_at is null)
    from public.email_deliveries where settlement_id='${unrelated.settlementId}';`)).toBe("t");
});

it("rotates an eligible automatic retry behind untouched due deliveries, then rotates the next retry", async () => {
  const { db, receiptDocumentId, settlementId } = await fixture();
  const ids = sql(`select id from public.email_deliveries where settlement_id='${settlementId}' order by created_at,id;`).split("\n");
  expect(ids).toHaveLength(2);
  const send = vi.fn<ReceiptEmailProvider["send"]>().mockResolvedValue({ kind: "retry", code: "PROVIDER_RATE_LIMITED" });
  const worker = createOutboxWorker(createOutboxRepository(db, { receiptDocumentId }), prepareAutomaticEmail, { send });
  expect(await worker.run(ids[0])).toEqual({ outcome: "retry_wait", id: ids[0] });
  sql(`update public.email_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id='${ids[0]}';`);
  // Both rows are eligible; retry scheduling must not let the oldest creation monopolize the queue.
  expect(await worker.run()).toEqual({ outcome: "retry_wait", id: ids[1] });
  sql(`update public.email_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id='${ids[1]}';`);
  expect(await worker.run()).toEqual({ outcome: "retry_wait", id: ids[0] });
  expect(send).toHaveBeenCalledTimes(3);
  expect(sql(`select attempt_count from public.email_deliveries where settlement_id='${settlementId}' order by created_at,id;`)).toBe("2\n1");
});

it("persists the provider request marker and payload hash before accepting a fenced sent result", async () => {
  const { db, deliveryId: id } = await fixture();
  const claimed = await db.rpc("payr_claim_delivery_v1", { p_id: id });
  const key = claimed.data.providerIdempotencyKey;
  const begun = await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "1", p_payload_hash: "a".repeat(64) });
  expect(begun.error).toBeNull();
  expect(begun.data).toMatchObject({ state: "sending", payloadHash: "a".repeat(64), providerIdempotencyKey: key });
  expect(begun.data.firstProviderAttemptAt).not.toBeNull();
  expect(begun.data.providerRequestStartedAt).not.toBeNull();
  expect((await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "1", p_payload_hash: "a".repeat(64) })).data).toBeNull();
  const result = { kind: "sent", providerMessageId: "00000000-0000-4000-8000-000000000001" };
  expect((await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "2", p_result: result })).data).toBeNull();
  const sent = await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: result });
  expect(sent.error).toBeNull(); expect(sent.data).toMatchObject({ state: "sent", providerMessageId: result.providerMessageId, providerIdempotencyKey: key });
  expect((await db.rpc("payr_claim_delivery_v1", { p_id: id })).data).toBeNull();
  expect(() => sql(`update public.email_deliveries set provider_idempotency_key='different' where id='${id}';`)).toThrow();
});

it.each([false, true])("recovers a stale sender, retaining whether its request may have escaped: %s", async (requested) => {
  const { db, deliveryId: id } = await fixture();
  const first = (await db.rpc("payr_claim_delivery_v1", { p_id: id })).data;
  let started = null;
  if (requested) started = (await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "1", p_payload_hash: "a".repeat(64) })).data.firstProviderAttemptAt;
  sql(`update public.email_deliveries set lease_until=clock_timestamp()-interval '1 second' where id='${id}';`);
  const reclaimed = await db.rpc("payr_claim_delivery_v1", { p_id: id });
  expect(reclaimed.error).toBeNull();
  expect(reclaimed.data).toMatchObject({ state: "sending", fence: "2", attemptCount: 2,
    providerIdempotencyKey: first.providerIdempotencyKey, firstProviderAttemptAt: started, providerRequestStartedAt: null });
  expect(reclaimed.data.ambiguousSince !== null).toBe(requested);
  const begun = (await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "2", p_payload_hash: "a".repeat(64) })).data;
  expect(begun.state).toBe("sending");
  if (requested) expect(begun.firstProviderAttemptAt).toBe(started);
  expect((await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: { kind: "sent", providerMessageId: "old-worker" } })).data).toBeNull();
});

it("stops a changed payload before another provider-request marker can be written", async () => {
  const { db, deliveryId: id } = await fixture();
  await db.rpc("payr_claim_delivery_v1", { p_id: id });
  await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "1", p_payload_hash: "a".repeat(64) });
  const retry = await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: { kind: "retry", code: "PROVIDER_RATE_LIMITED" } });
  expect(retry.data.state).toBe("retry_wait");
  expect(sql(`select extract(epoch from next_attempt_at-updated_at) between 30 and 60 from public.email_deliveries where id='${id}';`)).toBe("t");
  const scheduled = retry.data.nextAttemptAt;
  expect((await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: { kind: "retry", code: "PROVIDER_RATE_LIMITED" } })).data).toBeNull();
  expect(Date.parse(sql(`select next_attempt_at from public.email_deliveries where id='${id}';`))).toBe(Date.parse(scheduled));
  sql(`update public.email_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id='${id}';`);
  await db.rpc("payr_claim_delivery_v1", { p_id: id });
  const stopped = await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "2", p_payload_hash: "b".repeat(64) });
  expect(stopped.error).toBeNull();
  expect(stopped.data).toMatchObject({ state: "manual_review", payloadHash: "a".repeat(64), providerRequestStartedAt: null, lastErrorCode: "PAYLOAD_CHANGED" });
});

it("uses the exact 24-hour boundary, while definite failures alone do not imply ambiguity", () => {
  expect(sql(`select public.payr_delivery_window_closed_v1('2030-01-01Z','2030-01-01Z','2030-01-01 23:59:59.999999Z'),
    public.payr_delivery_window_closed_v1('2030-01-01Z','2030-01-01Z','2030-01-02Z'),
    public.payr_delivery_window_closed_v1('2030-01-01Z','2030-01-01Z','2030-01-02 00:00:00.000001Z'),
    public.payr_delivery_window_closed_v1('2030-01-01Z',null,'2030-01-03Z'),
    public.payr_delivery_window_closed_v1(null,'2030-01-01Z','2030-01-03Z');`)).toBe("f|t|t|f|t");
});

it.each(["claim", "begin"])("stops ambiguous delivery outside its original 24-hour window at %s", async (stage) => {
  const { db, deliveryId: id } = await fixture();
  await db.rpc("payr_claim_delivery_v1", { p_id: id });
  await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "1", p_payload_hash: "a".repeat(64) });
  sql(`begin; set local session_replication_role=replica; update public.email_deliveries set created_at=clock_timestamp()-interval '2 days',
    first_provider_attempt_at=clock_timestamp()-interval '${stage === "claim" ? "24 hours" : "23 hours"}',
    lease_until=clock_timestamp()-interval '1 second' where id='${id}'; commit;`);
  const claimed = await db.rpc("payr_claim_delivery_v1", { p_id: id });
  expect(claimed.error).toBeNull();
  if (stage === "claim") expect(claimed.data.state).toBe("manual_review");
  else {
    expect(claimed.data.state).toBe("sending");
    sql(`begin; set local session_replication_role=replica; update public.email_deliveries set first_provider_attempt_at=clock_timestamp()-interval '24 hours' where id='${id}'; commit;`);
    const begun = await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "2", p_payload_hash: "a".repeat(64) });
    expect(begun.error).toBeNull(); expect(begun.data.state).toBe("manual_review");
  }
});

it("does not accept sent completion without a request marker, and permanent failure preserves the receipt", async () => {
  const { db, deliveryId: id, receiptDocumentId } = await fixture();
  await db.rpc("payr_claim_delivery_v1", { p_id: id });
  const unmarked = await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: { kind: "sent", providerMessageId: "missing-marker" } });
  expect(unmarked.error?.message).toBe("REQUEST_MARKER_REQUIRED");
  await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "1", p_payload_hash: "a".repeat(64) });
  const failed = await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: { kind: "failed", code: "PROVIDER_REJECTED" } });
  expect(failed.error).toBeNull(); expect(failed.data.state).toBe("failed");
  expect(sql(`select state from public.receipt_documents where id='${receiptDocumentId}';`)).toBe("ready");
});

it("records redacted settlement, receipt and provider-acceptance activity once", async () => {
  const { db, deliveryId: id, actor } = await fixture();
  await db.rpc("payr_claim_delivery_v1", { p_id: id });
  await db.rpc("payr_begin_delivery_v1", { p_id: id, p_fence: "1", p_payload_hash: "a".repeat(64) });
  const result = { kind: "sent", providerMessageId: "private-provider-id" };
  await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: result });
  await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: result });
  const events = JSON.parse(sql(`select coalesce(json_agg(row_to_json(a)),'[]') from public.audit_events a
    where workspace_id='${actor.workspaceId}' and action in ('settlement.recorded','receipt.generate','receipt.deliver');`));
  expect(events).toHaveLength(3);
  expect(events.map((event: { action: string }) => event.action).sort()).toEqual(["receipt.deliver", "receipt.generate", "settlement.recorded"]);
  expect(JSON.stringify(events)).not.toContain("private-provider-id");
  expect(JSON.stringify(events)).not.toContain("@example.test");
});

it("projects retry activity through the actual owner activity repository", async () => {
  const { db, deliveryId: id, actor } = await fixture();
  await db.rpc("payr_claim_delivery_v1", { p_id: id });
  await db.rpc("payr_finish_delivery_v1", { p_id: id, p_fence: "1", p_result: { kind: "retry", code: "DOCUMENT_UNAVAILABLE" } });
  const events = await createIdentityRepository(db).listActivity(actor);
  expect(events.some((event) => event.action === "receipt.deliver" && event.outcome === "retry_wait")).toBe(true);
});
