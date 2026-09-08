import { expect, it } from "vitest";
import { settledFixture, sql } from "./settlement.test-support";
import { createIdentityRepository } from "./identity";

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

async function fixture(ready = true) {
  const value = await settledFixture();
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
