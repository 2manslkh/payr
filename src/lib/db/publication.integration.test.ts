import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { DraftSnapshot, InvoiceActor } from "../invoices/contracts";
import type { PublicationArtifact, PublicationAttempt, PublicationReservation } from "../invoices/publication-contracts";
import { createInvoiceLifecycleService } from "../invoices/lifecycle";
import { createPublicationService } from "../invoices/publication";
import { createTestDocumentPort, testPublicationSnapshot } from "../invoices/publication.test-support";
import { createDraftRepository } from "./drafts";
import { createIdentityRepository } from "./identity";
import { createPublicationRepository } from "./publication";

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const repository = createPublicationRepository(service);
const drafts = createDraftRepository(service);
const workspaceId = "00000000-0000-4000-8000-000000000010";
const owner = `0x${"2".repeat(40)}`;
const actor: InvoiceActor = { workspaceId, ownerWallet: owner, connectorId: null };
const scope = { p_workspace_id: workspaceId, p_owner_wallet: owner, p_connector_id: null };
const hash = () => `0x${randomBytes(32).toString("hex")}` as const;
const artifact: PublicationArtifact = { pdfFilename: "INV-2026-000001.pdf", contentType: "application/pdf", byteLength: 512,
  invoiceDataHash: hash(), pdfContentHash: hash(), documentCommitment: hash(), qrVerified: true };
const fence = (a: PublicationAttempt) => ({ attemptId: a.id, leaseOwner: a.leaseOwner!, fence: a.fence });

