import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import { fixtureDatabaseContainer } from "../../../scripts/local-test-config.mjs";
import { publishedFixture, sql } from "./settlement.test-support";
import { createDraftRepository } from "./drafts";
import { createInvoiceOutboxRepository } from "./outbox";
import type { PublicationReservation } from "../invoices/publication-contracts";
import { createPublicationRepository } from "./publication";
import { receiptRecipients } from "../email/address";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { createPublicationWorker } from "../invoices/publication-worker";
import { createTestDocumentPort } from "../invoices/publication.test-support";
import { canonicalJson } from "../domain/canonical-json";
import { canonicalPublicationJson, publicationLink } from "../invoices/publication-links";
import { createPublicationService } from "../invoices/publication";
import { createDocumentRepository } from "./documents";

// This guard rejects retained projects before any database access. Do not run outside the disposable harness.
async function fixture(sameRecipient = false, finalize = true, stopAfter: "reserved" | "rendering" | "stored" = "stored") {
  fixtureDatabaseContainer();
  const value = await publishedFixture(sameRecipient);
  const { actor, db, publication, target: historical, hash } = value;
  const draft = await createDraftRepository(db).saveDraft(actor, { draftId: null, expectedVersion: null, snapshot: historical.snapshot,
    idempotencyKey: randomUUID(), requestFingerprint: hash().slice(2) });
  const tokenId = randomUUID();
  const input: PublicationReservation = { draftId: draft.draftId, expectedVersion: 1, approval: true, deliveryApproval: true,
    emailConfig: { from: "Payr <sender@example.test>", appOrigin: "https://example.test", templateVersion: "invoice-issued-v1", network: "Arc Testnet" },
    idempotencyKey: randomUUID(), requestFingerprint: createHash("sha256").update(canonicalJson({ operation: "publish_invoice", workspaceId: actor.workspaceId,
      draftId: draft.draftId, expectedVersion: 1, approval: true, deliveryApproval: true })).digest("hex"),
    attemptId: randomUUID(), invoiceKey: hash(), publicationSalt: hash(),
    tokenId, keyVersion: 1, verifierHash: createKeyedTokenCodec(value.keys).derive(tokenId, "invoice-bearer", 1).verifierHash,
    chainId: 5042002, contractAddress: historical.contractAddress };
  const reserved = await publication.reserve(actor, input);
  const claimed = stopAfter === "reserved" ? reserved : (await publication.claim(reserved.id, randomUUID()))!;
  const fence = { attemptId: reserved.id, leaseOwner: claimed.leaseOwner!, fence: claimed.fence };
  const stored = stopAfter !== "stored" ? claimed : (await publication.store({ ...fence, artifact: { ...historical.artifact!, pdfFilename: `${reserved.invoiceNumber}.pdf` } }))!;
  const target = finalize ? (await publication.finalize(fence))! : stored;
  const outbox = createInvoiceOutboxRepository(db, target.id);
  return { ...value, historical, input, target, fence, outbox };
}

