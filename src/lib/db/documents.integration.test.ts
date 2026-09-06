import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import type { PublicationAttempt } from "../invoices/publication-contracts";
import { createDraftRepository } from "./drafts";
import { createDocumentRepository } from "./documents";
import { createPublicationRepository } from "./publication";

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const documents = createDocumentRepository(service), publication = createPublicationRepository(service);
const workspaceId = "00000000-0000-4000-8000-000000000010";
const ownerWallet = `0x${"2".repeat(40)}`;
const actor = { workspaceId, ownerWallet, connectorId: null };
const hash = () => `0x${randomBytes(32).toString("hex")}` as const;
const fence = (a: PublicationAttempt) => ({ attemptId: a.id, leaseOwner: a.leaseOwner!, fence: a.fence });

function fixture(sql: string) {
  const db = new URL(process.env.SUPABASE_DB_URL!);
  if (process.env.SUPABASE_URL !== "http://127.0.0.1:57321" || db.protocol !== "postgresql:"
    || db.hostname !== "127.0.0.1" || db.port !== "58322" || db.username !== "postgres" || db.pathname !== "/postgres") {
    throw new Error("Local Payr fixtures only");
  }
  return execFileSync("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

async function reserve() {
  const snapshot = testPublicationSnapshot();
  const draft = await createDraftRepository(service).saveDraft(actor, { draftId: null, expectedVersion: null, snapshot,
    idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex") });
  return publication.reserve(actor, { draftId: draft.draftId, expectedVersion: 1, approval: true,
    idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex"), attemptId: randomUUID(),
    invoiceKey: hash(), publicationSalt: hash(), tokenId: randomUUID(), keyVersion: 1,
    verifierHash: randomBytes(32).toString("hex"), chainId: 5042002, contractAddress: `0x${"3".repeat(40)}` });
}

async function finalize(a: PublicationAttempt) {
  const claimed = (await publication.claim(a.id, randomUUID()))!;
  const stored = (await publication.store({ ...fence(claimed), artifact: { pdfFilename: `${a.invoiceNumber}.pdf`,
    contentType: "application/pdf", byteLength: 123, invoiceDataHash: hash(), pdfContentHash: hash(),
    documentCommitment: hash(), qrVerified: true } }))!;
  return (await publication.finalize(fence(stored)))!;
}

async function settle(a: PublicationAttempt) {
  const receiptToken = randomUUID();
  const result = await service.rpc("payr_record_settlement_v1", { p_workspace_id: workspaceId, p_chain_id: a.chainId,
    p_contract_address: a.contractAddress, p_invoice_key: a.invoiceKey, p_transaction_hash: hash(), p_log_index: 0,
    p_block_number: "9007199254740993", p_block_time: new Date().toISOString(), p_document_commitment: a.artifact!.documentCommitment,
    p_payer: `0x${"4".repeat(40)}`, p_payee: a.snapshot.sender.payoutWallet, p_amount_atomic: a.snapshot.amountAtomic,
    p_receipt_token_id: receiptToken, p_receipt_key_version: 1, p_receipt_verifier_hash: randomBytes(32).toString("hex"),
    p_receipt_expires_at: "2032-01-01T00:00:00.000Z", p_deliveries: [
      { messageKind: "receipt", normalizedRecipient: "client@example.test", roles: ["client"] },
      { messageKind: "receipt", normalizedRecipient: "owner@example.test", roles: ["issuer"] },
    ] });
  expect(result.error).toBeNull();
  return receiptToken;
}

beforeEach(() => {
  const s = testPublicationSnapshot();
  fixture(`truncate public.workspaces cascade;
    insert into public.workspaces (id,owner_wallet) values ('${workspaceId}','${ownerWallet}');
    insert into public.sender_profiles (id,workspace_id,business_name,billing_address,contact_name,contact_email,payout_wallet,invoice_prefix,default_terms)
      values ('${s.sender.id}','${workspaceId}','Test & Studio','${JSON.stringify(s.sender.billingAddress)}','Owner','owner@example.test','${ownerWallet}','INV','30');
    insert into public.clients (id,workspace_id,alias,business_name,billing_address,contact_name,contact_email)
      values ('${s.clientReference.id}','${workspaceId}','client','Test Client','${JSON.stringify(s.client.billingAddress)}','Client','client@example.test');`);
});

it("exposes candidate metadata only and reads the exact finalized live invoice without an owner actor", async () => {
  const a = await reserve();
  expect(await documents.findCandidate(a.link.tokenId)).toEqual({ ...a.link, purpose: "invoice-bearer", workspaceId,
    invoiceId: a.invoiceId, invoiceVersionId: a.invoiceVersionId });
  expect(await documents.storageState(a.storageKey)).toBe("reserved");
  expect(await documents.readTarget(a.link.tokenId)).toBeNull();
  const finalized = await finalize(a);
  expect(await documents.storageState(a.storageKey)).toBe("finalized");
  expect(await documents.readTarget(a.link.tokenId)).toEqual(await publication.statusData(actor, a.invoiceId));
  expect((await documents.readTarget(a.link.tokenId))!.attempt).toEqual(finalized);
  expect(await documents.findCandidate(randomUUID())).toBeNull();
  expect(await documents.readTarget(randomUUID())).toBeNull();
});

it("atomically caps fixed-minute IP, token and global IP-stage admission without retaining attacker keys after denial", async () => {
  const second = Number(fixture("select extract(second from clock_timestamp())::float;"));
  if (second > 50) await new Promise((resolve) => setTimeout(resolve, (61 - second) * 1000));
  fixture("truncate public.document_access_rate_limits;");
  const ip = "a".repeat(64), token = "b".repeat(64);
  const tokenResults = await Promise.all(Array.from({ length: 75 }, () => documents.admit("token", token)));
  expect(tokenResults.filter((r) => r.allowed)).toHaveLength(60);
  const ipResults = await Promise.all(Array.from({ length: 130 }, () => documents.admit("ip", ip)));
  expect(ipResults.filter((r) => r.allowed)).toHaveLength(120);
  const globalResults = [];
  for (let batch = 0; batch < 24; batch++) {
    globalResults.push(...await Promise.all(Array.from({ length: 20 }, () => documents.admit("ip", randomBytes(32).toString("hex")))));
  }
  expect(globalResults.filter((r) => r.allowed)).toHaveLength(470);
  const before = fixture("select count(*) from public.document_access_rate_limits;");
  expect(await documents.admit("ip", "c".repeat(64))).toEqual({ allowed: false });
  expect(fixture("select count(*) from public.document_access_rate_limits;")).toBe(before);
  fixture("update public.document_access_rate_limits set window_start = window_start - interval '2 minutes';");
  expect(await documents.admit("ip", ip)).toEqual({ allowed: true });
  expect(await documents.admit("token", token)).toEqual({ allowed: true });
}, 30000);

it("keeps recovery storage state pinned to the reserved attempt key through stale fences and finalization", async () => {
  const a = await reserve();
  const old = (await publication.claim(a.id, randomUUID()))!;
  expect(await documents.storageState(a.storageKey)).toBe("rendering");
  expect(await documents.readTarget(a.link.tokenId)).toBeNull();
  fixture(`update public.publication_attempts set lease_until = clock_timestamp() - interval '1 second' where id = '${a.id}';`);
  const next = (await publication.claim(a.id, randomUUID()))!;
  expect(next.storageKey).toBe(a.storageKey); expect(next.fence).toBe("2");
  const artifact = { pdfFilename: `${a.invoiceNumber}.pdf`, contentType: "application/pdf" as const, byteLength: 512,
    invoiceDataHash: hash(), pdfContentHash: hash(), documentCommitment: hash(), qrVerified: true as const };
  expect(await publication.store({ ...fence(old), artifact })).toBeNull();
  const stored = (await publication.store({ ...fence(next), artifact }))!;
  expect(await documents.storageState(a.storageKey)).toBe("stored");
  expect(await documents.readTarget(a.link.tokenId)).toBeNull();
  expect(await publication.finalize(fence(old))).toBeNull();
  const finalized = (await publication.finalize(fence(stored)))!;
  expect((await documents.readTarget(a.link.tokenId))!.attempt.artifact).toEqual(artifact);
  expect(finalized.storageKey).toBe(a.storageKey);
  expect(await documents.storageState(a.storageKey.replace("/1/", "/2/"))).toBeNull();
  expect(await documents.storageState(a.storageKey.replace(a.id, randomUUID()))).toBeNull();
  const failed = await reserve(), claimed = (await publication.claim(failed.id, randomUUID()))!;
  await publication.fail({ ...fence(claimed), failureCode: "ARTIFACT_VERIFICATION_FAILED" });
  expect(await documents.storageState(failed.storageKey)).toBe("failed");
  expect(await documents.readTarget(failed.link.tokenId)).toBeNull();
});

it.each(["inactive", "future-activation", "revoked", "key-version", "verifier", "expiry-metadata", "wrong-version"])(
  "denies an exact target with %s link facts even when candidate metadata exists", async (kind) => {
    const a = await finalize(await reserve());
    let change = "";
    if (kind === "inactive") change = "activated_at = null";
    if (kind === "future-activation") change = "activated_at = clock_timestamp() + interval '1 day'";
    if (kind === "revoked") change = "revoked_at = clock_timestamp()";
    if (kind === "key-version") change = "key_version = 2";
    if (kind === "verifier") change = `verifier_hash = '${"0".repeat(64)}'`;
    if (kind === "expiry-metadata") change = "expires_at = expires_at + interval '1 day'";
    if (kind === "wrong-version") { const other = await reserve(); change = `invoice_version_id = '${other.invoiceVersionId}'`; }
    fixture(`update public.access_links set ${change} where token_id = '${a.link.tokenId}';`);
    expect(await documents.findCandidate(a.link.tokenId)).not.toBeNull();
    expect(await documents.readTarget(a.link.tokenId)).toBeNull();
  },
);

it("prevents even a privileged fixture from attaching a link to another workspace's version", async () => {
  const a = await finalize(await reserve()), foreignWorkspace = randomUUID();
  fixture(`insert into public.workspaces(id,owner_wallet) values ('${foreignWorkspace}','0x${"5".repeat(40)}');`);
  expect(() => fixture(`update public.access_links set workspace_id = '${foreignWorkspace}' where token_id = '${a.link.tokenId}';`)).toThrow();
  expect(await documents.readTarget(a.link.tokenId)).not.toBeNull();
});

it("allows commercial expiry, pins payment/receipt/delivery facts, and rejects receipt credentials on invoice reads", async () => {
  const a = await finalize(await reserve());
  fixture(`update public.invoices set commercial_state = 'expired', expired_at = payable_until where id = '${a.invoiceId}';`);
  expect(await documents.readTarget(a.link.tokenId)).toMatchObject({ commercialState: "expired", settlement: null, receipt: null, deliveries: [] });
  const receiptToken = await settle(a);
  const target = (await documents.readTarget(a.link.tokenId))!;
  expect(target).toEqual(await publication.statusData(actor, a.invoiceId));
  expect(target.settlement).toMatchObject({ blockNumber: "9007199254740993", documentCommitment: a.artifact!.documentCommitment });
  expect(target.receipt).toMatchObject({ state: "pending", link: { tokenId: receiptToken }, artifact: null });
  expect(target.deliveries).toHaveLength(2);
  expect(await documents.findCandidate(receiptToken)).toMatchObject({ purpose: "receipt-bearer", workspaceId, invoiceId: a.invoiceId, invoiceVersionId: a.invoiceVersionId });
  expect(await documents.readTarget(receiptToken)).toBeNull();
  fixture(`update public.receipt_documents set state = 'ready',storage_key = 'receipt.pdf',byte_length = 123,
    content_type = 'application/pdf',content_hash = '${a.artifact!.pdfContentHash}',pdf_filename = 'receipt.pdf',ready_at = clock_timestamp()
    where token_id = '${receiptToken}';
    update public.email_deliveries set state = 'sent',provider_message_id = 'local-test-message',attempt_count = 1;`);
  const ready = await documents.readTarget(a.link.tokenId);
  expect(ready).toEqual(await publication.statusData(actor, a.invoiceId));
  expect(ready).toMatchObject({ receipt: { state: "ready", artifact: { pdfFilename: "receipt.pdf" } },
    deliveries: [{ state: "sent" }, { state: "sent" }] });
});

it("never revives a void-revoked invoice bearer when late verified settlement derives Paid", async () => {
  const a = await finalize(await reserve());
  await publication.voidInvoice(actor, { invoiceId: a.invoiceId, expectedVersion: 1, approval: true,
    idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex") });
  expect(await documents.readTarget(a.link.tokenId)).toBeNull();
  await settle(a);
  expect(await publication.statusData(actor, a.invoiceId)).toMatchObject({ commercialState: "voided", settlement: { invoiceVersion: 1 } });
  expect(await documents.readTarget(a.link.tokenId)).toBeNull();
  expect((await documents.findCandidate(a.link.tokenId))!.revokedAt).not.toBeNull();
});

it("keeps the first-settlement target internally consistent during concurrent document reads", async () => {
  const a = await finalize(await reserve());
  const reads = Array.from({ length: 30 }, () => documents.readTarget(a.link.tokenId));
  const payment = settle(a);
  for (const target of await Promise.all(reads)) {
    expect(target).not.toBeNull();
    if (target!.settlement === null) expect(target).toMatchObject({ receipt: null, deliveries: [] });
    else { expect(target!.receipt).toMatchObject({ state: "pending" }); expect(target!.deliveries).toHaveLength(2); }
  }
  await payment;
});

it("denies unreserved credentials for an otherwise exact finalized version", async () => {
  const a = await finalize(await reserve()), token = randomUUID();
  fixture(`insert into public.access_links (id,workspace_id,token_id,purpose,key_version,verifier_hash,invoice_version_id,activated_at,expires_at)
    values ('${randomUUID()}','${workspaceId}','${token}','invoice-bearer',${a.link.keyVersion},'${a.link.verifierHash}',
      '${a.invoiceVersionId}',clock_timestamp(),'${a.link.expiresAt}');`);
  expect(await documents.findCandidate(token)).not.toBeNull();
  expect(await documents.readTarget(token)).toBeNull();
});

it("rechecks credential expiry after waiting for the invoice lock", async () => {
  const a = await finalize(await reserve());
  // Local-only historical fixture: preserve matching metadata while shortening an immutable link lifetime.
  fixture(`begin; set local session_replication_role = replica;
    update public.access_links set expires_at = clock_timestamp() + interval '2 seconds' where token_id = '${a.link.tokenId}';
    update public.publication_attempts set invoice_link_expires_at = (select expires_at from public.access_links where token_id = '${a.link.tokenId}') where id = '${a.id}'; commit;`);
  expect(await documents.readTarget(a.link.tokenId)).not.toBeNull();
  const child = spawn("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
  const ready = new Promise<void>((resolve) => child.stdout.on("data", (data) => { if (String(data).includes("locked")) resolve(); }));
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", () => reject(new Error("Local lock fixture failed")));
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error("Local lock fixture failed")));
  });
  child.stderr.resume();
  child.stdin.end(`begin; set local statement_timeout = '5s'; select 1 from public.invoices where id = '${a.invoiceId}' for update;
    select 'locked'; select pg_sleep(2.2); commit;`);
  await Promise.race([ready, finished]);
  expect(await documents.readTarget(a.link.tokenId)).toBeNull();
  await finished;
});

it("keeps all four functions service-only SECURITY DEFINER with empty search paths and the counter table RLS/RPC-only", async () => {
  const names = ["payr_find_invoice_access_candidate_v1", "payr_read_invoice_document_v1", "payr_document_storage_state_v1", "payr_admit_document_access_v1"];
  expect(fixture(`select count(*) = 4 and bool_and(p.prosecdef and p.proconfig = array['search_path=""']
    and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute')
    and has_function_privilege('service_role',p.oid,'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (${names.map((name) => `'${name}'`).join(",")});`)).toBe("t");
  expect(fixture("select relrowsecurity from pg_class where oid = 'public.document_access_rate_limits'::regclass;")).toBe("t");
  for (const role of ["anon", "authenticated", "service_role"]) {
    expect(fixture(`select has_table_privilege('${role}','public.document_access_rate_limits','SELECT,INSERT,UPDATE,DELETE');`)).toBe("f");
    expect(fixture(`select has_function_privilege('${role}','public.payr_document_object_immutable_v1()','execute');`)).toBe("f");
  }
  for (const role of ["anon", "authenticated"]) {
    for (const call of [`payr_find_invoice_access_candidate_v1('${randomUUID()}')`, `payr_read_invoice_document_v1('${randomUUID()}')`,
      "payr_document_storage_state_v1('path')", `payr_admit_document_access_v1('ip','${"a".repeat(64)}')`]) {
      expect(() => fixture(`begin; set local role ${role}; select public.${call}; rollback;`)).toThrow();
    }
  }
});

it.each([[null, "a".repeat(64)], ["global", "a".repeat(64)], ["ip", "127.0.0.1"], ["token", "A".repeat(64)], ["ip", null]])(
  "rejects invalid SQL admission input %j without persisting raw identifiers", async (p_scope, p_key_hash) => {
    fixture("truncate public.document_access_rate_limits;");
    const result = await service.rpc("payr_admit_document_access_v1", { p_scope, p_key_hash });
    expect(result.error).toMatchObject({ code: "22023", message: "INVALID_INPUT" }); expect(result.data).toBeNull();
    expect(fixture("select count(*) from public.document_access_rate_limits;")).toBe("0");
  },
);

it("bounds expired counter cleanup to sixteen rows per admitted request", async () => {
  fixture(`truncate public.document_access_rate_limits;
    insert into public.document_access_rate_limits(scope,key_hash,window_start,request_count)
    select 'ip',encode(sha256(convert_to(n::text,'UTF8')),'hex'),date_trunc('minute',clock_timestamp()) - interval '2 minutes',1 from generate_series(1,50) n;`);
  expect(await documents.admit("ip", "a".repeat(64))).toEqual({ allowed: true });
  expect(fixture("select count(*) from public.document_access_rate_limits where window_start < date_trunc('minute',clock_timestamp());")).toBe("34");
});