function fixture(sql: string): string {
  const database = new URL(process.env.SUPABASE_DB_URL!);
  if (process.env.SUPABASE_URL !== "http://127.0.0.1:57321" || database.protocol !== "postgresql:"
    || database.hostname !== "127.0.0.1" || database.port !== "58322"
    || database.username !== "postgres" || database.pathname !== "/postgres") throw new Error("Local Payr fixtures only");
  return execFileSync("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
async function reservation(snapshot = testPublicationSnapshot()): Promise<PublicationReservation> {
  const draft = await drafts.saveDraft(actor, { draftId: null, expectedVersion: null, snapshot,
    idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex") });
  return { draftId: draft.draftId, expectedVersion: 1, approval: true, idempotencyKey: randomUUID(),
    requestFingerprint: randomBytes(32).toString("hex"), attemptId: randomUUID(), invoiceKey: hash(), publicationSalt: hash(),
    tokenId: randomUUID(), keyVersion: 1, verifierHash: randomBytes(32).toString("hex"), chainId: 5042002,
    contractAddress: `0x${"3".repeat(40)}` };
}
async function stored(snapshot = testPublicationSnapshot()) {
  const input = await reservation(snapshot);
  const reserved = await repository.reserve(actor, input);
  const claimed = (await repository.claim(reserved.id, randomUUID()))!;
  const result = (await repository.store({ ...fence(claimed), artifact }))!;
  return { input, reserved, claimed, result };
}
function expireLease(id: string) {
  fixture(`update public.publication_attempts set lease_until = clock_timestamp() - interval '1 second' where id = '${id}';`);
}
function expectFixtureFailure(sql: string, marker: string) {
  try { fixture(sql); } catch (error) { expect(String((error as { stderr: unknown }).stderr)).toContain(marker); return; }
  throw new Error(`Expected fixture failure: ${marker}`);
}
async function transaction<T>(sql: string, operation: (pid: number, commit: (sql?: string) => Promise<void>) => Promise<T>): Promise<T> {
  fixture("select 1;");
  const child = spawn("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += String(data); });
  const ready = new Promise<number>((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (data) => { stdout += String(data); const match = stdout.match(/fixture-pid:(\d+)/); if (match) resolve(Number(match[1])); });
    child.on("error", reject); child.on("close", () => reject(new Error(stderr || "Fixture closed")));
  });
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
  void finished.catch(() => {});
  child.stdin.write(`begin; set local statement_timeout = '8s'; set local idle_in_transaction_session_timeout = '10s';
    ${sql}; select 'fixture-pid:' || pg_backend_pid();\n`);
  try { return await operation(await ready, (continuation = "select 1") => { child.stdin.end(`${continuation}; commit;`); return finished; }); }
  finally { if (!child.stdin.writableEnded) child.stdin.end("rollback;"); await finished; }
}
async function waitForWaiter(pid: number) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (fixture(`select exists (select 1 from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid)));`) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("RPC did not reach the fixture lock");
}

describe("F3 publication RPC transactions", () => {
  beforeEach(() => {
    const s = testPublicationSnapshot();
    fixture(`truncate public.workspaces cascade;
      insert into public.workspaces (id,owner_wallet) values ('${workspaceId}','${owner}');
      insert into public.sender_profiles (id,workspace_id,business_name,billing_address,contact_name,contact_email,payout_wallet,invoice_prefix,default_terms)
        values ('${s.sender.id}','${workspaceId}','Test & Studio','${JSON.stringify(s.sender.billingAddress)}','Owner','owner@example.test','${owner}','INV','30');
      insert into public.clients (id,workspace_id,alias,business_name,billing_address,contact_name,contact_email)
        values ('${s.clientReference.id}','${workspaceId}','client','Test Client','${JSON.stringify(s.client.billingAddress)}','Client','client@example.test');`);
  });

  it("reserves an inactive deterministic number, claims, stores and atomically finalizes", async () => {
    const input = await reservation();
    const raw = await service.rpc("payr_reserve_publication_v1", { ...scope, p_input: input });
    expect(raw.error).toBeNull();
    const reserved = await repository.reserve(actor, input);
    expect(reserved).toEqual(raw.data);
    expect(reserved).toMatchObject({ state: "reserved", fence: "0", leaseOwner: null, artifact: null, failureCode: null,
      invoiceNumber: `INV-${new Date().getUTCFullYear()}-000001`, link: { activatedAt: null, revokedAt: null } });
    expect(reserved.storageKey).toBe(`workspace/${workspaceId}/invoice/${input.draftId}/1/attempt/${input.attemptId}.pdf`);
    expect(Date.parse(reserved.link.expiresAt)).toBe(Date.parse(reserved.snapshot.payableUntil) + 365 * 86400000);
    expect(fixture("select invoice_number is null and published_at is null from public.invoices;")).toBe("t");
    const claimed = (await repository.claim(reserved.id, randomUUID()))!;
    expect(claimed).toMatchObject({ state: "rendering", fence: "1" });
    expect(Date.parse(claimed.leaseUntil!) - Date.now()).toBeGreaterThan(58000);
    expect(await repository.claim(reserved.id, randomUUID())).toBeNull();
    const saved = (await repository.store({ ...fence(claimed), artifact }))!;
    expect(saved).toMatchObject({ state: "stored", artifact });
    const finalized = await repository.finalize(fence(saved));
    expect(finalized).toMatchObject({ state: "finalized", artifact });
    expect(finalized!.link.activatedAt).not.toBeNull();
    expect(await repository.statusData(actor, input.draftId)).toMatchObject({ invoiceId: input.draftId, commercialState: "published",
      attempt: finalized, settlement: null, receipt: null, deliveries: [] });
    expect(fixture("select chain_id = 5042002 and frozen_at is not null from public.invoice_versions;")).toBe("t");
    expect(fixture("select bool_and(public.payr_is_safe_result_descriptor(result_descriptor)) from public.idempotency_requests;")).toBe("t");
  });

  it("publishes through the integrated worker and lifecycle without holding SQL locks across document I/O", async () => {
    const input = await reservation();
    const config = { appOrigin: "https://payr.example.test", explorerOrigin: "https://explorer.example.test", activeKeyVersion: 1,
      keys: new Map([[1, new Uint8Array(32).fill(1)], [2, new Uint8Array(32).fill(2)]]), chainId: input.chainId, contractAddress: input.contractAddress };
    const documents = createTestDocumentPort();
    const publisher = createPublicationService(repository, config, { async createOrRead(value) {
      fixture(`begin; set local lock_timeout = '500ms'; select 1 from public.invoices where id = '${input.draftId}' for update; rollback;`);
      return documents.createOrRead(value);
    } });
    const approved = { draftId: input.draftId, expectedVersion: 1, approval: true as const, idempotencyKey: input.idempotencyKey };
    const published = await publisher.publish(actor, approved);
    expect(published).toMatchObject({ invoiceId: input.draftId, invoiceVersion: 1, commercialState: "published", sendApprovalRequired: true,
      gmailLinkPackage: { to: ["client@example.test"], paymentUrl: published.invoiceUrl, invoicePdfUrl: published.invoicePdfUrl } });
    const lifecycle = createInvoiceLifecycleService(repository, config);
    expect(await lifecycle.status(actor, input.draftId)).toMatchObject({ displayStatus: "Published", paymentStatus: "unpaid",
      invoiceDocument: { state: "ready", pageUrl: published.invoiceUrl, pdfUrl: published.invoicePdfUrl } });
    expect(await lifecycle.share(actor, input.draftId)).toEqual({ invoiceUrl: published.invoiceUrl, invoicePdfUrl: published.invoicePdfUrl, pdfFilename: published.pdfFilename });
    const rotated = createPublicationService(repository, { ...config, activeKeyVersion: 2, chainId: 1, contractAddress: `0x${"4".repeat(40)}` }, {
      async createOrRead() { throw new Error("Finalized replays must not render again"); },
    });
    expect(await rotated.publish(actor, approved)).toEqual(published);
    expect((await repository.statusData(actor, input.draftId))!.attempt).toMatchObject({ chainId: input.chainId, contractAddress: input.contractAddress, link: { keyVersion: 1 } });
    await lifecycle.void(actor, { invoiceId: input.draftId, expectedVersion: 1, approval: true, idempotencyKey: randomUUID() });
    expect(await rotated.publish(actor, approved)).toMatchObject({ commercialState: "voided", invoiceUrl: published.invoiceUrl, pdfContentHash: published.pdfContentHash });
    await expect(lifecycle.share(actor, input.draftId)).rejects.toMatchObject({ code: "LINK_UNAVAILABLE" });
    expect(fixture("select next_value::text from public.invoice_sequences;")).toBe("2");
  });

  it("serializes same-key reservations and competing claims, and preserves original metadata on replay", async () => {
    const input = await reservation();
    const attempts = await Promise.all(Array.from({ length: 8 }, () => repository.reserve(actor, { ...input, attemptId: randomUUID(),
      tokenId: randomUUID(), invoiceKey: hash(), publicationSalt: hash() })));
    expect(new Set(attempts.map((a) => a.id)).size).toBe(1);
    const a = attempts[0];
    expect(await repository.reserve(actor, { ...input, chainId: 1, contractAddress: `0x${"4".repeat(40)}`, keyVersion: 9 })).toEqual(a);
    expect(fixture("select next_value::text from public.invoice_sequences;")).toBe("2");
    const claims = await Promise.all(Array.from({ length: 8 }, () => repository.claim(a.id, randomUUID())));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({ fence: "1" });
    await expect(repository.reserve(actor, { ...input, requestFingerprint: "0".repeat(64) })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(repository.reserve(actor, { ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "PUBLICATION_IN_PROGRESS" });
  });

  it("rejects mismatched replay targets even if a privileged caller reuses the fingerprint", async () => {
    const { input, claimed } = await stored();
    const other = await reservation();
    expect((await service.rpc("payr_reserve_publication_v1", { ...scope, p_input: { ...input, draftId: other.draftId } })).error)
      .toMatchObject({ message: "IDEMPOTENCY_CONFLICT" });
    expect((await service.rpc("payr_reserve_publication_v1", { ...scope, p_input: { ...input, expectedVersion: 2 } })).error)
      .toMatchObject({ message: "IDEMPOTENCY_CONFLICT" });
    const a = (await repository.finalize(fence(claimed)))!;
    const write = voidInput(a);
    await repository.voidInvoice(actor, write);
    expect((await service.rpc("payr_void_invoice_v1", { ...scope, p_input: { ...write, invoiceId: other.draftId } })).error)
      .toMatchObject({ message: "IDEMPOTENCY_CONFLICT" });
    expect((await service.rpc("payr_void_invoice_v1", { ...scope, p_input: { ...write, expectedVersion: 2 } })).error)
      .toMatchObject({ message: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps replay attempt/link facts consistent across concurrent finalization", async () => {
    const { input, claimed } = await stored();
    const replays = Array.from({ length: 30 }, () => repository.reserve(actor, input));
    const finalized = repository.finalize(fence(claimed));
    for (const replay of await Promise.all(replays)) {
      if (replay.state === "stored") expect(replay.link.activatedAt).toBeNull();
      else { expect(replay.state).toBe("finalized"); expect(replay.link.activatedAt).not.toBeNull(); }
    }
    expect(await finalized).toMatchObject({ state: "finalized" });
  });

  it("burns failed numbers permanently and permits only a new key after terminal failure", async () => {
    const { input, claimed } = await stored();
    const failed = await repository.fail({ ...fence(claimed), failureCode: "ARTIFACT_VERIFICATION_FAILED" });
    expect(failed).toMatchObject({ state: "failed", failureCode: "ARTIFACT_VERIFICATION_FAILED", link: { activatedAt: null } });
    expect(failed!.link.revokedAt).not.toBeNull();
    expect(await repository.reserve(actor, input)).toEqual(failed);
    expect(await repository.claim(failed!.id, randomUUID())).toBeNull();
    const next = await repository.reserve(actor, { ...input, idempotencyKey: randomUUID(), attemptId: randomUUID(), invoiceKey: hash(), tokenId: randomUUID() });
    expect(next.invoiceNumber).toBe(`INV-${new Date().getUTCFullYear()}-000002`);
    expectFixtureFailure(`delete from public.publication_attempts where id = '${failed!.id}';`, "PUBLICATION_IMMUTABLE");
    expectFixtureFailure(`update public.publication_attempts set terminal_failure_code = 'PROFILE_CONFLICT' where id = '${failed!.id}';`, "PUBLICATION_IMMUTABLE");
  });

  it("reclaims rendering and stored attempts with exact text fences and immutable artifact facts", async () => {
    const input = await reservation();
    const reserved = await repository.reserve(actor, input);
    const first = (await repository.claim(reserved.id, randomUUID()))!;
    expireLease(first.id);
    const second = (await repository.claim(first.id, randomUUID()))!;
    expect(second).toMatchObject({ state: "rendering", fence: "2" });
    expect(await repository.store({ ...fence(first), artifact })).toBeNull();
    const saved = (await repository.store({ ...fence(second), artifact }))!;
    expireLease(saved.id);
    const third = (await repository.claim(saved.id, randomUUID()))!;
    expect(third).toMatchObject({ state: "stored", fence: "3", artifact });
    expect(await repository.finalize(fence(saved))).toBeNull();
    expect(await repository.fail({ ...fence(saved), failureCode: "PROFILE_CONFLICT" })).toBeNull();
    expect(await repository.store({ ...fence(third), artifact })).toEqual(third);
    await expect(repository.store({ ...fence(third), artifact: { ...artifact, byteLength: 513 } })).rejects.toMatchObject({ code: "PUBLICATION_ARTIFACT_CONFLICT" });
    expect(await repository.finalize(fence(third))).toMatchObject({ state: "finalized", artifact });
    expect(await repository.finalize(fence(third))).toBeNull();
    await expect(repository.reserve(actor, { ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "DRAFT_NOT_EDITABLE" });
  });

  it.each(["9007199254740993", "9223372036854775806"])("claims exact high fence %s and permits terminal progress at bigint max", async (value) => {
    const id = await managedCrashFixture(testPublicationSnapshot(), value);
    const claimed = (await repository.claim(id, randomUUID()))!;
    expect(claimed.fence).toBe(String(BigInt(value) + 1n));
    await repository.store({ ...fence(claimed), artifact });
    expect(await repository.fail({ ...fence(claimed), failureCode: "ARTIFACT_VERIFICATION_FAILED" })).toMatchObject({ state: "failed", fence: claimed.fence });
  });

  it.each(["deadline", "version"])("commits terminal %s failure when recovering an already reserved managed attempt", async (kind) => {
    const snapshot = testPublicationSnapshot();
    if (kind === "deadline") {
      snapshot.issueDate = "2020-01-01"; snapshot.dueDate = "2020-01-31"; snapshot.payableUntil = "2020-03-01T00:00:00.000Z";
      snapshot.appliedDefaults[0].value = snapshot.payableUntil;
    }
    const id = await managedCrashFixture(snapshot, "1", kind === "version");
    const claimed = (await repository.claim(id, randomUUID()))!;
    await repository.store({ ...fence(claimed), artifact });
    expect(await repository.finalize(fence(claimed))).toMatchObject({ state: "failed", failureCode: kind === "deadline" ? "DEADLINE_EXPIRED" : "VERSION_CONFLICT" });
    expect(fixture(`select invoice_number is null and published_at is null from public.invoices where id = '${claimed.invoiceId}';`)).toBe("t");
    expect(fixture(`select activated_at is null and revoked_at is not null from public.access_links where token_id = '${claimed.link.tokenId}';`)).toBe("t");
  });

  it("rejects prebound drafts and terminally fails a conflicting version binding", async () => {
    const input = await reservation();
    fixture(`update public.invoice_versions set chain_id = 1 where invoice_id = '${input.draftId}';`);
    await expect(repository.reserve(actor, input)).rejects.toMatchObject({ code: "DRAFT_NOT_EDITABLE" });
    const { claimed } = await stored();
    fixture(`update public.invoice_versions set contract_address = '0x${"4".repeat(40)}' where id = '${claimed.invoiceVersionId}';`);
    expect(await repository.finalize(fence(claimed))).toMatchObject({ state: "failed", failureCode: "VERSION_CONFLICT" });
  });

  it.each([null, [], {}, { ...artifact, byteLength: 0 }, { ...artifact, byteLength: 10485761 }, { ...artifact, byteLength: "123" },
    { ...artifact, contentType: "text/plain" }, { ...artifact, qrVerified: false }, { ...artifact, decodedQrDestination: "https://secret.test" },
    { ...artifact, pdfFilename: "../secret.pdf" }, { ...artifact, pdfContentHash: null }])("rejects invalid stored proof %j without mutating state", async (p_artifact) => {
    const a = await repository.reserve(actor, await reservation());
    const claimed = (await repository.claim(a.id, randomUUID()))!;
    const r = await service.rpc("payr_store_publication_v1", { p_attempt_id: a.id, p_lease_owner: claimed.leaseOwner, p_fence: claimed.fence, p_artifact });
    expect(r.error).toMatchObject({ message: "INVALID_INPUT" });
    expect((await repository.statusData(actor, a.invoiceId))!.attempt).toMatchObject({ state: "rendering", artifact: null });
    expect((await service.rpc("payr_fail_publication_v1", { p_attempt_id: a.id, p_lease_owner: claimed.leaseOwner, p_fence: claimed.fence,
      p_failure_code: "private provider exception" })).error).toMatchObject({ message: "INVALID_INPUT" });
  });

  it.each(["store", "finalize", "fail"] as const)("returns null for stale %s after waiting on invoice locks", async (operation) => {
    const { claimed } = await stored();
    await transaction(`select 1 from public.invoices where id = '${claimed.invoiceId}' for update`, async (pid, commit) => {
      const pending = operation === "store" ? repository.store({ ...fence(claimed), artifact })
        : operation === "finalize" ? repository.finalize(fence(claimed)) : repository.fail({ ...fence(claimed), failureCode: "PROFILE_CONFLICT" });
      await waitForWaiter(pid);
      await commit(`update public.publication_attempts set lease_until = clock_timestamp() - interval '1 second' where id = '${claimed.id}'`);
      expect(await pending).toBeNull();
    });
    expect(fixture("select commercial_state from public.invoices;")).toBe("draft");
  });

  it.each(["sender_profiles", "clients", "access_links", "idempotency_requests"])("checks the live lease after a %s lock wait", async (table) => {
    const { claimed } = await stored();
    fixture(`update public.publication_attempts set lease_until = clock_timestamp() + interval '700 milliseconds' where id = '${claimed.id}';`);
    await transaction(`select 1 from public.${table} for update`, async (pid, commit) => {
      const pending = repository.finalize(fence(claimed));
      await waitForWaiter(pid);
      await new Promise((resolve) => setTimeout(resolve, 750));
      await commit();
      expect(await pending).toBeNull();
    });
    expect(fixture("select commercial_state from public.invoices;")).toBe("draft");
    expect(fixture("select state from public.publication_attempts;")).toBe("stored");
  });

  it("blocks active R04 revisions but preserves old draft replays", async () => {
    const snapshot = testPublicationSnapshot();
    const write = { draftId: null, expectedVersion: null, snapshot, idempotencyKey: randomUUID(), requestFingerprint: "d".repeat(64) };
    const draft = await drafts.saveDraft(actor, write);
    const input = { ...await reservation(), draftId: draft.draftId };
    const a = await repository.reserve(actor, input);
    expect(await drafts.saveDraft(actor, write)).toEqual(draft);
    await expect(drafts.saveDraft(actor, { ...write, draftId: draft.draftId, expectedVersion: 1, idempotencyKey: randomUUID() }))
      .rejects.toMatchObject({ code: "PUBLICATION_IN_PROGRESS", status: 409 });
    expectFixtureFailure(`update public.invoices set current_version = 2 where id = '${draft.draftId}';`, "PUBLICATION_IN_PROGRESS");
    const claimed = (await repository.claim(a.id, randomUUID()))!;
    await repository.fail({ ...fence(claimed), failureCode: "PROFILE_CONFLICT" });
    expect(await drafts.saveDraft(actor, { ...write, draftId: draft.draftId, expectedVersion: 1, idempotencyKey: randomUUID() })).toMatchObject({ version: 2 });
    expect(await repository.reserve(actor, input)).toMatchObject({ state: "failed", invoiceVersion: 1 });
  });

  it.each(["sender", "client"])("commits terminal %s CAS failure without partial writes", async (kind) => {
    const { input, claimed } = await stored();
    fixture(`update public.${kind === "sender" ? "sender_profiles" : "clients"} set revision = revision + 1;`);
    const failed = await repository.finalize(fence(claimed));
    expect(failed).toMatchObject({ state: "failed", failureCode: kind === "sender" ? "PROFILE_CONFLICT" : "CLIENT_CONFLICT" });
    expect(await repository.reserve(actor, input)).toEqual(failed);
    expect(fixture("select commercial_state = 'draft' and published_at is null and invoice_number is null from public.invoices;")).toBe("t");
    expect(fixture("select frozen_at is null and chain_id is null from public.invoice_versions;")).toBe("t");
    expect(fixture("select activated_at is null and revoked_at is not null from public.access_links;")).toBe("t");
  });

  it("applies only approved saved-client changes and keeps web provenance readable and snapshots immutable", async () => {
    const snapshot = testPublicationSnapshot();
    snapshot.client.contactEmail = "new@example.test";
    const provenance = { kind: "web_source", url: "https://example.test/contact" } as const;
    snapshot.clientProvenance.contactEmail = provenance;
    snapshot.proposedClientChanges = { kind: "update", fields: { contactEmail: { value: snapshot.client.contactEmail, provenance, confirmed: true } } };
    fixture(`update public.clients set provenance = '{"businessName":{"kind":"user_provided","confirmed":true}}';`);
    const { input, claimed } = await stored(snapshot);
    expect(await repository.finalize(fence(claimed))).toMatchObject({ state: "finalized", snapshot });
    const clients = await createIdentityRepository(service).listClients({ workspaceId, ownerWallet: owner });
    expect(clients[0]).toMatchObject({ revision: 2, alias: "client", contactEmail: "new@example.test", businessName: "Test Client", provenance: {
      businessName: { kind: "user_provided", confirmed: true }, contactEmail: { ...provenance, confirmed: true },
    } });
    expect(await drafts.getContext(actor, { draftId: input.draftId, clientId: null, clientAlias: null })).toMatchObject({
      client: clients[0], previous: { snapshot },
    });
    expect(await repository.reserve(actor, input)).toMatchObject({ state: "finalized", snapshot });
  });

  it("creates an alias-less confirmed client with an opaque invoice alias", async () => {
    const snapshot = newClientSnapshot();
    const { input, claimed } = await stored(snapshot);
    expect(await repository.finalize(fence(claimed))).toMatchObject({ state: "finalized" });
    const clients = await createIdentityRepository(service).listClients({ workspaceId, ownerWallet: owner });
    expect(clients.find((c) => c.alias === `client-${input.draftId}`)).toMatchObject({ ...snapshot.client, revision: 1,
      provenance: { contactEmail: { kind: "web_source", url: "https://example.test/contact", confirmed: true } } });
  });

  it("rolls back a newly inserted client when the initiating connector has been revoked", async () => {
    const input = await reservation(newClientSnapshot());
    const identity = createIdentityRepository(service);
    const tokenId = randomUUID();
    await identity.createConnector({ workspaceId, ownerWallet: owner }, { id: tokenId, tokenHash: "c".repeat(64), expiresAt: new Date(Date.now() + 86400000).toISOString() });
    await repository.reserve({ ...actor, ownerWallet: null, connectorId: tokenId }, input);
    const claimed = (await repository.claim(input.attemptId, randomUUID()))!;
    await repository.store({ ...fence(claimed), artifact });
    await identity.revokeConnector({ workspaceId, ownerWallet: owner }, tokenId);
    const failed = await repository.finalize(fence(claimed));
    expect(failed).toMatchObject({ state: "failed", failureCode: "AUTH_REVOKED" });
    expect(fixture("select count(*) from public.clients;")).toBe("1");
    expect(fixture("select client_id is null and published_at is null from public.invoices;")).toBe("t");
    expect(await repository.reserve(actor, input)).toEqual(failed);
  });

  it("rolls back an approved saved-client update when the initiator expires during a lock wait", async () => {
    const snapshot = testPublicationSnapshot();
    snapshot.client.contactName = "Approved Change";
    snapshot.clientProvenance.contactName = { kind: "user_provided" };
    snapshot.proposedClientChanges = { kind: "update", fields: { contactName: {
      value: "Approved Change", provenance: { kind: "user_provided" }, confirmed: true,
    } } };
    const input = await reservation(snapshot), id = randomUUID();
    fixture(`insert into public.connector_tokens (id,workspace_id,token_hash,expires_at) values ('${id}','${workspaceId}','${"c".repeat(64)}',clock_timestamp()+interval '1 day');`);
    await repository.reserve({ ...actor, ownerWallet: null, connectorId: id }, input);
    const claimed = (await repository.claim(input.attemptId, randomUUID()))!;
    await repository.store({ ...fence(claimed), artifact });
    fixture(`update public.connector_tokens set expires_at = clock_timestamp() + interval '700 milliseconds' where id = '${id}';`);
    await transaction("select 1 from public.clients for update", async (pid, commit) => {
      const pending = repository.finalize(fence(claimed));
      await waitForWaiter(pid); await new Promise((resolve) => setTimeout(resolve, 750)); await commit();
      expect(await pending).toMatchObject({ state: "failed", failureCode: "AUTH_REVOKED" });
    });
    expect(fixture("select contact_name = 'Client' and revision = 1 and provenance = '{}'::jsonb from public.clients;")).toBe("t");
  });

  it("commits alias collision failure without partial client creation", async () => {
    const snapshot = newClientSnapshot(); snapshot.clientReference.alias = "new-alias";
    const { claimed } = await stored(snapshot);
    await createIdentityRepository(service).saveClient({ workspaceId, ownerWallet: owner }, {
      ...snapshot.client, id: null, expectedRevision: null, alias: "new-alias",
    });
    expect(await repository.finalize(fence(claimed))).toMatchObject({ state: "failed", failureCode: "CLIENT_CONFLICT" });
    expect(fixture("select count(*) from public.clients;")).toBe("2");
    expect(fixture("select commercial_state from public.invoices;")).toBe("draft");
  });

  it("uses unique permanent sequences concurrently, including values above MAX_SAFE_INTEGER", async () => {
    fixture(`insert into public.invoice_sequences (workspace_id,sequence_year,next_value) values ('${workspaceId}',extract(year from now() at time zone 'UTC'),9007199254740993);`);
    const inputs = await Promise.all(Array.from({ length: 6 }, () => reservation()));
    const attempts = await Promise.all(inputs.map((input) => repository.reserve(actor, input)));
    expect(new Set(attempts.map((a) => a.invoiceNumber)).size).toBe(6);
    expect(attempts.map((a) => a.invoiceNumber).sort()[0]).toBe(`INV-${new Date().getUTCFullYear()}-9007199254740993`);
    expect(fixture("select next_value::text from public.invoice_sequences;")).toBe("9007199254740999");
  });

  it.each(["chain_id = 1", "contract_address = '0x4444444444444444444444444444444444444444'", "sequence_value = 9",
    "storage_key = 'other.pdf'", "invoice_number = 'OTHER-1'", "publication_salt = '0x" + "1".repeat(64) + "'",
    "initiating_owner_wallet = '0x4444444444444444444444444444444444444444'", "invoice_key_version = 2"])("protects immutable reservation %s", async (change) => {
    const a = await repository.reserve(actor, await reservation());
    expectFixtureFailure(`update public.publication_attempts set ${change} where id = '${a.id}';`, "PUBLICATION_IMMUTABLE");
  });

  it.each(["invoice_number", "sequence_value", "storage_key"])("defends unique reserved %s independently of RPC admission", async (column) => {
    const a = await repository.reserve(actor, await reservation());
    const overrides = { id: randomUUID(), invoice_key: hash(), invoice_token_id: randomUUID(), invoice_number: "UNIQUE", sequence_value: 9,
      storage_key: "unique.pdf", idempotency_request_id: null, chain_id: null, contract_address: null, initiating_owner_wallet: null, state: "failed", terminal_failure_code: "RENDER_FAILED" };
    Reflect.deleteProperty(overrides, column);
    expectFixtureFailure(`insert into public.publication_attempts select (jsonb_populate_record(null::public.publication_attempts,
      to_jsonb(a) || '${JSON.stringify(overrides)}'::jsonb)).* from public.publication_attempts a where id = '${a.id}';`,
    column === "storage_key" ? "publication_attempts_storage_key" : column === "sequence_value" ? "publication_attempts_reserved_sequence" : "publication_attempts_reserved_number");
  });

  it("commits a terminal failure after an uncommitted alias wins the unique-index race", async () => {
    const snapshot = newClientSnapshot(); snapshot.clientReference.alias = "racing-client";
    const { claimed } = await stored(snapshot);
    await transaction(`insert into public.clients (id,workspace_id,alias,business_name,billing_address,contact_name,contact_email)
      select gen_random_uuid(),workspace_id,'racing-client',business_name,billing_address,contact_name,contact_email from public.clients`, async (pid, commit) => {
      const pending = repository.finalize(fence(claimed));
      await waitForWaiter(pid); await commit();
      expect(await pending).toMatchObject({ state: "failed", failureCode: "CLIENT_CONFLICT" });
    });
    expect(fixture("select count(*) from public.clients;")).toBe("2");
    expect(fixture("select published_at is null and client_id is null from public.invoices;")).toBe("t");
    expect(fixture("select activated_at is null and revoked_at is not null from public.access_links;")).toBe("t");
  });

  it("returns scoped legacy status without fabricating a snapshot or claiming an F1 attempt", async () => {
    const input = await reservation();
    const legacyId = randomUUID();
    fixture(`insert into public.publication_attempts (id,workspace_id,invoice_id,invoice_version_id,request_fingerprint,
      sequence_year,sequence_value,invoice_number,invoice_key,publication_salt,storage_key,invoice_token_id,invoice_key_version,invoice_verifier_hash,invoice_link_expires_at)
      select '${legacyId}',workspace_id,invoice_id,id,'${"e".repeat(64)}',2026,1,'F1-2026-1','${hash()}','${hash()}',
        'legacy.pdf',gen_random_uuid(),1,'${"f".repeat(64)}',now()+interval '1 year' from public.invoice_versions;
      insert into public.invoices (id,workspace_id) values ('${randomUUID()}','${workspaceId}');`);
    expect(await repository.claim(legacyId, randomUUID())).toBeNull();
    expect(await repository.claim(null, randomUUID())).toBeNull();
    expect(await repository.statusData(actor, input.draftId)).toMatchObject({ snapshot: testPublicationSnapshot(), attempt: null });
    const skeletal = fixture(`select id from public.invoices where id <> '${input.draftId}';`);
    expect(await repository.statusData(actor, skeletal)).toMatchObject({ snapshot: null, attempt: null });
    expect(fixture(`select fence = 0 and state = 'reserved' from public.publication_attempts where id = '${legacyId}';`)).toBe("t");
  });

  it("rejects stale versions, stale profiles, expired deadlines, overflow and missing deployment before burning a number", async () => {
    const input = await reservation();
    await expect(repository.reserve(actor, { ...input, expectedVersion: 2 })).rejects.toMatchObject({ code: "VERSION_CONFLICT",
      details: { draftId: input.draftId, currentVersion: 1 } });
    await expect(repository.reserve(actor, { ...input, contractAddress: `0x${"0".repeat(40)}` })).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
    fixture("update public.sender_profiles set revision = 2;");
    await expect(repository.reserve(actor, input)).rejects.toMatchObject({ code: "PROFILE_CONFLICT" });
    fixture("update public.sender_profiles set revision = 1;");
    for (const [dueDate, payableUntil, code] of [["2020-01-31", "2020-03-01T00:00:00.000Z", "DRAFT_NOT_EDITABLE"],
      ["9999-01-31", "9999-03-02T00:00:00.000Z", "INVALID_INPUT"]]) {
      const snapshot = testPublicationSnapshot();
      snapshot.issueDate = dueDate.slice(0, 4) + "-01-01"; snapshot.dueDate = dueDate; snapshot.payableUntil = payableUntil;
      snapshot.appliedDefaults[0].value = payableUntil;
      await expect(repository.reserve(actor, await reservation(snapshot))).rejects.toMatchObject({ code });
    }
    expect(fixture("select (select count(*) from public.publication_attempts) + (select count(*) from public.invoice_sequences) + (select count(*) from public.access_links);")).toBe("0");
  });

  it("voids exactly once with approval/version checks and revokes links without changing terminal artifacts", async () => {
    const { input, claimed } = await stored();
    const finalized = (await repository.finalize(fence(claimed)))!;
    const write = voidInput(finalized);
    await expect(repository.voidInvoice(actor, { ...write, expectedVersion: 2 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect((await service.rpc("payr_void_invoice_v1", { ...scope, p_input: { ...write, approval: false } })).error).toMatchObject({ message: "INVALID_INPUT" });
    const results = await Promise.all(Array.from({ length: 6 }, () => repository.voidInvoice(actor, write)));
    expect(results.every((r) => JSON.stringify(r) === JSON.stringify(results[0]))).toBe(true);
    expect(results[0]).toMatchObject({ invoiceId: input.draftId, invoiceVersion: 1, commercialState: "voided" });
    expect(await repository.voidInvoice(actor, write)).toEqual(results[0]);
    await expect(repository.voidInvoice(actor, { ...write, requestFingerprint: "0".repeat(64) })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(repository.voidInvoice(actor, { ...write, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "INVOICE_NOT_VOIDABLE" });
    const replay = await repository.reserve(actor, input);
    expect(replay).toMatchObject({ state: "finalized", artifact });
    expect(replay.link.revokedAt).not.toBeNull();
    expect(await repository.statusData(actor, input.draftId)).toMatchObject({ commercialState: "voided", voidedAt: results[0].voidedAt });
    expectFixtureFailure(`update public.publication_attempts set lease_until = now() where id = '${finalized.id}';`, "FINALIZED_PUBLICATION_IMMUTABLE");
  });

  it.each(["settlement", "void"] as const)("serializes the void/settlement race when %s obtains the invoice-key lock first", async (first) => {
    const { claimed } = await stored();
    const a = (await repository.finalize(fence(claimed)))!;
    await transaction(`select pg_advisory_xact_lock(hashtextextended('payr:invoice:${a.chainId}:${a.contractAddress}:${a.invoiceKey}',0))`, async (pid, commit) => {
      const settle = () => service.rpc("payr_record_settlement_v1", settlementInput(a)).then((r) => r);
      const voidInvoice = () => service.rpc("payr_void_invoice_v1", { ...scope, p_input: voidInput(a) }).then((r) => r);
      const firstResult = first === "settlement" ? settle() : voidInvoice();
      await waitForWaiter(pid);
      const secondResult = first === "settlement" ? voidInvoice() : settle();
      await commit();
      const result = await firstResult, second = await secondResult;
      expect(result.error).toBeNull();
      if (first === "settlement") expect(second.error).toMatchObject({ message: "INVOICE_ALREADY_SETTLED" });
      else expect(second.error).toBeNull();
    });
    const status = await repository.statusData(actor, a.invoiceId);
    expect(status).toMatchObject({ commercialState: first === "settlement" ? "published" : "voided", settlement: {
      invoiceVersion: 1, amountAtomic: a.snapshot.amountAtomic, chainId: a.chainId, documentCommitment: artifact.documentCommitment,
    }, receipt: { state: "pending", artifact: null }, deliveries: [{ roles: ["issuer", "client"], state: "pending", providerMessageId: null, nextAttemptAt: null, attemptCount: 0 }] });
    expect(fixture("select count(*) from public.settlements;")).toBe("1");
  });

  it("rechecks authorization payability after waiting behind void", async () => {
    const { claimed } = await stored();
    const a = (await repository.finalize(fence(claimed)))!;
    await transaction(`select pg_advisory_xact_lock(hashtextextended('payr:invoice:${a.chainId}:${a.contractAddress}:${a.invoiceKey}',0))`, async (pid, commit) => {
      const voided = service.rpc("payr_void_invoice_v1", { ...scope, p_input: voidInput(a) }).then((r) => r);
      await waitForWaiter(pid);
      const authorization = service.rpc("payr_record_payment_authorization_v1", authorizationInput(a)).then((r) => r);
      await commit();
      expect((await voided).error).toBeNull();
      expect((await authorization).error).toMatchObject({ message: "AUTHORIZATION_NOT_PAYABLE" });
    });
    expect(fixture("select count(*) from public.payment_authorizations;")).toBe("0");
  });

  it("returns exact raw settlement, ready receipt and delivery facts without bearer URLs", async () => {
    const { claimed } = await stored();
    const a = (await repository.finalize(fence(claimed)))!;
    const event = settlementInput(a);
    expect((await service.rpc("payr_record_settlement_v1", event)).error).toBeNull();
    expect((await service.rpc("payr_record_settlement_v1", event)).data).toMatchObject([{ outcome: "replayed" }]);
    fixture(`update public.receipt_documents set state = 'ready',storage_key = 'receipt.pdf',byte_length = 123,content_type = 'application/pdf',
      content_hash = '${artifact.pdfContentHash}',pdf_filename = 'receipt.pdf',ready_at = clock_timestamp();
      update public.email_deliveries set state = 'sent',provider_message_id = 'provider-safe-id',attempt_count = 1;`);
    const status = await repository.statusData(actor, a.invoiceId);
    expect(status).toMatchObject({ receipt: { state: "ready", artifact: { pdfFilename: "receipt.pdf", pdfContentHash: artifact.pdfContentHash } },
      deliveries: [{ state: "sent", providerMessageId: "provider-safe-id", attemptCount: 1 }] });
    expect(JSON.stringify(status)).not.toMatch(/https?:|invoiceUrl|pdfUrl|paymentUrl|signature|decodedQr/);
    expect(await repository.statusData(actor, randomUUID())).toBeNull();
    await expect(repository.statusData({ ...actor, ownerWallet: `0x${"4".repeat(40)}` }, a.invoiceId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps first-settlement status reads internally consistent under concurrency", async () => {
    const { claimed } = await stored();
    const a = (await repository.finalize(fence(claimed)))!;
    const statuses = Array.from({ length: 30 }, () => repository.statusData(actor, a.invoiceId));
    const event = service.rpc("payr_record_settlement_v1", settlementInput(a)).then((r) => r);
    for (const status of await Promise.all(statuses)) {
      if (status!.settlement === null) expect(status).toMatchObject({ receipt: null, deliveries: [] });
      else expect(status).toMatchObject({ receipt: { state: "pending" }, deliveries: [{ state: "pending" }] });
    }
    expect((await event).error).toBeNull();
  });

  it.each(["unknown", "revoked", "expired", "wrong-owner"])("checks %s actor scope before even a saved replay", async (kind) => {
    const { input } = await stored();
    const id = randomUUID();
    if (kind !== "unknown" && kind !== "wrong-owner") fixture(`insert into public.connector_tokens (id,workspace_id,token_hash,created_at,expires_at,revoked_at)
      values ('${id}','${workspaceId}','${"c".repeat(64)}',clock_timestamp()-interval '2 days',
        clock_timestamp() ${kind === "expired" ? "-" : "+"} interval '1 day',${kind === "revoked" ? "clock_timestamp()" : "null"});`);
    const scoped = kind === "wrong-owner" ? { ...actor, ownerWallet: `0x${"4".repeat(40)}` }
      : { ...actor, ownerWallet: null, connectorId: id };
    await expect(repository.reserve(scoped, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.statusData(scoped, input.draftId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fixture("select count(*) from public.publication_attempts;")).toBe("1");
  });

  it("expires at most 100 published invoices, idempotently, without revoking document links", async () => {
    const { claimed } = await stored();
    const a = (await repository.finalize(fence(claimed)))!;
    fixture(`update public.invoices set published_at = clock_timestamp() - interval '2 days',payable_until = clock_timestamp() - interval '1 day';
      insert into public.invoices (id,workspace_id,client_id,commercial_state,invoice_number,published_at,payable_until)
        select gen_random_uuid(),'${workspaceId}','${a.snapshot.clientReference.id}','published','EXPIRY-' || g,
          clock_timestamp() - interval '2 days',clock_timestamp() - interval '1 day' from generate_series(1,104) g;`);
    expect(await repository.expire(100)).toEqual({ expired: 100 });
    expect(await repository.expire(100)).toEqual({ expired: 5 });
    expect(await repository.expire(100)).toEqual({ expired: 0 });
    expect(fixture("select revoked_at is null and activated_at is not null from public.access_links;")).toBe("t");
    expect(await repository.statusData(actor, a.invoiceId)).toMatchObject({ commercialState: "expired", attempt: { state: "finalized" } });
    await expect(repository.voidInvoice(actor, voidInput(a))).rejects.toMatchObject({ code: "INVOICE_NOT_VOIDABLE" });
    expect((await service.rpc("payr_record_payment_authorization_v1", authorizationInput(a))).error).toMatchObject({ message: "AUTHORIZATION_NOT_PAYABLE" });
  });

  it.each([0, 101, -1, null])("rejects expiry bound %j", async (p_limit) => {
    expect((await service.rpc("payr_expire_invoices_v1", { p_limit })).error).toMatchObject({ message: "INVALID_INPUT" });
  });

  it.each(["approval", "expectedVersion", "draftId", "attemptId", "invoiceKey", "publicationSalt", "tokenId", "keyVersion", "verifierHash", "chainId", "contractAddress", "requestFingerprint"])("rejects missing or null reservation %s", async (key) => {
    const input = await reservation();
    for (const value of [Object.fromEntries(Object.entries(input).filter(([k]) => k !== key)), { ...input, [key]: null }]) {
      const r = await service.rpc("payr_reserve_publication_v1", { ...scope, p_input: value });
      expect(r.error).toMatchObject({ message: "INVALID_INPUT" }); expect(r.data).toBeNull();
    }
    expect(fixture("select count(*) from public.publication_attempts;")).toBe("0");
  });

  it.each(["anon", "authenticated"])("denies %s every new RPC and every private helper", async (role) => {
    const denied = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let userId: string | undefined;
    if (role === "authenticated") {
      const credentials = { email: `${randomUUID()}@example.test`, password: randomUUID() };
      const user = await service.auth.admin.createUser({ ...credentials, email_confirm: true });
      expect(user.error).toBeNull(); userId = user.data.user!.id;
      expect((await denied.auth.signInWithPassword(credentials)).error).toBeNull();
    }
    try {
    const input = await reservation();
    const args = { p_attempt_id: input.attemptId, p_lease_owner: randomUUID(), p_fence: "1" };
    const calls: [string, Record<string, unknown>][] = [
      ["payr_reserve_publication_v1", { ...scope, p_input: input }], ["payr_claim_publication_v1", { p_attempt_id: null, p_lease_owner: args.p_lease_owner }],
      ["payr_store_publication_v1", { ...args, p_artifact: artifact }], ["payr_finalize_publication_v1", args],
      ["payr_fail_publication_v1", { ...args, p_failure_code: "PROFILE_CONFLICT" }], ["payr_publication_status_v1", { ...scope, p_invoice_id: input.draftId }],
      ["payr_void_invoice_v1", { ...scope, p_input: { invoiceId: input.draftId, expectedVersion: 1, approval: true, idempotencyKey: "void", requestFingerprint: "a".repeat(64) } }],
      ["payr_expire_invoices_v1", { p_limit: 100 }],
    ];
    for (const [name, parameters] of calls) {
      const result = await denied.rpc(name, parameters);
      expect(["42501", "PGRST202"], name).toContain(result.error?.code); expect(result.data, name).toBeNull();
    }
    expect(fixture(`select bool_and(not has_function_privilege('${role}',p.oid,'execute') and p.proconfig @> array['search_path=""'])
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and
      (p.proname like 'payr_%publication%_v1' or p.proname in ('payr_void_invoice_v1','payr_expire_invoices_v1'));`)).toBe("t");
    expect(fixture("select count(*) from public.publication_attempts;")).toBe("0");
    } finally { if (userId) await service.auth.admin.deleteUser(userId); }
  });

  it("grants service only the eight exact RPCs, never internal lock/profile helpers or direct writes", async () => {
    const args = { p_attempt_id: randomUUID(), p_lease_owner: randomUUID(), p_fence: "1" };
    expect(["42501", "PGRST202"]).toContain((await service.rpc("payr_publication_lock_v1", args)).error?.code);
    expect(["42501", "PGRST202"]).toContain((await service.rpc("payr_publication_profiles_v1", {
      p_workspace_id: workspaceId, p_snapshot: testPublicationSnapshot(), p_invoice_id: randomUUID(),
    })).error?.code);
    expect(fixture(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
      and p.proname in ('payr_reserve_publication_v1','payr_claim_publication_v1','payr_store_publication_v1','payr_finalize_publication_v1',
        'payr_fail_publication_v1','payr_publication_status_v1','payr_void_invoice_v1','payr_expire_invoices_v1')
      and p.prosecdef and p.proconfig @> array['search_path=""'] and has_function_privilege('service_role',p.oid,'execute');`)).toBe("8");
    expect((await service.from("publication_attempts").update({ state: "failed" }).eq("workspace_id", workspaceId)).error?.code).toBe("42501");
    expect(fixture("select count(*) from pg_policies where schemaname = 'public';")).toBe("0");
  });
});

function newClientSnapshot(): DraftSnapshot {
  const snapshot = testPublicationSnapshot();
  snapshot.clientReference = { id: null, alias: null, revision: null };
  snapshot.proposedClientChanges = { kind: "create", fields: {
    businessName: { value: snapshot.client.businessName, provenance: { kind: "user_provided" }, confirmed: true },
    billingAddress: { value: snapshot.client.billingAddress, provenance: { kind: "user_provided" }, confirmed: true },
    contactName: { value: snapshot.client.contactName, provenance: { kind: "user_provided" }, confirmed: true },
    contactEmail: { value: snapshot.client.contactEmail, provenance: { kind: "web_source", url: "https://example.test/contact" }, confirmed: true },
  } };
  for (const key of ["businessName", "billingAddress", "contactName", "contactEmail"] as const) snapshot.clientProvenance[key] = snapshot.proposedClientChanges.fields[key]!.provenance;
  return snapshot;
}

function voidInput(a: PublicationAttempt) {
  return { invoiceId: a.invoiceId, expectedVersion: a.invoiceVersion, approval: true as const, idempotencyKey: randomUUID(), requestFingerprint: "b".repeat(64) };
}
function settlementInput(a: PublicationAttempt) {
  return { p_workspace_id: workspaceId, p_chain_id: a.chainId, p_contract_address: a.contractAddress, p_invoice_key: a.invoiceKey,
    p_transaction_hash: hash(), p_log_index: 0, p_block_number: "9007199254740993", p_block_time: new Date().toISOString(),
    p_document_commitment: artifact.documentCommitment, p_payer: owner, p_payee: a.snapshot.sender.payoutWallet,
    p_amount_atomic: a.snapshot.amountAtomic, p_receipt_token_id: randomUUID(), p_receipt_key_version: 1,
    p_receipt_verifier_hash: "a".repeat(64), p_receipt_expires_at: "2035-01-01T00:00:00.000Z",
    p_deliveries: [{ messageKind: "receipt", normalizedRecipient: "owner@example.test", roles: ["issuer", "client"] }] };
}
function authorizationInput(a: PublicationAttempt) {
  const now = Math.floor(Date.now() / 1000);
  return { p_workspace_id: workspaceId, p_authorization_id: randomUUID(), p_invoice_id: a.invoiceId, p_invoice_version_id: a.invoiceVersionId,
    p_invoice_key: a.invoiceKey, p_chain_id: a.chainId, p_contract_address: a.contractAddress, p_document_commitment: artifact.documentCommitment,
    p_payee: a.snapshot.sender.payoutWallet, p_amount_atomic: a.snapshot.amountAtomic, p_attestor: owner, p_typed_data_digest: hash(),
    p_signature_hash: hash(), p_signer_mode: "test", p_policy_result: "allowed", p_issued_at_second: String(now - 1), p_authorization_valid_until: String(now + 60) };
}

// Owner-only setup represents a persisted crash record, including pre-expiry reservations.
// All recovery operations below still use the actual platform RPCs.
async function managedCrashFixture(snapshot: DraftSnapshot, initialFence: string, newerVersion = false) {
  const source = await repository.reserve(actor, await reservation());
  const write = { draftId: null, expectedVersion: null, snapshot, idempotencyKey: randomUUID(), requestFingerprint: "e".repeat(64) };
  const draft = await drafts.saveDraft(actor, write);
  if (newerVersion) await drafts.saveDraft(actor, { ...write, draftId: draft.draftId, expectedVersion: 1, idempotencyKey: randomUUID() });
  const id = randomUUID(), requestId = randomUUID(), tokenId = randomUUID();
  const overrides = { id, invoice_id: draft.draftId, invoice_version_id: draft.id, idempotency_request_id: requestId,
    invoice_token_id: tokenId, invoice_key: hash(), sequence_value: 2, invoice_number: `INV-${new Date().getUTCFullYear()}-000002`,
    storage_key: `workspace/${workspaceId}/invoice/${draft.draftId}/1/attempt/${id}.pdf`, state: "rendering", lease_owner: randomUUID(), fence: initialFence };
  fixture(`insert into public.idempotency_requests (id,workspace_id,operation,idempotency_key,request_fingerprint,result_descriptor)
    values ('${requestId}','${workspaceId}','publish_invoice','${randomUUID()}','${"e".repeat(64)}',
      '{"ids":{"invoice_id":"${draft.draftId}","version_id":"${draft.id}","attempt_id":"${id}"},"state":"reserved"}');
    insert into public.access_links (id,workspace_id,token_id,purpose,key_version,verifier_hash,invoice_version_id,expires_at)
      values (gen_random_uuid(),'${workspaceId}','${tokenId}','invoice-bearer',1,'${source.link.verifierHash}','${draft.id}','${source.link.expiresAt}');
    insert into public.publication_attempts select (jsonb_populate_record(null::public.publication_attempts,
      to_jsonb(a) || '${JSON.stringify(overrides)}'::jsonb)).* from public.publication_attempts a where id = '${source.id}';
    update public.invoice_sequences set next_value = 3;`);
  return id;
}
