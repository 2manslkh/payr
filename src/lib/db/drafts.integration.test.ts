import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { DraftSnapshot, DraftWrite, InvoiceActor } from "../invoices/contracts";
import { createDraftRepository } from "./drafts";

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const repository = createDraftRepository(service);
const owner = `0x${"1".repeat(40)}`;
const workspaceId = "00000000-0000-4000-8000-000000000001";
const clientId = "00000000-0000-4000-8000-000000000002";
const senderId = "00000000-0000-4000-8000-000000000003";
const actor: InvoiceActor = { workspaceId, ownerWallet: owner, connectorId: null };
const scope = { p_workspace_id: workspaceId, p_owner_wallet: owner, p_connector_id: null };
const address = { line1: "1 Test Road", city: "London", postalCode: "N1 1AA", countryCode: "GB" };

function fixture(sql: string): string {
  const database = new URL(process.env.SUPABASE_DB_URL!);
  if (process.env.SUPABASE_URL !== "http://127.0.0.1:57321" || database.protocol !== "postgresql:"
    || database.hostname !== "127.0.0.1" || database.port !== "57322"
    || database.username !== "postgres" || database.pathname !== "/postgres") throw new Error("Local Payr fixtures only");
  return execFileSync("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function snapshot(): DraftSnapshot {
  return {
    schemaVersion: "payr.draft.v1",
    sender: { id: senderId, revision: 1, businessName: "Studio", billingAddress: address, contactName: "Owner",
      contactEmail: "owner@example.test", payoutWallet: owner, invoicePrefix: "PAYR", defaultPaymentTermsDays: 30 },
    client: { businessName: "Client", billingAddress: address, contactName: "Client Contact", contactEmail: "client@example.test" },
    clientReference: { id: clientId, alias: "client", revision: 1 },
    clientProvenance: { businessName: { kind: "saved_profile" }, billingAddress: { kind: "saved_profile" },
      contactName: { kind: "saved_profile" }, contactEmail: { kind: "saved_profile" } },
    proposedClientChanges: { kind: "none", fields: {} },
    items: [{ description: "Consulting", amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001" }],
    issueDate: "2026-09-06", dueDate: "2026-10-06", payableUntil: "2026-11-05T00:00:00.000Z",
    amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001", memo: "",
    appliedDefaults: [{ field: "payableUntil", value: "2026-11-05T00:00:00.000Z", source: "technical_deadline" }],
  };
}
function newClientSnapshot(): DraftSnapshot {
  const value = snapshot();
  value.clientReference = { id: null, revision: null, alias: null };
  value.proposedClientChanges = { kind: "create", fields: {
    businessName: { value: value.client.businessName, provenance: { kind: "user_provided" }, confirmed: true },
    billingAddress: { value: value.client.billingAddress, provenance: { kind: "user_provided" }, confirmed: true },
    contactName: { value: value.client.contactName, provenance: { kind: "user_provided" }, confirmed: true },
    contactEmail: { value: value.client.contactEmail, provenance: { kind: "web_source", url: "https://example.test/contact" }, confirmed: true },
  } };
  for (const key of ["businessName", "billingAddress", "contactName", "contactEmail"] as const) {
    value.clientProvenance[key] = value.proposedClientChanges.fields[key]!.provenance;
  }
  return value;
}
function write(changes: Partial<DraftWrite> = {}): DraftWrite {
  return { draftId: null, expectedVersion: null, idempotencyKey: randomUUID(), requestFingerprint: "a".repeat(64), snapshot: snapshot(), ...changes };
}
function counts() {
  return fixture(`select (select count(*) from public.invoices) || ',' || (select count(*) from public.invoice_versions)
    || ',' || (select count(*) from public.idempotency_requests) || ',' || (select count(*) from public.clients);`);
}

function altered(input: DraftWrite, path: string, value: unknown, remove = false): unknown {
  const result = structuredClone(input);
  const keys = path.split(".");
  let target: object = result;
  for (const key of keys.slice(0, -1)) target = Reflect.get(target, key);
  if (remove) Reflect.deleteProperty(target, keys.at(-1)!); else Reflect.set(target, keys.at(-1)!, value);
  return result;
}
function expectFixtureFailure(sql: string, marker: string) {
  try { fixture(sql); } catch (error) {
    expect(String((error as { stderr: unknown }).stderr)).toContain(marker);
    return;
  }
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

function connector(expires = "clock_timestamp() + interval '1 day'") {
  const id = randomUUID();
  fixture(`insert into public.connector_tokens (id,workspace_id,token_hash,expires_at)
    values ('${id}','${workspaceId}',replace('${id}','-','') || replace('${id}','-',''),${expires});`);
  return { ...actor, ownerWallet: null, connectorId: id };
}

describe("F3 draft transactions through Supabase RPC", () => {
  beforeEach(() => {
    fixture(`truncate public.workspaces cascade;
      insert into public.workspaces (id,owner_wallet) values ('${workspaceId}','${owner}');
      insert into public.sender_profiles (id,workspace_id,business_name,billing_address,contact_name,contact_email,payout_wallet,invoice_prefix,default_terms)
        values ('${senderId}','${workspaceId}','Studio','${JSON.stringify(address)}','Owner','owner@example.test','${owner}','PAYR','30');
      insert into public.clients (id,workspace_id,alias,business_name,billing_address,contact_name,contact_email)
        values ('${clientId}','${workspaceId}','client','Client','${JSON.stringify(address)}','Client Contact','client@example.test');`);
  });

  it.each(["UK", "ZZ", "EU", "XK", "AA", "gb", " GB ", null, 42])(
    "rejects non-ISO country %j through profile/client write RPCs without mutations", async (countryCode) => {
      const billing = { ...snapshot().client, billingAddress: { ...address, countryCode } };
      const calls = [
        ["payr_save_sender_profile_v1", { ...billing, expectedRevision: 1, invoicePrefix: "PAYR", defaultPaymentTermsDays: 30 }],
        ["payr_save_client_v1", { ...billing, id: null, expectedRevision: null, alias: "new-client" }],
        ["payr_save_client_v1", { ...billing, id: clientId, expectedRevision: 1, alias: "client" }],
      ] as const;
      for (const [name, p_input] of calls) {
        const result = await service.rpc(name, { p_workspace_id: workspaceId, p_owner_wallet: owner, p_input });
        expect.soft(result.error, name).toMatchObject({ code: "22023", message: "INVALID_INPUT" });
        expect.soft(result.data, name).toBeNull();
      }
      expect(counts()).toBe("0,0,0,1");
      expect(fixture(`select (select revision from public.sender_profiles) = 1
        and (select revision from public.clients) = 1 and not exists (select 1 from public.audit_events)
        and (select billing_address ->> 'countryCode' from public.sender_profiles) = 'GB'
        and (select billing_address ->> 'countryCode' from public.clients) = 'GB';`)).toBe("t");
    },
  );

  it.each(["sender_profiles", "clients"])("guards direct %s country writes while retaining country-less F1 fixtures", (table) => {
    const other = randomUUID();
    fixture(`insert into public.workspaces (id,owner_wallet) values ('${other}','0x${"2".repeat(40)}');`);
    for (const countryCode of ["UK", "ZZ", "gb", null, 42, true, [], {}]) {
      const billing = JSON.stringify({ ...address, countryCode });
      for (const sql of [
        `insert into public.${table} select (jsonb_populate_record(null::public.${table},
          to_jsonb(p) || jsonb_build_object('id',gen_random_uuid(),'workspace_id','${other}','billing_address','${billing}'::jsonb))).*
          from public.${table} p where workspace_id = '${workspaceId}';`,
        `update public.${table} set billing_address = '${billing}' where workspace_id = '${workspaceId}';`,
      ]) expectFixtureFailure(`\\set VERBOSITY verbose\n${sql}`, "22023: INVALID_INPUT");
    }
    fixture(`insert into public.${table} select (jsonb_populate_record(null::public.${table},
      to_jsonb(p) || jsonb_build_object('id',gen_random_uuid(),'workspace_id','${other}','billing_address','{"line1":"F1 partial"}'::jsonb))).*
      from public.${table} p where workspace_id = '${workspaceId}';
      update public.${table} set billing_address = '{}' where workspace_id = '${other}';`);
    for (const countryCode of ["GB", "US", "AX", "BQ", "SS", "ZW"]) {
      fixture(`update public.${table} set billing_address = '${JSON.stringify({ ...address, countryCode })}' where workspace_id = '${other}';`);
      expect(fixture(`select billing_address ->> 'countryCode' from public.${table} where workspace_id = '${other}';`)).toBe(countryCode);
    }
  });

  it("creates one immutable snapshot and UUID-only replay descriptor without publication or client writes", async () => {
    const input = write();
    const raw = await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: input });
    expect(raw.error).toBeNull();
    const saved = await repository.findReplay(actor, input.idempotencyKey, input.requestFingerprint);
    expect(saved).toEqual(raw.data);
    expect(saved).toMatchObject({ version: 1, snapshot: input.snapshot });
    expect(counts()).toBe("1,1,1,1");
    expect(fixture("select result_descriptor from public.idempotency_requests;")).toBe(JSON.stringify({
      ids: { invoice_id: saved!.draftId, version_id: saved!.id }, state: "draft_ready",
    }).replaceAll(/([,:])/g, "$1 "));
    expect(fixture(`select (select count(*) from public.invoice_sequences) + (select count(*) from public.publication_attempts)
      + (select count(*) from public.access_links) + (select count(*) from public.receipt_documents);`)).toBe("0");
  });

  it("projects draft detail, bounded lists, and real setup without counting drafts as receivables", async () => {
    const saved = await repository.saveDraft(actor, write());
    expect(await repository.getContext(actor, { draftId: saved.draftId, clientId: null, clientAlias: null }))
      .toMatchObject({ sender: saved.snapshot.sender, client: { id: clientId }, previous: saved, commercialState: "draft" });
    const page = await repository.listInvoices(actor, { search: "Client", commercialState: "draft", limit: 50, offset: 0 });
    expect(page).toMatchObject({ hasMore: false, items: [{ id: saved.draftId, version: 1, clientName: "Client",
      amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001",
      commercialState: "draft", paymentStatus: "unpaid", displayStatus: "Draft" }] });
    expect(await repository.getInvoiceDetail(actor, saved.draftId)).toEqual({ invoice: page.items[0], version: saved,
      history: [{ id: saved.id, version: 1, createdAt: saved.createdAt }] });
    expect(await repository.getOverview(actor)).toEqual({ senderComplete: true, clientCount: 1, activeConnectorCount: 0,
      invoiceCount: 1, draftCount: 1, receivablesAtomic: "0", attention: page.items, latestSettlement: null });
  });

  it.each([
    ["idempotencyKey", ""], ["idempotencyKey", "x".repeat(129)], ["idempotencyKey", null], ["requestFingerprint", "A".repeat(64)],
    ["expectedVersion", 1], ["draftId", randomUUID()], ["snapshot.schemaVersion", "future"], ["snapshot.sender", null],
    ["snapshot.sender.revision", "1"], ["snapshot.sender.defaultPaymentTermsDays", 1.1], ["snapshot.sender.defaultPaymentTermsDays", 366],
    ["snapshot.sender.invoicePrefix", "lowercase"], ["snapshot.sender.payoutWallet", "private"],
    ["snapshot.client.businessName", ""], ["snapshot.client.contactEmail", "CLIENT@example.test"],
    ["snapshot.client.billingAddress.countryCode", "ZZ"], ["snapshot.client.billingAddress.countryCode", "gb"],
    ["snapshot.items", []], ["snapshot.items", Array.from({ length: 101 }, () => snapshot().items[0])],
    ["snapshot.items.0.description", "x".repeat(501)], ["snapshot.items.0.description", "  "],
    ["snapshot.items.0.amountDecimal", "01"], ["snapshot.items.0.amountDecimal", "1e3"], ["snapshot.items.0.amountDecimal", "1.0"],
    ["snapshot.items.0.amountAtomic", 1000000000000000001], ["snapshot.items.0.amountAtomic", "NaN"],
    ["snapshot.amountAtomic", "1000000000000000002"], ["snapshot.amountDecimal", "2"],
    ["snapshot.memo", "x".repeat(2001)], ["snapshot.issueDate", "2026-02-30"], ["snapshot.issueDate", "1999-12-31"],
    ["snapshot.dueDate", "2026-09-05"], ["snapshot.dueDate", "9999-12-20"], ["snapshot.payableUntil", "2026-11-05T00:00:01.000Z"],
    ["snapshot.clientReference.revision", null], ["snapshot.clientReference.id", null], ["snapshot.clientReference.alias", null],
    ["snapshot.clientProvenance.businessName", { kind: "user_provided" }],
    ["snapshot.proposedClientChanges.kind", "update"], ["snapshot.appliedDefaults", []], ["snapshot.appliedDefaults.0.source", "sender_terms"],
    ["snapshot.appliedDefaults.0.value", "secret"], ["snapshot.appliedDefaults", [snapshot().appliedDefaults[0], snapshot().appliedDefaults[0]]],
  ])("rejects invalid %s without any reservation or mutation", async (path, value) => {
    const result = await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: altered(write(), String(path), value) });
    expect(result.error).toMatchObject({ code: "22023", message: "INVALID_INPUT" });
    expect(counts()).toBe("0,0,0,1");
  });

  it.each([
    "draftId", "expectedVersion", "idempotencyKey", "requestFingerprint", "snapshot.schemaVersion",
    "snapshot.sender.id", "snapshot.sender.revision", "snapshot.sender.businessName", "snapshot.sender.contactName",
    "snapshot.sender.contactEmail", "snapshot.sender.payoutWallet", "snapshot.sender.invoicePrefix",
    "snapshot.sender.billingAddress.line1", "snapshot.sender.billingAddress.city", "snapshot.sender.billingAddress.postalCode",
    "snapshot.sender.billingAddress.countryCode", "snapshot.client.businessName", "snapshot.client.contactName", "snapshot.client.contactEmail",
    "snapshot.client.billingAddress.line1", "snapshot.client.billingAddress.city", "snapshot.client.billingAddress.postalCode",
    "snapshot.client.billingAddress.countryCode", "snapshot.clientReference.id", "snapshot.clientReference.revision", "snapshot.clientReference.alias",
    "snapshot.clientProvenance.businessName.kind", "snapshot.clientProvenance.billingAddress.kind",
    "snapshot.clientProvenance.contactName.kind", "snapshot.clientProvenance.contactEmail.kind", "snapshot.proposedClientChanges.kind",
    "snapshot.items.0.description", "snapshot.items.0.amountDecimal", "snapshot.items.0.amountAtomic",
    "snapshot.amountDecimal", "snapshot.amountAtomic", "snapshot.issueDate", "snapshot.dueDate", "snapshot.payableUntil", "snapshot.memo",
    "snapshot.appliedDefaults.0.field", "snapshot.appliedDefaults.0.value", "snapshot.appliedDefaults.0.source",
  ])("rejects null required scalar %s without any reservation or mutation", async (path) => {
    const input = write(["draftId", "expectedVersion"].includes(path) ? { draftId: randomUUID(), expectedVersion: 1 } : {});
    const result = await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: altered(input, path, null) });
    expect.soft(result.error).toMatchObject({ code: "22023", message: "INVALID_INPUT" });
    expect.soft(result.data).toBeNull();
    expect(counts()).toBe("0,0,0,1");
    expect(await repository.findReplay(actor, input.idempotencyKey, input.requestFingerprint)).toBeNull();
  });

  it.each([
    "snapshot.proposedClientChanges.kind",
    ...["businessName", "billingAddress", "contactName", "contactEmail"].flatMap((field) =>
      ["value", "confirmed", "provenance.kind"].map((key) => `snapshot.proposedClientChanges.fields.${field}.${key}`)),
    "snapshot.proposedClientChanges.fields.contactEmail.provenance.url", "snapshot.clientProvenance.contactEmail.url",
  ])("rejects null new-client scalar %s without any reservation or mutation", async (path) => {
    const input = write({ snapshot: newClientSnapshot() });
    const result = await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: altered(input, path, null) });
    expect.soft(result.error).toMatchObject({ code: "22023", message: "INVALID_INPUT" });
    expect.soft(result.data).toBeNull();
    expect(counts()).toBe("0,0,0,1");
    expect(await repository.findReplay(actor, input.idempotencyKey, input.requestFingerprint)).toBeNull();
  });

  it.each(["businessName", "billingAddress", "contactName", "contactEmail"] as const)(
    "rejects matching null provenance kinds with a valid URL for %s without consuming the key", async (field) => {
      const value = newClientSnapshot();
      const provenance = { kind: "web_source" as const, url: "https://example.test/contact" };
      value.clientProvenance[field] = provenance;
      value.proposedClientChanges.fields[field]!.provenance = provenance;
      const input = write({ snapshot: value });
      Reflect.set(provenance, "kind", null);
      const result = await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: input });
      expect.soft(result.error).toMatchObject({ code: "22023", message: "INVALID_INPUT" });
      expect.soft(result.data).toBeNull();
      expect(counts()).toBe("0,0,0,1");
      expect(await repository.findReplay(actor, input.idempotencyKey, input.requestFingerprint)).toBeNull();
      Reflect.set(provenance, "kind", "web_source");
      expect((await repository.saveDraft(actor, input)).snapshot).toEqual(value);
      expect(counts()).toBe("1,1,1,1");
    },
  );

  it("makes Boolean validators return false, never SQL NULL, for null and incomplete inputs", () => {
    for (const value of ["null", "'null'::jsonb", "'{}'::jsonb"]) {
      expect(fixture(`select public.payr_draft_text_v1(${value},100) is false
        and public.payr_draft_country_v1(${value}) is false
        and public.payr_draft_billing_v1(${value}) is false and public.payr_draft_provenance_v1(${value}) is false
        and public.payr_draft_money_v1(${value}) is false and public.payr_draft_snapshot_valid_v1(${value}) is false;`)).toBe("t");
    }
    expect(fixture(`select public.payr_draft_provenance_v1('{"kind":null,"url":"https://example.test/contact"}') is false;`)).toBe("t");
    expect(counts()).toBe("0,0,0,1");
  });

  it("rejects unknown fields at every snapshot nesting level and every missing complete-snapshot field", async () => {
    const input = write();
    const objects = ["snapshot", "snapshot.sender", "snapshot.sender.billingAddress", "snapshot.client", "snapshot.client.billingAddress",
      "snapshot.clientReference", "snapshot.clientProvenance", "snapshot.clientProvenance.businessName", "snapshot.proposedClientChanges",
      "snapshot.proposedClientChanges.fields", "snapshot.items.0", "snapshot.appliedDefaults.0"];
    for (const path of ["private", ...objects.map((path) => path + ".private")]) {
      expect((await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: altered(input, path, "secret") })).error?.message, path).toBe("INVALID_INPUT");
    }
    const paths: string[] = [];
    function requiredPaths(value: object, prefix = "") {
      for (const [key, item] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        paths.push(path);
        if (item && typeof item === "object") requiredPaths(item, path);
      }
    }
    requiredPaths(input);
    for (const path of paths.filter((path) => !/\.\d+$/.test(path))) {
      expect((await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: altered(input, path, undefined, true) })).error?.message, path).toBe("INVALID_INPUT");
    }
    expect(counts()).toBe("0,0,0,1");
  });

  it.each(["businessName", "payoutWallet", "invoicePrefix", "revision"])("checks authoritative sender %s, not just its ID", async (key) => {
    const value = key === "revision" ? 2 : key === "payoutWallet" ? `0x${"2".repeat(40)}` : "OTHER";
    expect((await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: altered(write(), `snapshot.sender.${key}`, value) })).error)
      .toMatchObject({ code: "P0001", message: "PROFILE_CONFLICT", details: null });
    expect(counts()).toBe("0,0,0,1");
  });

  it("does not consume a failed key and checks current client facts/revision under scope", async () => {
    const input = write();
    for (const [path, value, code] of [
      ["snapshot.clientReference.id", randomUUID(), "NOT_FOUND"], ["snapshot.clientReference.revision", 2, "PROFILE_CONFLICT"],
      ["snapshot.clientReference.alias", "other", "PROFILE_CONFLICT"], ["snapshot.client.businessName", "Forged", "PROFILE_CONFLICT"],
    ]) {
      expect((await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: altered(input, String(path), value) })).error?.message).toBe(code);
      expect(counts()).toBe("0,0,0,1");
    }
    expect(await repository.saveDraft(actor, input)).toMatchObject({ version: 1 });
  });

  it("appends exactly one winner for concurrent CAS revisions and returns only safe conflict detail", async () => {
    const saved = await repository.saveDraft(actor, write());
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => service.rpc("payr_save_invoice_draft_v1", {
      ...scope, p_input: write({ draftId: saved.draftId, expectedVersion: 1, snapshot: { ...snapshot(), memo: String(index) } }),
    })));
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    for (const result of results.filter((result) => result.error)) {
      expect(result.error).toMatchObject({ code: "P0001", message: "VERSION_CONFLICT" });
      expect(JSON.parse(result.error!.details)).toEqual({ draftId: saved.draftId, currentVersion: 2 });
    }
    expect(counts()).toBe("1,2,2,1");
    expect((await repository.getInvoiceDetail(actor, saved.draftId))?.history.map((entry) => entry.version)).toEqual([2, 1]);
  });

  it("serializes concurrent same-key creations and revisions into the same original result", async () => {
    const input = write();
    const created = await Promise.all(Array.from({ length: 10 }, () => repository.saveDraft(actor, input)));
    expect(created.every((value) => value.id === created[0].id)).toBe(true);
    expect(counts()).toBe("1,1,1,1");
    const patch = write({ draftId: created[0].draftId, expectedVersion: 1, snapshot: { ...snapshot(), memo: "revision" } });
    const revised = await Promise.all(Array.from({ length: 10 }, () => repository.saveDraft(actor, patch)));
    expect(revised.every((value) => value.id === revised[0].id && value.version === 2)).toBe(true);
    expect(counts()).toBe("1,2,2,1");
  });

  it("reads detail and history from one database snapshot during concurrent revisions", async () => {
    const saved = await repository.saveDraft(actor, write());
    const revisions = (async () => {
      for (let version = 1; version <= 10; version++) await repository.saveDraft(actor,
        write({ draftId: saved.draftId, expectedVersion: version, snapshot: { ...snapshot(), memo: `Revision ${version}` } }));
    })();
    const reads = await Promise.all(Array.from({ length: 30 }, () => repository.getInvoiceDetail(actor, saved.draftId)));
    await revisions;
    for (const detail of reads) {
      expect(detail?.history[0].version).toBe(detail?.invoice.version);
      expect(detail?.history[0].id).toBe(detail?.version?.id);
    }
    expect(counts()).toBe("1,11,11,1");
  });

  it("rejects different fingerprints on a concurrent key without exposing or writing the original result", async () => {
    const key = randomUUID();
    const results = await Promise.all(["a", "b"].map((hash) => service.rpc("payr_save_invoice_draft_v1", {
      ...scope, p_input: write({ idempotencyKey: key, requestFingerprint: hash.repeat(64) }),
    })));
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.find((result) => result.error)).toMatchObject({ data: null, error: { message: "IDEMPOTENCY_CONFLICT", details: null } });
    expect(counts()).toBe("1,1,1,1");
  });

  it("replays before CAS/profile/client/date resolution after later revisions and profile changes", async () => {
    const input = write({ snapshot: { ...snapshot(), issueDate: "2000-01-01", dueDate: "2000-01-01",
      payableUntil: "2000-01-31T00:00:00.000Z", appliedDefaults: [{ field: "payableUntil", value: "2000-01-31T00:00:00.000Z", source: "technical_deadline" }] } });
    const saved = await repository.saveDraft(actor, input);
    await repository.saveDraft(actor, write({ draftId: saved.draftId, expectedVersion: 1 }));
    fixture("update public.sender_profiles set revision = revision + 1, business_name = 'Changed'; update public.clients set revision = revision + 1, business_name = 'Changed';");
    expect(await repository.saveDraft(actor, input)).toEqual(saved);
    expect(await repository.findReplay(actor, input.idempotencyKey, input.requestFingerprint)).toEqual(saved);
    await expect(repository.findReplay(actor, input.idempotencyKey, "b".repeat(64))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", details: {} });
    expect(counts()).toBe("1,2,2,1");
  });

  it("retains confirmed creation/update diffs and provenance without saving client rows", async () => {
    const created = newClientSnapshot();
    expect((await repository.saveDraft(actor, write({ snapshot: created }))).snapshot).toEqual(created);
    const updated = snapshot();
    updated.client.contactName = "New Contact";
    updated.clientProvenance.contactName = { kind: "user_provided" };
    updated.proposedClientChanges = { kind: "update", fields: {
      contactName: { value: "New Contact", provenance: { kind: "user_provided" }, confirmed: true },
    } };
    expect((await repository.saveDraft(actor, write({ snapshot: updated }))).snapshot).toEqual(updated);
    expect(fixture("select contact_name from public.clients;")).toBe("Client Contact");
    for (const [path, value] of [["confirmed", false], ["confirmed", "true"], ["value", "Mismatch"],
      ["provenance", { kind: "saved_profile" }], ["provenance", { kind: "web_source", url: "https://name:password@example.test" }],
      ["provenance", { kind: "web_source", url: "javascript:alert(1)" }], ["provenance", { kind: "web_source", url: "/relative" }],
      ["provenance", { kind: "user_provided", extra: "private" }]]) {
      const result = await service.rpc("payr_save_invoice_draft_v1", { ...scope,
        p_input: altered(write({ snapshot: updated }), `snapshot.proposedClientChanges.fields.contactName.${path}`, value) });
      expect(result.error?.message).toBe("INVALID_INPUT");
    }
    expect(counts()).toBe("2,2,2,1");
  });

  it.each([
    "https://source_name.example.test/contact", "http://_source.example.test/", "https://-source-.example.test/",
    "https://source!$&'()*+,;=~.example.test/contact", "https://EXAMPLE.com:000443/contact",
    "http://example.test:00000065535/", "https://example.test:000000/", "https://example.test:/",
    "https://[::1]:0000008080/contact", "https://example.test:" + "0".repeat(100) + "443/",
  ])("accepts registered-name and numeric-port provenance %s through raw RPC", async (url) => {
    expect(new URL(url).username).toBe("");
    expect(new URL(url).password).toBe("");
    const value = newClientSnapshot();
    const provenance = { kind: "web_source" as const, url };
    value.clientProvenance.contactEmail = provenance;
    value.proposedClientChanges.fields.contactEmail!.provenance = provenance;
    const result = await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: write({ snapshot: value }) });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ version: 1, snapshot: value });
    expect(counts()).toBe("1,1,1,1");
  });

  it.each([
    "https://[:::]/", "HTTPS://example.test:99999/", "https://999.999.999.999/", "https://name:password@example.test/",
    "https://example.test:000065536/", "https://[::1]:000065536/", "https://example.test:999999999999999999999/",
    "https://example.test:abc/", "https://example.test:80:90/", "https://:443/", "https:///contact", "https://?query",
    "https://[::1/", "https://[127.0.0.1]/", "https://[::1]extra/", "https://source[bad].test/",
    "https://@example.test/", "https://user@example.test/", "https://source%40example.test/", "https://source|name.test/",
    "https://source name.test/", "https://source\tname.test/", "https://example.test/white space", "https://example.test\\@other.test/",
  ])(
    "rejects invalid web-source URL %s even when the diff and provenance agree", async (url) => {
      const value = snapshot();
      value.client.contactName = "New Contact";
      value.clientProvenance.contactName = { kind: "web_source", url };
      value.proposedClientChanges = { kind: "update", fields: {
        contactName: { value: "New Contact", confirmed: true, provenance: { kind: "web_source", url } },
      } };
      const input = write({ snapshot: value });
      const result = await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: input });
      expect(result.error).toMatchObject({ code: "22023", message: "INVALID_INPUT" });
      expect(result.data).toBeNull();
      expect(counts()).toBe("0,0,0,1");
      expect(await repository.findReplay(actor, input.idempotencyKey, input.requestFingerprint)).toBeNull();
    },
  );

  it("accepts explicit due dates with authoritative null default terms and valid IPv6 provenance", async () => {
    fixture("update public.sender_profiles set default_terms = null;");
    const value = snapshot();
    value.sender = { ...value.sender, defaultPaymentTermsDays: null };
    value.client.contactName = "New Contact";
    value.clientProvenance.contactName = { kind: "web_source", url: "https://[::1]:8080/contact" };
    value.proposedClientChanges = { kind: "update", fields: {
      contactName: { value: "New Contact", confirmed: true, provenance: value.clientProvenance.contactName },
    } };
    expect((await repository.saveDraft(actor, write({ snapshot: value }))).snapshot).toEqual(value);
  });

  it("validates sender-term defaults for new versions while preserving genuine inherited defaults", async () => {
    const value = snapshot();
    value.appliedDefaults.push({ field: "dueDate", value: value.dueDate, source: "sender_terms" });
    const saved = await repository.saveDraft(actor, write({ snapshot: value }));
    fixture("update public.sender_profiles set default_terms = null, revision = 2;");
    value.sender = { ...value.sender, defaultPaymentTermsDays: null, revision: 2 };
    const invalid = write({ snapshot: value });
    expect((await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: invalid })).error?.message).toBe("INVALID_INPUT");
    expect(counts()).toBe("1,1,1,1");
    expect((await repository.saveDraft(actor, write({ draftId: saved.draftId, expectedVersion: 1, snapshot: value }))).version).toBe(2);
    value.appliedDefaults = value.appliedDefaults.filter((entry) => entry.field !== "dueDate");
    expect((await repository.saveDraft(actor, { ...invalid, snapshot: value })).version).toBe(1);
    expect(counts()).toBe("2,3,3,1");
  });

  it("preserves exact uint256 maximum and rejects overflow and fractional atomic transport", async () => {
    const max = snapshot();
    max.amountAtomic = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    max.amountDecimal = "115792089237316195423570985008687907853269984665640564039457.584007913129639935";
    max.items = [{ description: "Maximum", amountAtomic: max.amountAtomic, amountDecimal: max.amountDecimal }];
    const saved = await repository.saveDraft(actor, write({ snapshot: max }));
    expect(saved.snapshot.amountAtomic).toBe(max.amountAtomic);
    expect((await repository.listInvoices(actor, { search: "", commercialState: null, limit: 50, offset: 0 })).items[0].amountAtomic).toBe(max.amountAtomic);
    for (const atomic of [String(BigInt(max.amountAtomic) + 1n), "1.5", "1e18", "Infinity", "NaN", "-1", "0"]) {
      const invalid = { ...max, amountAtomic: atomic, items: [{ ...max.items[0], amountAtomic: atomic }] };
      expect((await service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: write({ snapshot: invalid }) })).error?.message).toBe("INVALID_INPUT");
    }
    expect(counts()).toBe("1,1,1,1");
  });

  it("protects business/snapshot facts from updates/deletes while allowing one-way publication metadata", async () => {
    const saved = await repository.saveDraft(actor, write());
    for (const assignment of ["memo = 'changed'", "draft_snapshot = null", "version_number = 2", "amount_atomic = 2",
      "created_at = created_at + interval '1 second'", "sender_snapshot = '{}'", "payee = '0x" + "2".repeat(40) + "'"])
      expectFixtureFailure(`update public.invoice_versions set ${assignment} where id = '${saved.id}';`, "DRAFT_VERSION_IMMUTABLE");
    expectFixtureFailure(`delete from public.invoice_versions where id = '${saved.id}';`, "DRAFT_VERSION_IMMUTABLE");
    fixture(`update public.invoice_versions set chain_id = 5042002, contract_address = '${owner}' where id = '${saved.id}';`);
    expectFixtureFailure(`update public.invoice_versions set chain_id = 1 where id = '${saved.id}';`, "DRAFT_VERSION_IMMUTABLE");
    fixture(`update public.invoice_versions set frozen_at = clock_timestamp() where id = '${saved.id}';`);
    expectFixtureFailure(`update public.invoice_versions set frozen_at = frozen_at where id = '${saved.id}';`, "FROZEN_INVOICE_VERSION");
    expect((await repository.getInvoiceDetail(actor, saved.draftId))?.version).toEqual(saved);
    await expect(repository.saveDraft(actor, write({ draftId: saved.draftId, expectedVersion: 1 }))).rejects.toMatchObject({ code: "DRAFT_NOT_EDITABLE" });
  });

  it("enforces duplicate column agreement and scoped invoice foreign keys on direct postgres fixtures", async () => {
    const saved = await repository.saveDraft(actor, write());
    expectFixtureFailure(`insert into public.invoice_versions select (jsonb_populate_record(null::public.invoice_versions,
      to_jsonb(v) || jsonb_build_object('id',gen_random_uuid(),'version_number',2,'memo','mismatch'))).* from public.invoice_versions v;`, "DRAFT_SNAPSHOT_MISMATCH");
    const other = randomUUID();
    fixture(`insert into public.workspaces (id,owner_wallet) values ('${other}','0x${"2".repeat(40)}');`);
    expectFixtureFailure(`insert into public.invoice_versions select (jsonb_populate_record(null::public.invoice_versions,
      to_jsonb(v) || jsonb_build_object('id',gen_random_uuid(),'workspace_id','${other}'))).* from public.invoice_versions v;`, "invoice_versions_invoice_fk");
    expect(counts()).toBe("1,1,1,1");
    expect((await repository.getInvoiceDetail(actor, saved.draftId))?.version).toEqual(saved);
  });

  it("serializes a profile edit ahead of the draft and returns PROFILE_CONFLICT without consuming the key", async () => {
    const input = write();
    await transaction(`update public.sender_profiles set revision = 2 where id = '${senderId}'`, async (pid, commit) => {
      const result = service.rpc("payr_save_invoice_draft_v1", { ...scope, p_input: input }).then((value) => value);
      await waitForWaiter(pid); await commit();
      expect((await result).error?.message).toBe("PROFILE_CONFLICT");
    });
    expect(counts()).toBe("0,0,0,1");
    input.snapshot.sender = { ...input.snapshot.sender, revision: 2 };
    expect(await repository.saveDraft(actor, input)).toMatchObject({ version: 1 });
  });

  it("waits for revocation and never writes using a now-revoked connector", async () => {
    const token = connector();
    await transaction(`update public.connector_tokens set revoked_at = clock_timestamp() where id = '${token.connectorId}'`, async (pid, commit) => {
      const result = service.rpc("payr_save_invoice_draft_v1", { ...scope, p_owner_wallet: null, p_connector_id: token.connectorId, p_input: write() }).then((value) => value);
      await waitForWaiter(pid); await commit();
      expect((await result).error?.message).toBe("NOT_FOUND");
    });
    expect(counts()).toBe("0,0,0,1");
  });

  it("holds the connector lock through mutation so revocation cannot slip between admission and commit", async () => {
    const token = connector();
    await transaction(`select 1 from public.sender_profiles where id = '${senderId}' for update`, async (pid, commit) => {
      const save = repository.saveDraft(token, write());
      await waitForWaiter(pid);
      const revoke = service.rpc("payr_revoke_connector_v1", { p_workspace_id: workspaceId, p_owner_wallet: owner, p_id: token.connectorId }).then((value) => value);
      await commit();
      expect(await save).toMatchObject({ version: 1 });
      expect((await revoke).error).toBeNull();
    });
    await expect(repository.getOverview(token)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rechecks connector expiry after a profile lock wait", async () => {
    const token = connector("clock_timestamp() + interval '700 milliseconds'");
    await transaction(`select 1 from public.sender_profiles where id = '${senderId}' for update`, async (pid, commit) => {
      const result = service.rpc("payr_save_invoice_draft_v1", { ...scope, p_owner_wallet: null, p_connector_id: token.connectorId, p_input: write() }).then((value) => value);
      await waitForWaiter(pid); await new Promise((resolve) => setTimeout(resolve, 750)); await commit();
      expect((await result).error?.message).toBe("NOT_FOUND");
    });
    expect(counts()).toBe("0,0,0,1");
  });

  it("uses exactly one real owner/connector and makes every unauthorized RPC indistinguishable", async () => {
    const token = connector();
    const saved = await repository.saveDraft(token, write());
    const calls: Record<string, Record<string, unknown>> = {
      payr_find_draft_replay_v1: { p_idempotency_key: "unused", p_request_fingerprint: "a".repeat(64) },
      payr_get_draft_context_v1: { p_draft_id: saved.draftId, p_client_id: clientId, p_client_alias: null },
      payr_save_invoice_draft_v1: { p_input: write() },
      payr_list_invoices_v1: { p_search: "", p_commercial_state: null, p_limit: 50, p_offset: 0 },
      payr_get_invoice_detail_v1: { p_invoice_id: saved.draftId }, payr_get_invoice_overview_v1: {},
    };
    fixture(`update public.connector_tokens set revoked_at = clock_timestamp() where id = '${token.connectorId}';`);
    for (const unauthorized of [
      { p_owner_wallet: owner, p_connector_id: token.connectorId }, { p_owner_wallet: null, p_connector_id: null },
      { p_owner_wallet: `0x${"2".repeat(40)}`, p_connector_id: null }, { p_owner_wallet: null, p_connector_id: randomUUID() },
      { p_owner_wallet: null, p_connector_id: token.connectorId }, { p_workspace_id: randomUUID() },
    ]) for (const [name, args] of Object.entries(calls)) {
      expect((await service.rpc(name, { ...scope, ...unauthorized, ...args })).error, name)
        .toMatchObject({ code: "P0001", message: "NOT_FOUND", details: null });
    }
    expect(counts()).toBe("1,1,1,1");
  });

  it("separates tenant keys and treats foreign invoice/client IDs just like missing IDs", async () => {
    const input = write();
    const saved = await repository.saveDraft(actor, input);
    const workspaceB = randomUUID(), senderB = randomUUID(), clientB = randomUUID();
    const ownerB = `0x${"2".repeat(40)}`;
    fixture(`insert into public.workspaces (id,owner_wallet) values ('${workspaceB}','${ownerB}');
      insert into public.sender_profiles select (jsonb_populate_record(null::public.sender_profiles,
        to_jsonb(s) || jsonb_build_object('id','${senderB}','workspace_id','${workspaceB}','payout_wallet','${ownerB}'))).* from public.sender_profiles s;
      insert into public.clients select (jsonb_populate_record(null::public.clients,
        to_jsonb(c) || jsonb_build_object('id','${clientB}','workspace_id','${workspaceB}'))).* from public.clients c;`);
    const other: InvoiceActor = { workspaceId: workspaceB, ownerWallet: ownerB, connectorId: null };
    expect(await repository.findReplay(other, input.idempotencyKey, input.requestFingerprint)).toBeNull();
    const second = snapshot();
    second.sender = { ...second.sender, id: senderB, payoutWallet: ownerB };
    second.clientReference.id = clientB;
    const own = await repository.saveDraft(other, { ...input, snapshot: second });
    expect(own.draftId).not.toBe(saved.draftId);
    for (const id of [saved.draftId, randomUUID()]) {
      expect(await repository.getInvoiceDetail(other, id)).toBeNull();
      await expect(repository.getContext(other, { draftId: id, clientId: null, clientAlias: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(repository.saveDraft(other, write({ draftId: id, expectedVersion: 1, snapshot: second }))).rejects.toMatchObject({ code: "NOT_FOUND", details: {} });
    }
    for (const id of [clientId, randomUUID()]) {
      await expect(repository.getContext(other, { draftId: null, clientId: id, clientAlias: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(repository.saveDraft(other, write({ snapshot: { ...second, clientReference: { ...second.clientReference, id } } })))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect((await repository.listInvoices(other, { search: "", commercialState: null, limit: 50, offset: 0 })).items.map((item) => item.id)).toEqual([own.draftId]);
    expect((await repository.getOverview(other)).invoiceCount).toBe(1);
    expect(counts()).toBe("2,2,2,2");
  });

  it("resolves case-sensitive aliases, rejects ID/alias disagreement, and leaves unknown aliases pending", async () => {
    expect((await repository.getContext(actor, { draftId: null, clientId: null, clientAlias: "client" })).client?.id).toBe(clientId);
    expect((await repository.getContext(actor, { draftId: null, clientId: null, clientAlias: "Client" })).client).toBeNull();
    await expect(repository.getContext(actor, { draftId: null, clientId, clientAlias: "Client" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(counts()).toBe("0,0,0,1");
  });

  it("requires status scope for projections and draft scope for context/replay/mutation", async () => {
    const token = connector();
    const input = write();
    const saved = await repository.saveDraft(actor, input);
    const fixed = "array['invoice:draft','invoice:publish','invoice:status','invoice:void']::text[]";
    // Restricted scopes cannot be issued by F2. This fixture exercises defense in depth for future tokens.
    fixture("alter table public.connector_tokens drop constraint connector_tokens_fixed_scopes;");
    try {
      fixture(`update public.connector_tokens set scopes = array['invoice:status'] where id = '${token.connectorId}';`);
      expect((await repository.listInvoices(token, { search: "", commercialState: null, limit: 50, offset: 0 })).items).toHaveLength(1);
      expect(await repository.getInvoiceDetail(token, saved.draftId)).not.toBeNull();
      expect((await repository.getOverview(token)).invoiceCount).toBe(1);
      await expect(repository.findReplay(token, input.idempotencyKey, input.requestFingerprint)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(repository.getContext(token, { draftId: null, clientId: null, clientAlias: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(repository.saveDraft(token, write())).rejects.toMatchObject({ code: "NOT_FOUND" });
      fixture(`update public.connector_tokens set scopes = array['invoice:draft'] where id = '${token.connectorId}';`);
      expect(await repository.findReplay(token, input.idempotencyKey, input.requestFingerprint)).toEqual(saved);
      expect((await repository.getContext(token, { draftId: saved.draftId, clientId: null, clientAlias: null })).previous).toEqual(saved);
      expect(await repository.saveDraft(token, write())).toMatchObject({ version: 1 });
      await expect(repository.listInvoices(token, { search: "", commercialState: null, limit: 50, offset: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(repository.getInvoiceDetail(token, saved.draftId)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(repository.getOverview(token)).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      fixture(`update public.connector_tokens set scopes = ${fixed};
        alter table public.connector_tokens add constraint connector_tokens_fixed_scopes check (scopes = ${fixed});`);
    }
  });

  it("bounds SQL list pages to fifty plus hasMore, uses literal search, and rejects invalid query enums", async () => {
    fixture(`insert into public.invoices (id,workspace_id) select gen_random_uuid(),'${workspaceId}' from generate_series(1,52);`);
    const first = await repository.listInvoices(actor, { search: "", commercialState: "draft", limit: 50, offset: 0 });
    const second = await repository.listInvoices(actor, { search: "", commercialState: null, limit: 50, offset: 50 });
    expect(first.items).toHaveLength(50); expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(2); expect(second.hasMore).toBe(false);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(52);
    for (const query of [{ p_limit: 51 }, { p_limit: 0 }, { p_limit: null }, { p_offset: -1 }, { p_offset: null },
      { p_commercial_state: "paid" }, { p_commercial_state: "Published" }, { p_search: null }, { p_search: "x".repeat(201) }]) {
      expect((await service.rpc("payr_list_invoices_v1", { ...scope, p_search: "", p_commercial_state: null, p_limit: 50, p_offset: 0, ...query })).error?.message).toBe("INVALID_INPUT");
    }
    expect((await repository.listInvoices(actor, { search: "%", commercialState: null, limit: 50, offset: 0 })).items).toEqual([]);
    expect((await repository.getOverview(actor)).attention).toHaveLength(50);
    expect((await repository.getInvoiceDetail(actor, first.items[0].id))?.version).toBeNull();
  });

  it("derives effective commercial/payment/display states independently and exposes only real settlement proof", async () => {
    const draft = await repository.saveDraft(actor, write());
    const invoiceIds: string[] = [];
    for (const [index, state] of ["published", "voided", "expired", "published"].entries()) {
      const id = randomUUID(), versionId = randomUUID(); invoiceIds.push(id);
      const deadline = index === 2 || index === 3 ? "clock_timestamp() - interval '1 day'" : "clock_timestamp() + interval '30 days'";
      fixture(`insert into public.invoices (id,workspace_id,client_id,commercial_state,invoice_number,published_at,payable_until,voided_at,expired_at)
        values ('${id}','${workspaceId}','${clientId}','${state}','PAYR-${index}',clock_timestamp() - interval '40 days',${deadline},
          ${state === "voided" ? "clock_timestamp()" : "null"},${state === "expired" ? "clock_timestamp()" : "null"});
        insert into public.invoice_versions (id,workspace_id,invoice_id,version_number,client_snapshot,issue_date,due_date,
          payable_until,payable_until_second,amount_decimal,amount_atomic)
        values ('${versionId}','${workspaceId}','${id}',1,'{"businessName":"F1 Client"}',current_date - 40,current_date - 35,
          date_trunc('second',${deadline}),extract(epoch from date_trunc('second',${deadline}))::bigint,'2',2000000000000000000);`);
    }
    const page = await repository.listInvoices(actor, { search: "", commercialState: null, limit: 50, offset: 0 });
    for (const [index, expected] of ["published", "voided", "expired", "expired"].entries())
      expect(page.items.find((item) => item.id === invoiceIds[index])).toMatchObject({ commercialState: expected, paymentStatus: "unpaid" });
    const expired = await repository.listInvoices(actor, { search: "payr", commercialState: "expired", limit: 50, offset: 0 });
    expect(expired.items).toHaveLength(2);
    expect((await repository.getInvoiceDetail(actor, invoiceIds[0]))?.version).toBeNull();
    const overview = await repository.getOverview(actor);
    expect(overview).toMatchObject({ receivablesAtomic: "6000000000000000000", latestSettlement: null, draftCount: 1 });
    expect(overview.attention.map((item) => item.commercialState)).toEqual(["expired", "expired", "published", "draft"]);
    expect(overview.attention.at(-1)?.id).toBe(draft.draftId);

    // Settlement is an actual immutable F1 row. No status is inferred from an attempt, link, or client claim.
    const paidId = invoiceIds[1], attempt = randomUUID();
    const hash = `0x${"a".repeat(64)}`;
    fixture(`insert into public.publication_attempts (id,workspace_id,invoice_id,invoice_version_id,state,request_fingerprint,
      sequence_year,sequence_value,invoice_number,invoice_key,publication_salt,storage_key,invoice_token_id,invoice_key_version,
      invoice_verifier_hash,invoice_link_expires_at,invoice_data_hash,pdf_content_hash,document_commitment,pdf_filename,
      pdf_byte_length,pdf_content_type,stored_at,finalized_at)
      select '${attempt}','${workspaceId}','${paidId}',v.id,'finalized',repeat('a',64),2026,1,'PAYR-1','${hash}','${hash}',
        'private-storage-key',gen_random_uuid(),1,repeat('b',64),now() + interval '1 day','${hash}','${hash}','${hash}',
        'private.pdf',100,'application/pdf',now(),now() from public.invoice_versions v where v.invoice_id = '${paidId}';
      insert into public.settlements (id,workspace_id,invoice_id,invoice_version_id,publication_attempt_id,chain_id,contract_address,
        invoice_key,transaction_hash,log_index,block_number,block_time,document_commitment,payer,payee,amount_atomic)
      select gen_random_uuid(),'${workspaceId}','${paidId}',v.id,'${attempt}',5042002,'${owner}','${hash}','${hash}',0,
        9007199254740993,now(),'${hash}','${owner}','${owner}',2000000000000000000 from public.invoice_versions v where v.invoice_id = '${paidId}';`);
    expect((await repository.getInvoiceDetail(actor, paidId))?.invoice).toMatchObject({ commercialState: "voided", paymentStatus: "paid", displayStatus: "Paid" });
    const settledOverview = await repository.getOverview(actor);
    expect(settledOverview.latestSettlement).toMatchObject({ invoiceId: paidId, invoiceNumber: "PAYR-1", transactionHash: hash, amountDecimal: "2" });
    expect(JSON.stringify(settledOverview)).not.toMatch(/private-storage-key|private\.pdf|verifier|publicationSalt|tokenHash/);
  });

  it("computes setup from actual nullable profiles, saved clients, and active credentials", async () => {
    const active = connector(); connector("clock_timestamp() + interval '1 day'");
    fixture(`update public.connector_tokens set revoked_at = clock_timestamp() where id <> '${active.connectorId}';
      insert into public.connector_tokens (id,workspace_id,token_hash,created_at,expires_at)
        values (gen_random_uuid(),'${workspaceId}',repeat('c',64),now() - interval '2 days',now() - interval '1 day');`);
    expect(await repository.getOverview(actor)).toMatchObject({ senderComplete: true, clientCount: 1, activeConnectorCount: 1, latestSettlement: null });
    fixture("update public.sender_profiles set contact_email = null; delete from public.clients;");
    expect(await repository.getOverview(actor)).toMatchObject({ senderComplete: false, clientCount: 0, activeConnectorCount: 1 });
    fixture("delete from public.sender_profiles;");
    expect((await repository.getOverview(actor)).senderComplete).toBe(false);
    expect((await repository.getContext(actor, { draftId: null, clientId: null, clientAlias: null })).sender).toBeNull();
  });

  it("keeps every new function private, security definer, empty-search-path, and all F1/F2 grants intact", async () => {
    const names = ["payr_draft_scope_v1", "payr_draft_text_v1", "payr_draft_country_v1", "payr_profile_country_guard_v1",
      "payr_draft_billing_v1", "payr_draft_provenance_v1", "payr_draft_money_v1",
      "payr_draft_snapshot_valid_v1", "payr_draft_protect_version_v1", "payr_draft_version_dto_v1", "payr_find_draft_replay_v1",
      "payr_get_draft_context_v1", "payr_save_invoice_draft_v1", "payr_invoice_summary_v1", "payr_invoice_summaries_v1",
      "payr_list_invoices_v1", "payr_get_invoice_detail_v1", "payr_get_invoice_overview_v1"];
    const functions: Array<{ name: string; args: Record<string, null>; secure: boolean; service: boolean }> = JSON.parse(fixture(`
      select jsonb_agg(jsonb_build_object('name',p.proname,'args',coalesce((select jsonb_object_agg(k,null)
        from unnest(p.proargnames[1:p.pronargs]) as k),'{}'::jsonb),'secure',p.prosecdef and p.proconfig = array['search_path=""']
        and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute'),
        'service',has_function_privilege('service_role',p.oid,'execute')))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${names.map((name) => `'${name}'`).join(",")});`));
    expect(functions).toHaveLength(names.length);
    expect(functions.every((fn) => fn.secure)).toBe(true);
    expect(functions.filter((fn) => fn.service).map((fn) => fn.name).sort()).toEqual([
      "payr_find_draft_replay_v1", "payr_get_draft_context_v1", "payr_save_invoice_draft_v1", "payr_list_invoices_v1",
      "payr_get_invoice_detail_v1", "payr_get_invoice_overview_v1",
    ].sort());
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const authenticated = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const credentials = { email: `r04-${randomUUID()}@example.test`, password: randomUUID() };
    const user = await service.auth.admin.createUser({ ...credentials, email_confirm: true });
    expect(user.error).toBeNull();
    try {
      expect((await authenticated.auth.signInWithPassword(credentials)).error).toBeNull();
      for (const client of [anon, authenticated]) for (const fn of functions) {
        const result = await client.rpc(fn.name, fn.args);
        expect(["42501", "PGRST202"], fn.name).toContain(result.error?.code);
        expect(result.data).toBeNull();
      }
    } finally { if (user.data.user) await service.auth.admin.deleteUser(user.data.user.id); }
    expect(fixture(`select bool_and(has_function_privilege('service_role',p.oid,'execute')) from pg_proc p
      where p.proname in ('payr_allocate_invoice_sequence_v1','payr_record_settlement_v1','payr_save_sender_profile_v1',
        'payr_revoke_connector_v1','payr_admit_connector_v1','payr_issue_auth_nonce_v1');`)).toBe("t");
    expect(fixture(`select has_table_privilege('service_role','public.invoice_versions','select')
      and not has_table_privilege('service_role','public.invoice_versions','insert,update,delete');`)).toBe("t");
  });
});