it("waits behind settlement's advisory lock, then rejects the initial marker after settlement commits", async () => {
  const { target, outbox, actor, hash } = await fixture();
  const work = (await outbox.claim())!;
  const transactionHash = hash();
  const child = spawn("docker", ["exec", "-i", fixtureDatabaseContainer(), "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const ready = new Promise<number>((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); const match = stdout.match(/settlement-pid:(\d+)/); if (match) resolve(Number(match[1])); });
    child.on("error", reject); child.on("close", () => reject(new Error(stderr || "Settlement fixture closed")));
  });
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
  void finished.catch(() => {});
  child.stdin.write(`begin; set local statement_timeout='10s'; set local idle_in_transaction_session_timeout='15s';
    select pg_advisory_xact_lock(hashtextextended('payr:event:${target.chainId}:${transactionHash}:0',0));
    select pg_advisory_xact_lock(hashtextextended('payr:invoice:${target.chainId}:${target.contractAddress}:${target.invoiceKey}',0));
    select 'settlement-pid:'||pg_backend_pid();\n`);
  let pending: ReturnType<typeof outbox.begin> | undefined;
  try {
    const pid = await ready;
    pending = outbox.begin(work.id, work.fence, "a".repeat(64));
    void pending.catch(() => {});
    let waiting = false;
    for (let count = 0; count < 100; count++) {
      waiting = sql(`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid)) and wait_event='advisory');`) === "t";
      if (waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waiting).toBe(true);
    expect(sql(`select provider_request_started_at is null from public.email_deliveries where id='${work.id}';`)).toBe("t");
    const recipients = JSON.stringify(receiptRecipients(target.snapshot.sender.contactEmail!, target.snapshot.client.contactEmail));
    // Row locks after the advisory lock also prove begin is not waiting while holding these rows.
    child.stdin.end(`select 1 from public.invoices where id='${target.invoiceId}' for update;
      select 1 from public.access_links where token_id='${target.link.tokenId}' for update;
      select * from public.payr_record_settlement_v1('${actor.workspaceId}',${target.chainId},'${target.contractAddress}','${target.invoiceKey}',
        '${transactionHash}',0,100,clock_timestamp(),'${target.artifact!.documentCommitment}','0x${"5".repeat(40)}',
        '${target.snapshot.sender.payoutWallet}',${target.snapshot.amountAtomic},'${randomUUID()}',1,'${"b".repeat(64)}','2035-01-01Z','${recipients}'::jsonb);
      commit;`);
    await finished;
    expect((await pending)?.state).toBe("manual_review");
    expect(sql(`select provider_request_started_at is null and first_provider_attempt_at is null from public.email_deliveries where id='${work.id}';`)).toBe("t");
    expect(sql(`select count(*) from public.settlements where publication_attempt_id='${target.id}';`)).toBe("1");
  } finally {
    if (!child.stdin.writableEnded) child.stdin.end("rollback;");
    await finished;
    await pending?.catch(() => {});
  }
}, 25_000);

it("rotates eligible preparation retries behind untouched pending deliveries", async () => {
  const { outbox, target } = await fixture();
  const old = (await outbox.claim())!;
  await outbox.finish(old.id, old.fence, { kind: "retry", code: "DOCUMENT_UNAVAILABLE" });
  // Model an older retry cohort member; re-enable it immediately without changing its last-attempt ordering.
  sql(`begin; set local session_replication_role=replica;
    update public.email_deliveries set created_at=created_at-interval '1 day',next_attempt_at=clock_timestamp()-interval '1 second' where id='${old.id}'; commit;`);
  const next = (await outbox.claim())!;
  expect(next.publicationAttemptId).toBe(target.id);
  expect(next.id).not.toBe(old.id);
  expect(next.attemptCount).toBe(1);
  expect((await outbox.claim())?.id).toBe(old.id);
});

it("makes bounded global progress to new pending work despite an older always-eligible retry cohort", async () => {
  const old = await fixture();
  for (let index = 0; index < 2; index++) {
    const work = (await old.outbox.claim())!;
    await old.outbox.finish(work.id, work.fence, { kind: "retry", code: "DOCUMENT_UNAVAILABLE" });
  }
  sql(`update public.email_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where publication_attempt_id='${old.target.id}';`);
  const fresh = await fixture();
  const global = createInvoiceOutboxRepository(fresh.db);
  const bound = Number(sql(`select count(*) from public.email_deliveries where message_kind='invoice_issued'
    and state in ('pending','retry_wait','sending');`));
  let reached = false;
  for (let index = 0; index < bound; index++) {
    const work = await global.claim();
    if (!work) break;
    if (work.publicationAttemptId === fresh.target.id) { reached = true; break; }
    if (work.state === "sending") {
      await global.finish(work.id, work.fence, { kind: "retry", code: "DOCUMENT_UNAVAILABLE" });
      sql(`update public.email_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id='${work.id}';`);
    }
  }
  expect(reached).toBe(true);
});

it.each(["reserved", "rendering", "stored"] as const)("recovery claims an email-approved %s attempt but never legacy no-send work", async (stage) => {
  const { db, target, actor, input, publication } = await fixture(false, false, stage);
  if (stage !== "reserved") sql(`update public.publication_attempts set lease_until=clock_timestamp()-interval '1 second' where id='${target.id}';`);
  const recovery = createPublicationRepository(db, { invoiceEmailOnly: true });
  const recovered = (await recovery.claim(target.id, randomUUID()))!;
  expect(recovered.id).toBe(target.id);
  expect(recovered.state).toBe(stage === "stored" ? "stored" : "rendering");
  expect(BigInt(recovered.fence)).toBe(BigInt(target.fence) + 1n);
  const draft = await createDraftRepository(db).saveDraft(actor, { draftId: null, expectedVersion: null, snapshot: target.snapshot,
    idempotencyKey: randomUUID(), requestFingerprint: "a".repeat(64) });
  const legacy = await publication.reserve(actor, { ...input, draftId: draft.draftId, attemptId: randomUUID(), tokenId: randomUUID(),
    invoiceKey: `0x${randomUUID().replaceAll("-", "").repeat(2)}`, idempotencyKey: randomUUID(), deliveryApproval: undefined, emailConfig: undefined });
  expect(await recovery.claim(legacy.id, randomUUID())).toBeNull();
  expect((await publication.claim(legacy.id, randomUUID()))?.id).toBe(legacy.id);
});

it("resumes a reserved email-approved publication through the shared worker and atomically creates its deliveries", async () => {
  const { db, target, keys, outbox } = await fixture(false, false, "reserved");
  expect(await outbox.claim()).toBeNull();
  const worker = createPublicationWorker(createPublicationRepository(db, { invoiceEmailOnly: true }),
    { keys, appOrigin: "https://example.test", explorerOrigin: "https://explorer.test" }, createTestDocumentPort());
  expect(await worker.run(target.id)).toEqual({ outcome: "finalized", attemptId: target.id });
  expect(sql(`select count(*) from public.email_deliveries where publication_attempt_id='${target.id}';`)).toBe("2");
  expect((await outbox.claim())?.publicationAttemptId).toBe(target.id);
  expect((await worker.run(target.id)).outcome).toBe("busy");
  expect(sql(`select count(*) from public.email_deliveries where publication_attempt_id='${target.id}';`)).toBe("2");
});

it.each(["reserved", "rendering", "stored"] as const)("pins %s restart PDFs and result links across origin drift for foreground and background callers", async (stage) => {
  for (const background of [false, true]) {
    const { db, target, keys, actor, input, publication } = await fixture(false, false, "reserved");
    const originA = input.emailConfig!.appOrigin;
    const configA = { keys, appOrigin: originA, explorerOrigin: "https://explorer.test" };
    const configB = { ...configA, appOrigin: "https://changed.test", keys: new Map([...keys, [2, new Uint8Array(32).fill(9)] as const]) };
    expect(target.link.appOrigin).toBe(originA);
    const objects = new Map<string, Uint8Array>();
    const documents = createTestDocumentPort(objects);
    let originalArtifact = null;
    if (stage !== "reserved") {
      const claimed = (await publication.claim(target.id, randomUUID()))!;
      const proof = await documents.createOrRead({ storageKey: claimed.storageKey, canonicalInvoiceJson: canonicalPublicationJson(claimed),
        invoiceNumber: claimed.invoiceNumber, publicationSalt: claimed.publicationSalt, invoiceUrl: publicationLink(claimed.link, "invoice-bearer", configA) });
      if (stage === "stored") {
        originalArtifact = { pdfFilename: `${claimed.invoiceNumber}.pdf`, contentType: "application/pdf" as const, byteLength: proof.byteLength,
          invoiceDataHash: proof.invoiceDataHash, pdfContentHash: proof.pdfContentHash, documentCommitment: proof.documentCommitment, qrVerified: true as const };
        await publication.store({ attemptId: claimed.id, leaseOwner: claimed.leaseOwner!, fence: claimed.fence, artifact: originalArtifact });
      }
      sql(`update public.publication_attempts set lease_until=clock_timestamp()-interval '1 second' where id='${target.id}';`);
    }
    const originalBytes = objects.get(target.storageKey)?.slice();
    if (background) {
      const worker = createPublicationWorker(createPublicationRepository(db, { invoiceEmailOnly: true }), configB, documents);
      expect((await worker.run(target.id)).outcome).toBe("finalized");
    }
    const service = createPublicationService(publication, { getLinkConfig: () => configB, getDocuments: () => documents,
      getReservationConfig() { throw new Error("Restart must not allocate new work"); } });
    const result = await service.publish(actor, { draftId: target.invoiceId, expectedVersion: target.invoiceVersion,
      approval: true, deliveryApproval: true, idempotencyKey: input.idempotencyKey });
    expect(new URL(result.invoiceUrl).origin).toBe(originA);
    expect(result.invoicePdfUrl).toBe(`${result.invoiceUrl}/pdf`);
    const storedProof = await documents.createOrRead({ storageKey: target.storageKey, canonicalInvoiceJson: canonicalPublicationJson(target),
      invoiceNumber: target.invoiceNumber, publicationSalt: target.publicationSalt, invoiceUrl: result.invoiceUrl });
    expect(storedProof.decodedQrDestination).toBe(result.invoiceUrl);
    if (originalBytes) expect(objects.get(target.storageKey)).toEqual(originalBytes);
    const status = (await publication.statusData(actor, target.invoiceId))!;
    expect(status.attempt!.link.appOrigin).toBe(originA);
    if (originalArtifact) expect(status.attempt!.artifact).toEqual(originalArtifact);
    expect(objects.size).toBe(1);
    const read = await createDocumentRepository(db).readTarget(target.link.tokenId);
    expect(read!.attempt.link.appOrigin).toBe(originA);
    const legacy = await db.rpc("payr_read_invoice_document_v1", { p_token_id: target.link.tokenId });
    expect(legacy.error).toBeNull();
    expect(legacy.data.attempt.link).not.toHaveProperty("appOrigin");
    const replay = await db.rpc("payr_find_publication_replay_v1", { p_workspace_id: actor.workspaceId, p_owner_wallet: actor.ownerWallet,
      p_connector_id: null, p_idempotency_key: input.idempotencyKey, p_request_fingerprint: input.requestFingerprint });
    expect(replay.error).toBeNull(); expect(replay.data.link).not.toHaveProperty("appOrigin");
    expect((await publication.findReplay(actor, input.idempotencyKey, input.requestFingerprint))!.link.appOrigin).toBe(originA);
  }
});

it.each([false, true])("queues only this approved publication and deduplicates snapshot recipients (same: %s)", async (same) => {
  const { actor, publication, input, target, historical, db } = await fixture(same);
  const scope = { p_workspace_id: actor.workspaceId, p_owner_wallet: actor.ownerWallet, p_connector_id: null };
  const replays = await Promise.all([publication.reserve(actor, input), publication.reserve(actor, input), publication.statusData(actor, target.invoiceId)]);
  expect(replays[0]?.id).toBe(target.id); expect(replays[1]?.id).toBe(target.id);
  expect(sql(`select count(*) from public.email_deliveries where publication_attempt_id='${target.id}';`)).toBe(same ? "1" : "2");
  expect(sql(`select count(*) from public.email_deliveries where publication_attempt_id='${historical.id}';`)).toBe("0");
  const status = (await publication.statusData(actor, target.invoiceId))!;
  expect(status.invoiceDeliveries).toHaveLength(same ? 1 : 2);
  if (same) expect(status.invoiceDeliveries![0].roles).toEqual(["issuer", "client"]);
  expect(JSON.stringify(status.invoiceDeliveries)).not.toContain("@");
  expect((await db.rpc("payr_publication_status_v1", { ...scope, p_invoice_id: historical.invoiceId })).data).not.toHaveProperty("invoiceDeliveries");
  const invoiceRows = () => sql(`select jsonb_agg(to_jsonb(d) order by d.id) from public.email_deliveries d where publication_attempt_id='${target.id}';`);
  const before = invoiceRows();
  const ids: string[] = JSON.parse(before).map((row: { id: string }) => row.id);
  const globalReceiptClaim = await db.rpc("payr_claim_delivery_v1", { p_id: null });
  expect(globalReceiptClaim.error).toBeNull();
  if (globalReceiptClaim.data !== null) {
    expect(globalReceiptClaim.data.messageKind).toBe("receipt");
    expect(ids).not.toContain(globalReceiptClaim.data.id);
  }
  for (const id of ids) {
    const scopedReceiptClaim = await db.rpc("payr_claim_delivery_v1", { p_id: id });
    expect(scopedReceiptClaim.error).toBeNull(); expect(scopedReceiptClaim.data).toBeNull();
  }
  expect(invoiceRows()).toBe(before);
});

it("does not retrofit delivery approval onto a v1 replay even using the original attempt ID", async () => {
  const { db, actor, historical } = await fixture();
  const descriptor = JSON.parse(sql(`select jsonb_build_object('idempotencyKey',r.idempotency_key,'requestFingerprint',r.request_fingerprint)
    from public.idempotency_requests r join public.publication_attempts a on a.idempotency_request_id=r.id where a.id='${historical.id}';`));
  const result = await db.rpc("payr_reserve_publication_v2", { p_workspace_id: actor.workspaceId, p_owner_wallet: actor.ownerWallet, p_connector_id: null,
    p_input: { draftId: historical.invoiceId, expectedVersion: 1, approval: true, deliveryApproval: true, ...descriptor,
      emailConfig: { from: "sender@example.test", appOrigin: "https://example.test", templateVersion: "invoice-issued-v1", network: "Arc Testnet" },
      attemptId: historical.id, invoiceKey: historical.invoiceKey, publicationSalt: historical.publicationSalt, tokenId: historical.link.tokenId,
      keyVersion: historical.link.keyVersion, verifierHash: historical.link.verifierHash, chainId: historical.chainId, contractAddress: historical.contractAddress } });
  expect(result.error).toBeNull();
  expect(sql(`select count(*) from public.invoice_email_approvals where publication_attempt_id='${historical.id}';`)).toBe("0");
});

it("rolls finalization back if transactional enqueue fails", async () => {
  const { db, target, fence, publication } = await fixture(false, false);
  // A transaction-local injected trigger rolls itself back together with the tested finalization.
  expect(() => sql(`begin;
    create function public.payr_test_reject_invoice_email() returns trigger language plpgsql as $$ begin raise exception 'TEST_ENQUEUE_REJECTED'; end $$;
    create trigger payr_test_reject_invoice_email before insert on public.email_deliveries for each row execute function public.payr_test_reject_invoice_email();
    select public.payr_finalize_publication_v1('${target.id}','${fence.leaseOwner}',${fence.fence}); rollback;`)).toThrow();
  expect(sql(`select state from public.publication_attempts where id='${target.id}';`)).toBe("stored");
  expect(sql(`select commercial_state from public.invoices where id='${target.invoiceId}';`)).toBe("draft");
  expect(sql(`select count(*) from public.email_deliveries where publication_attempt_id='${target.id}';`)).toBe("0");
  expect((await publication.finalize(fence))!.state).toBe("finalized");
  expect((await db.rpc("payr_claim_invoice_delivery_v1", { p_publication_attempt_id: target.id })).error).toBeNull();
});

it("fences concurrent claims and lets a failing recipient retry without resending the accepted recipient", async () => {
  const { outbox, target } = await fixture();
  const [a, b, empty] = await Promise.all([outbox.claim(), outbox.claim(), outbox.claim()]);
  const rows = [a, b, empty].filter((row) => row !== null);
  expect(rows).toHaveLength(2); expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  expect(new Set(rows.map((r) => r.providerIdempotencyKey)).size).toBe(2);
  for (const row of rows) expect((await outbox.begin(row.id, row.fence, "a".repeat(64)))?.providerRequestStartedAt).not.toBeNull();
  expect((await outbox.finish(rows[0].id, rows[0].fence, { kind: "sent", providerMessageId: "mock-provider-accepted" }))?.state).toBe("sent");
  expect((await outbox.finish(rows[1].id, rows[1].fence, { kind: "retry", code: "PROVIDER_RATE_LIMITED" }))?.state).toBe("retry_wait");
  sql(`update public.email_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id='${rows[1].id}';`);
  const retry = (await outbox.claim())!;
  expect(retry.id).toBe(rows[1].id); expect(retry.fence).toBe("2");
  expect(retry.providerIdempotencyKey).toBe(rows[1].providerIdempotencyKey);
  expect(await outbox.finish(retry.id, "1", { kind: "sent", providerMessageId: "stale" })).toBeNull();
  expect(sql(`select count(*) from public.email_deliveries where publication_attempt_id='${target.id}' and state='sent';`)).toBe("1");
});

it.each(["void", "revoked", "expired"])("does not begin initial provider I/O after invoice %s", async (mode) => {
  const { outbox, target, publication, actor } = await fixture();
  const work = (await outbox.claim())!;
  if (mode === "void") await publication.voidInvoice(actor, { invoiceId: target.invoiceId, expectedVersion: 1, approval: true, idempotencyKey: randomUUID(), requestFingerprint: "b".repeat(64) });
  if (mode === "revoked") sql(`update public.access_links set revoked_at=clock_timestamp() where token_id='${target.link.tokenId}';`);
  if (mode === "expired") {
    // Test the authoritative deadline predicate without mutating frozen invoice identity.
    expect(sql(`select public.payr_invoice_email_sendable_v1('${target.id}','${target.snapshot.payableUntil}');`)).toBe("f");
    return;
  }
  expect((await outbox.begin(work.id, work.fence, "a".repeat(64)))?.state).toBe("manual_review");
  expect(sql(`select first_provider_attempt_at is null from public.email_deliveries where id='${work.id}';`)).toBe("t");
});

it("recovers a crashed provider marker with the same key, rejecting changed payloads", async () => {
  const { outbox } = await fixture(); const work = (await outbox.claim())!;
  await outbox.begin(work.id, work.fence, "a".repeat(64));
  sql(`update public.email_deliveries set lease_until=clock_timestamp()-interval '1 second' where id='${work.id}';`);
  const retry = (await outbox.claim(work.id))!;
  expect(retry.ambiguousSince).not.toBeNull(); expect(retry.providerIdempotencyKey).toBe(work.providerIdempotencyKey);
  expect((await outbox.begin(retry.id, retry.fence, "b".repeat(64)))?.state).toBe("manual_review");
  expect(sql(`select provider_payload_hash from public.email_deliveries where id='${work.id}';`)).toBe("a".repeat(64));
});

it("denies direct table and internal RPC access outside the service contracts", async () => {
  await fixture();
  expect(sql(`select has_table_privilege('service_role','public.invoice_email_approvals','insert'),
    has_function_privilege('anon','public.payr_reserve_publication_v2(uuid,text,uuid,jsonb)','execute'),
    has_function_privilege('authenticated','public.payr_claim_invoice_delivery_v1(uuid,uuid)','execute'),
    has_function_privilege('service_role','public.payr_invoice_email_sendable_v1(uuid,timestamptz)','execute');`)).toBe("f|f|f|f");
  expect(sql(`select has_function_privilege('service_role','public.payr_pin_publication_origin_v1(jsonb)','execute');`)).toBe("f");
  for (const signature of ["payr_find_publication_replay_v2(uuid,text,uuid,text,text)", "payr_claim_publication_v2(uuid,uuid)", "payr_read_invoice_document_v2(uuid)"]) {
    expect(sql(`select has_function_privilege('anon','public.${signature}','execute'),
      has_function_privilege('authenticated','public.${signature}','execute'),
      has_function_privilege('service_role','public.${signature}','execute');`)).toBe("f|f|t");
  }
});

it("enqueues once across concurrent finalization and keeps recipients/config immutable", async () => {
  const { target, publication, fence, actor } = await fixture(false, false);
  const results = await Promise.all([publication.finalize(fence), publication.finalize(fence)]);
  expect(results.filter((r) => r?.state === "finalized").length).toBeGreaterThanOrEqual(1);
  expect(sql(`select count(*) from public.email_deliveries where publication_attempt_id='${target.id}';`)).toBe("2");
  sql(`update public.sender_profiles set contact_email='changed@example.test' where workspace_id='${actor.workspaceId}';`);
  expect(sql(`select string_agg(normalized_recipient,',' order by normalized_recipient) from public.email_deliveries where publication_attempt_id='${target.id}';`))
    .toBe("client@example.test,owner@example.test");
  expect(() => sql(`update public.invoice_email_approvals set config=config||'{"from":"changed@example.test"}' where publication_attempt_id='${target.id}';`)).toThrow();
  expect(() => sql(`update public.email_deliveries set normalized_recipient='changed@example.test' where publication_attempt_id='${target.id}';`)).toThrow();
});

it.each(["claim", "begin"])("stops invoice ambiguity outside the original 24-hour window at %s", async (stage) => {
  const { outbox } = await fixture(); const work = (await outbox.claim())!;
  await outbox.begin(work.id, work.fence, "a".repeat(64));
  sql(`begin; set local session_replication_role=replica; update public.email_deliveries set created_at=clock_timestamp()-interval '2 days',
    first_provider_attempt_at=clock_timestamp()-interval '${stage === "claim" ? "24 hours" : "23 hours"}',
    lease_until=clock_timestamp()-interval '1 second' where id='${work.id}'; commit;`);
  const retry = (await outbox.claim(work.id))!;
  if (stage === "claim") expect(retry.state).toBe("manual_review");
  else {
    expect(retry.state).toBe("sending");
    sql(`begin; set local session_replication_role=replica; update public.email_deliveries set first_provider_attempt_at=clock_timestamp()-interval '24 hours' where id='${work.id}'; commit;`);
    expect((await outbox.begin(retry.id, retry.fence, "a".repeat(64)))?.state).toBe("manual_review");
  }
});

it("moves invalidated ambiguous work to review and labels activity invoice-only", async () => {
  const { outbox, target, actor } = await fixture(); const work = (await outbox.claim())!;
  await outbox.begin(work.id, work.fence, "a".repeat(64));
  sql(`update public.email_deliveries set lease_until=clock_timestamp()-interval '1 second' where id='${work.id}';
    update public.access_links set revoked_at=clock_timestamp() where token_id='${target.link.tokenId}';`);
  expect((await outbox.claim(work.id))?.state).toBe("manual_review");
  expect(sql(`select action||':'||outcome from public.audit_events where workspace_id='${actor.workspaceId}' and action='invoice.deliver';`))
    .toBe("invoice.deliver:manual_review");
  expect(sql(`select count(*) from public.audit_events where workspace_id='${actor.workspaceId}' and action='receipt.deliver';`)).toBe("0");
});
