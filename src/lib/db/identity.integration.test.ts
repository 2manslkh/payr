import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { CONNECTOR_SCOPES, type AuthNonce, type IdentitySession } from "../identity/contracts";
import { createIdentityRepository } from "./identity";

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const repository = createIdentityRepository(service);
const owner = `0x${"1".repeat(40)}`;
const otherOwner = `0x${"2".repeat(40)}`;
const senderInput = {
  expectedRevision: 1, businessName: "Example Studio", billingAddress: {
    line1: "1 Test Road", city: "London", postalCode: "N1 1AA", countryCode: "GB",
  }, contactName: "Example Owner", contactEmail: "owner@example.test", invoicePrefix: "PAYR", defaultPaymentTermsDays: 30,
};
const clientInput = {
  id: null, expectedRevision: null, alias: "example", businessName: "Example Client",
  billingAddress: senderInput.billingAddress, contactName: "Example Client", contactEmail: "client@example.test",
};

// Postgres is only the local fixture/constraint seam, never the runtime adapter.
function fixture(sql: string): string {
  const database = new URL(process.env.SUPABASE_DB_URL!);
  if (process.env.SUPABASE_URL !== "http://127.0.0.1:57321"
    || database.protocol !== "postgresql:" || database.hostname !== "127.0.0.1"
    || database.port !== "57322" || database.username !== "postgres" || database.pathname !== "/postgres") {
    throw new Error("Identity fixtures require local Payr on 5732x");
  }
  return execFileSync("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

async function withFixtureLock<T>(sql: string, operation: () => Promise<T>): Promise<T> {
  fixture("select 1;"); // Enforce the same local-only guard before opening a fixture transaction.
  const child = spawn("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (data) => { if (String(data).includes("locked")) resolve(); });
    child.on("error", reject);
    child.on("exit", (code) => { if (code !== 0) reject(new Error("Local fixture lock failed")); });
  });
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Local fixture lock failed")));
  });
  child.stdin.end(`begin; ${sql}; select 'locked'; select pg_sleep(0.5); commit;`);
  await ready;
  try { return await operation(); } finally { await finished; }
}

function expectFixtureFailure(sql: string, marker: string) {
  try { fixture(sql); } catch (error) {
    expect(String((error as { stderr: unknown }).stderr)).toContain(marker);
    return;
  }
  throw new Error(`Expected fixture constraint ${marker}`);
}

function nonce(changes: Partial<AuthNonce> = {}): AuthNonce {
  const now = Date.now() - 100;
  return {
    id: randomUUID(), workspaceId: null, wallet: owner, purpose: "payr-login-v1",
    challenge: randomBytes(32).toString("base64url"), domain: "payr.example", uri: "https://payr.example",
    chainId: 5042002, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300_000).toISOString(),
    consumedAt: null, payoutFrom: null, payoutTo: null, profileRevision: null, ...changes,
  };
}

async function login(wallet = owner) {
  const issued = await repository.issueNonce(nonce({ wallet }));
  return repository.completeLogin(issued.id, wallet);
}

async function token(identity: IdentitySession) {
  const input = { id: randomUUID(), tokenHash: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
  const metadata = await repository.createConnector(identity, input);
  return { ...input, metadata };
}

async function avoidMinuteBoundary() {
  const seconds = Number(fixture("select extract(second from clock_timestamp());"));
  if (seconds > 57) await new Promise((resolve) => setTimeout(resolve, (60 - seconds) * 1000 + 20));
}

describe("F2 identity transactions through Supabase", () => {
  beforeEach(() => fixture("truncate public.connector_ip_rate_limits, public.workspaces cascade;"));

  it("round-trips signed facts and consumes one nonce exactly once with initial owner payout", async () => {
    const input = nonce();
    const issued = await repository.issueNonce(input);
    expect(issued).toEqual(input);
    expect(await repository.findNonce(input.id)).toEqual(input);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => repository.completeLogin(input.id, owner)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "NONCE_INVALID_OR_USED", status: 400 });
    }
    const identity = await login();
    expect(await repository.getProfile(identity)).toEqual({
      id: expect.any(String), revision: 1, businessName: null, billingAddress: null, contactName: null,
      contactEmail: null, payoutWallet: owner, invoicePrefix: null, defaultPaymentTermsDays: null,
    });
    expect((await repository.findNonce(input.id))?.consumedAt).not.toBeNull();
    await expect(repository.completeLogin(input.id, owner)).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
    expect(await repository.findNonce(randomUUID())).toBeNull();
  });

  it("saves profiles and clients with CAS and server-confirmed provenance, never payout", async () => {
    const identity = await login();
    const saves = await Promise.allSettled([repository.saveProfile(identity, senderInput), repository.saveProfile(identity, senderInput)]);
    expect(saves.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(saves.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { code: "REVISION_CONFLICT", status: 409 } });
    expect(await repository.getProfile(identity)).toMatchObject({ revision: 2, payoutWallet: owner, defaultPaymentTermsDays: 30 });
    const client = await repository.saveClient(identity, clientInput);
    expect(client).toMatchObject({ revision: 1, alias: "example", provenance: {
      alias: { kind: "user_provided", confirmed: true }, businessName: { kind: "user_provided", confirmed: true },
      billingAddress: { kind: "user_provided", confirmed: true }, contactName: { kind: "user_provided", confirmed: true },
      contactEmail: { kind: "user_provided", confirmed: true },
    } });
    const input = { ...clientInput, id: client.id, expectedRevision: 1, alias: "changed" };
    const updates = await Promise.allSettled([repository.saveClient(identity, input), repository.saveClient(identity, input)]);
    expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(updates.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
    expect(await repository.listClients(identity)).toEqual([expect.objectContaining({ id: client.id, revision: 2, alias: "changed" })]);
  });

  it("binds payout to the exact owner, workspace, old/new payout and revision and rejects replay", async () => {
    const identity = await login();
    const input = nonce({ purpose: "payr-payout-change-v1", workspaceId: identity.workspaceId,
      payoutFrom: owner, payoutTo: otherOwner, profileRevision: 1 });
    await expect(repository.issueNonce({ ...input, wallet: otherOwner })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.issueNonce({ ...input, payoutFrom: `0x${"3".repeat(40)}` })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(repository.issueNonce({ ...input, profileRevision: 2 })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await repository.issueNonce(input);
    await expect(repository.applyPayoutChange({ ...identity, ownerWallet: otherOwner }, input.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => repository.applyPayoutChange(identity, input.id)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await repository.getProfile(identity)).toMatchObject({ payoutWallet: otherOwner, revision: 2 });
    await expect(repository.applyPayoutChange(identity, input.id)).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
    const stale = await repository.issueNonce(nonce({ purpose: "payr-payout-change-v1", workspaceId: identity.workspaceId,
      payoutFrom: otherOwner, payoutTo: owner, profileRevision: 2 }));
    await repository.saveProfile(identity, { ...senderInput, expectedRevision: 2 });
    await expect(repository.applyPayoutChange(identity, stale.id)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect((await repository.findNonce(stale.id))?.consumedAt).toBeNull();
  });

  it("creates metadata-only fixed-scope connectors, admits supported operations and revokes idempotently", async () => {
    const identity = await login();
    const created = await token(identity);
    expect(created.metadata).toEqual({ id: created.id, createdAt: expect.any(String), expiresAt: expect.any(String),
      revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES });
    expect(await repository.listConnectors(identity)).toEqual([created.metadata]);
    expect(await repository.findConnector(created.id)).toEqual({ ...created.metadata, workspaceId: identity.workspaceId, tokenHash: created.tokenHash });
    expect(await repository.findConnector(randomUUID())).toBeNull();
    const input = { id: created.id, tokenHash: created.tokenHash, ipHash: randomBytes(32).toString("hex"), action: "invoice:draft" };
    await expect(repository.admitConnector({ ...input, action: "profile:save" })).resolves.toEqual({ outcome: "denied" });
    await expect(repository.admitConnector({ ...input, tokenHash: "0".repeat(64) })).resolves.toEqual({ outcome: "denied" });
    for (const action of CONNECTOR_SCOPES) {
      await expect(repository.admitConnector({ ...input, action })).resolves.toEqual({ outcome: "allowed", workspaceId: identity.workspaceId, tokenId: created.id });
    }
    const revocations = await Promise.all(Array.from({ length: 5 }, () => repository.revokeConnector(identity, created.id)));
    expect(revocations.every((value) => value.revokedAt === revocations[0].revokedAt && value.revokedAt !== null)).toBe(true);
    await expect(repository.admitConnector(input)).resolves.toEqual({ outcome: "denied" });
    const events = await repository.listActivity(identity);
    expect(events.filter((event) => event.action === "connector.revoke")).toHaveLength(1);
    expect(events.every((event) => Object.keys(event).sort().join() === "action,createdAt,id,outcome,tokenId")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(created.tokenHash);
    expect(JSON.stringify(events)).not.toContain(input.ipHash);
  });

  it("enforces 60 concurrent admissions per token with bounded rejected counters", async () => {
    await avoidMinuteBoundary();
    const identity = await login();
    const created = await token(identity);
    const input = { id: created.id, tokenHash: created.tokenHash, ipHash: randomBytes(32).toString("hex"), action: "invoice:status" };
    const results = await Promise.all(Array.from({ length: 80 }, () => repository.admitConnector(input)));
    expect(results.filter((value) => value.outcome === "allowed")).toHaveLength(60);
    expect(results.filter((value) => value.outcome === "rate_limited")).toHaveLength(20);
    for (const result of results) if (result.outcome === "rate_limited") {
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
    const counts = await service.from("connector_rate_limits").select("request_count").eq("connector_token_id", created.id);
    expect(counts.error).toBeNull();
    expect(counts.data).toEqual([{ request_count: 60 }]);
  });

  it("shares the 120/IP limit across different tokens and workspaces", async () => {
    await avoidMinuteBoundary();
    const identities = await Promise.all([login(), login(otherOwner), login(`0x${"3".repeat(40)}`)]);
    const tokens = await Promise.all(identities.map(token));
    const ipHash = randomBytes(32).toString("hex");
    const results = await Promise.all(Array.from({ length: 150 }, (_, index) => {
      const created = tokens[index % 3];
      return repository.admitConnector({ id: created.id, tokenHash: created.tokenHash, ipHash, action: "invoice:status" });
    }));
    expect(results.filter((value) => value.outcome === "allowed")).toHaveLength(120);
    expect(results.filter((value) => value.outcome === "rate_limited")).toHaveLength(30);
    const count = await service.from("connector_ip_rate_limits").select("request_count").eq("subject_hash", ipHash);
    expect(count.error).toBeNull();
    expect(count.data).toEqual([{ request_count: 120 }]);
  });

  it("rolls back nonce, workspace, profile and audit if login's final audit fails", async () => {
    const input = await repository.issueNonce(nonce());
    await expect(repository.completeLogin(input.id, otherOwner)).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
    fixture("alter table public.audit_events add constraint identity_fixture_fail check (action <> 'auth.login') not valid;");
    try {
      await expect(repository.completeLogin(input.id, owner)).rejects.toMatchObject({ code: "DATABASE_ERROR" });
      expect((await repository.findNonce(input.id))?.consumedAt).toBeNull();
      for (const table of ["workspaces", "sender_profiles", "audit_events"]) {
        const rows = await service.from(table).select("id");
        expect(rows.error).toBeNull();
        expect(rows.data).toEqual([]);
      }
    } finally { fixture("alter table public.audit_events drop constraint identity_fixture_fail;"); }
    const identity = await repository.completeLogin(input.id, owner);
    expect(await repository.getProfile(identity)).toMatchObject({ payoutWallet: owner });
  });

  it("rolls back payout consumption and revision if the audit fails", async () => {
    const identity = await login();
    const input = await repository.issueNonce(nonce({ purpose: "payr-payout-change-v1", workspaceId: identity.workspaceId,
      payoutFrom: owner, payoutTo: otherOwner, profileRevision: 1 }));
    fixture("alter table public.audit_events add constraint identity_fixture_fail check (action <> 'profile.payout_change') not valid;");
    try {
      await expect(repository.applyPayoutChange(identity, input.id)).rejects.toMatchObject({ code: "DATABASE_ERROR" });
      expect((await repository.findNonce(input.id))?.consumedAt).toBeNull();
      expect(await repository.getProfile(identity)).toMatchObject({ revision: 1, payoutWallet: owner });
    } finally { fixture("alter table public.audit_events drop constraint identity_fixture_fail;"); }
    expect(await repository.applyPayoutChange(identity, input.id)).toMatchObject({ revision: 2, payoutWallet: otherOwner });
  });

  it.each(["login", "payout"])("rejects %s nonce expiry after waiting for a lock, without consuming", async (purpose) => {
    const identity = await login();
    const input = await repository.issueNonce(nonce({ expiresAt: new Date(Date.now() + 250).toISOString(),
      ...(purpose === "payout" ? { purpose: "payr-payout-change-v1", workspaceId: identity.workspaceId,
        payoutFrom: owner, payoutTo: otherOwner, profileRevision: 1 } : {}),
    }));
    await withFixtureLock(`select id from public.auth_nonces where id = '${input.id}' for update`, async () => {
      await expect(purpose === "login" ? repository.completeLogin(input.id, owner) : repository.applyPayoutChange(identity, input.id))
        .rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
    });
    expect((await repository.findNonce(input.id))?.consumedAt).toBeNull();
    expect(await repository.getProfile(identity)).toMatchObject({ revision: 1, payoutWallet: owner });
  });

  it("rejects exact-expiry fixture nonces and preserves immutable signed facts and consumption", async () => {
    const id = randomUUID();
    fixture(`insert into public.auth_nonces (id,wallet,purpose,challenge,domain,uri,chain_id,issued_at,expires_at)
      values ('${id}','${owner}','payr-login-v1','${randomBytes(32).toString("base64url")}','payr.example','https://payr.example',
      5042002,date_trunc('milliseconds',now()) - interval '300 seconds',date_trunc('milliseconds',now()));`);
    await expect(repository.completeLogin(id, owner)).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
    expectFixtureFailure(`update public.auth_nonces set consumed_at = expires_at where id = '${id}';`, "AUTH_NONCE_IMMUTABLE");
    const input = await repository.issueNonce(nonce());
    for (const assignment of ["wallet = '" + otherOwner + "'", "expires_at = expires_at + interval '1 second'", "purpose = 'other'", "challenge = repeat('A',43)"]) {
      expectFixtureFailure(`update public.auth_nonces set ${assignment} where id = '${input.id}';`, "AUTH_NONCE_IMMUTABLE");
    }
    expectFixtureFailure(`delete from public.auth_nonces where id = '${input.id}';`, "AUTH_NONCE_IMMUTABLE");
    const identity = await repository.completeLogin(input.id, owner);
    expectFixtureFailure(`update public.auth_nonces set consumed_at = null where id = '${input.id}';`, "AUTH_NONCE_IMMUTABLE");
    const event = (await repository.listActivity(identity))[0];
    expectFixtureFailure(`update public.audit_events set outcome = 'denied' where id = '${event.id}';`, "AUDIT_EVENT_IMMUTABLE");
    expectFixtureFailure(`delete from public.audit_events where id = '${event.id}';`, "AUDIT_EVENT_IMMUTABLE");
  });

  it("denies all cross-workspace reads and writes with indistinguishable NOT_FOUND", async () => {
    const a = await login();
    const b = await login(otherOwner);
    const client = await repository.saveClient(b, clientInput);
    const created = await token(b);
    const payout = await repository.issueNonce(nonce({ purpose: "payr-payout-change-v1", wallet: otherOwner, workspaceId: b.workspaceId,
      payoutFrom: otherOwner, payoutTo: owner, profileRevision: 1 }));
    const wrong = { workspaceId: b.workspaceId, ownerWallet: owner };
    for (const identity of [wrong, { workspaceId: randomUUID(), ownerWallet: owner }]) {
      for (const operation of [
        () => repository.getProfile(identity), () => repository.listClients(identity), () => repository.listConnectors(identity),
        () => repository.listActivity(identity), () => repository.saveProfile(identity, senderInput),
        () => repository.saveClient(identity, clientInput), () => repository.createConnector(identity, created),
        () => repository.revokeConnector(identity, created.id), () => repository.applyPayoutChange(identity, payout.id),
      ]) await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    }
    for (const id of [client.id, randomUUID()]) {
      await expect(repository.saveClient(a, { ...clientInput, id, expectedRevision: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    for (const id of [created.id, randomUUID()]) {
      await expect(repository.revokeConnector(a, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(repository.createConnector(a, created)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.applyPayoutChange(a, payout.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await repository.listClients(a)).toEqual([]);
    expect(await repository.listConnectors(a)).toEqual([]);
    expect(await repository.getProfile(b)).toMatchObject({ revision: 1, payoutWallet: otherOwner });
  });

  it.each([null, [], "text", 1, true, {}, { expectedRevision: null }])("rejects non-input JSON shapes %j", async (input) => {
    const identity = await login();
    for (const name of ["payr_save_sender_profile_v1", "payr_save_client_v1"]) {
      const result = await service.rpc(name, { p_workspace_id: identity.workspaceId, p_owner_wallet: owner, p_input: input });
      expect(result.error?.message).toBe("INVALID_INPUT");
    }
    expect((await service.rpc("payr_issue_auth_nonce_v1", { p_nonce: input })).error?.message).toBe("INVALID_INPUT");
  });

  it("rejects unknown, missing, null, coerced, oversized and nested hostile save fields", async () => {
    const identity = await login();
    for (const [name, valid] of [["payr_save_sender_profile_v1", senderInput], ["payr_save_client_v1", clientInput]] as const) {
      const invalid = [
        { ...valid, payoutWallet: otherOwner }, { ...valid, ownerWallet: otherOwner }, { ...valid, provenance: {} },
        { ...valid, businessName: null }, { ...valid, businessName: 123 }, { ...valid, businessName: " " },
        { ...valid, businessName: "a".repeat(201) }, { ...valid, contactEmail: "bad..email@example.test" },
        { ...valid, contactEmail: "a'@example.test" }, { ...valid, contactEmail: "\u212a@example.test" },
        { ...valid, businessName: "\u{1f600}".repeat(101) },
        { ...valid, billingAddress: [] }, { ...valid, billingAddress: { ...senderInput.billingAddress, extra: true } },
        { ...valid, billingAddress: { ...senderInput.billingAddress, city: null } },
        { ...valid, billingAddress: { ...senderInput.billingAddress, region: false } },
        { ...valid, billingAddress: { ...senderInput.billingAddress, countryCode: "gb" } },
        { ...valid, expectedRevision: "1" }, { ...valid, expectedRevision: 1.5 },
        { ...valid, expectedRevision: 9007199254740992 },
      ];
      for (const key of Object.keys(valid)) {
        const missing: Record<string, unknown> = { ...valid };
        delete missing[key];
        invalid.push(missing as typeof valid);
      }
      for (const input of invalid) {
        const result = await service.rpc(name, { p_workspace_id: identity.workspaceId, p_owner_wallet: owner, p_input: input });
        expect(result.error?.message, JSON.stringify(input)).toBe("INVALID_INPUT");
      }
    }
    for (const defaultPaymentTermsDays of [null, "30", -1, 366, 1.5]) {
      const result = await service.rpc("payr_save_sender_profile_v1", { p_workspace_id: identity.workspaceId, p_owner_wallet: owner,
        p_input: { ...senderInput, defaultPaymentTermsDays } });
      expect(result.error?.message).toBe("INVALID_INPUT");
    }
    expect(await repository.getProfile(identity)).toMatchObject({ revision: 1, payoutWallet: owner });
    expect(await repository.listClients(identity)).toEqual([]);
  });

  it("normalizes validated billing fields and canonical decimal payment terms", async () => {
    const identity = await login();
    const saved = await repository.saveProfile(identity, { ...senderInput, businessName: "\t\u00a0 Example \n\ufeff", contactEmail: " OWNER@EXAMPLE.TEST ",
      billingAddress: { ...senderInput.billingAddress, line1: "\u00a01 Test Road \ufeff", line2: " ", region: " " }, defaultPaymentTermsDays: 0 });
    expect(saved).toMatchObject({ businessName: "Example", contactEmail: "owner@example.test", defaultPaymentTermsDays: 0,
      billingAddress: { ...senderInput.billingAddress, line2: "", region: "" } });
    const stored = await service.from("sender_profiles").select("default_terms").eq("workspace_id", identity.workspaceId).single();
    expect(stored.data).toEqual({ default_terms: "0" });
    await repository.saveClient(identity, clientInput);
    await expect(repository.saveClient(identity, clientInput)).rejects.toMatchObject({ code: "CLIENT_ALIAS_CONFLICT", status: 409 });
  });

  it("rejects malformed nonce facts and cannot issue consumed, future or overlong nonces", async () => {
    const valid = nonce();
    const invalid: unknown[] = [
      { ...valid, signature: "secret" }, { ...valid, chainId: "5042002" }, { ...valid, chainId: 9007199254740992 },
      { ...valid, id: "11111111-1111-0111-1111-111111111111" },
      { ...valid, chainId: 1.5 }, { ...valid, wallet: otherOwner.toUpperCase() }, { ...valid, consumedAt: valid.issuedAt },
      { ...valid, purpose: "invoice:publish" }, { ...valid, workspaceId: randomUUID() }, { ...valid, payoutFrom: owner },
      { ...valid, payoutTo: otherOwner }, { ...valid, profileRevision: 1 }, { ...valid, challenge: "B".repeat(43) },
      { ...valid, uri: "https://payr.example/api/mcp/secret" }, { ...valid, domain: "payr.example\nmessage" },
      { ...valid, expiresAt: new Date(Date.now() + 301_000).toISOString() },
      { ...valid, issuedAt: new Date(Date.now() + 1_000).toISOString() },
      { ...valid, expiresAt: valid.issuedAt }, { ...valid, expiresAt: "infinity" },
    ];
    for (const key of Object.keys(valid)) {
      const missing: Record<string, unknown> = { ...valid };
      delete missing[key]; invalid.push(missing);
    }
    for (const input of invalid) {
      expect((await service.rpc("payr_issue_auth_nonce_v1", { p_nonce: input })).error?.message, JSON.stringify(input)).toBe("INVALID_INPUT");
    }
    expect(await repository.findNonce(valid.id)).toBeNull();
  });

  it("enforces token lifetime bounds and exact expiry, including expiry during lock waits", async () => {
    const identity = await login();
    for (const expiresAt of [new Date(Date.now()).toISOString(), new Date(Date.now() + 31 * 86_400_000).toISOString(), "infinity"]) {
      await expect(repository.createConnector(identity, { id: randomUUID(), tokenHash: randomBytes(32).toString("hex"), expiresAt }))
        .rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    const created = await token(identity);
    const input = { id: created.id, tokenHash: created.tokenHash, ipHash: randomBytes(32).toString("hex"), action: "invoice:draft" };
    await withFixtureLock(`update public.connector_tokens set expires_at = clock_timestamp() + interval '250 milliseconds' where id = '${created.id}'`, async () => {
      expect(await repository.admitConnector(input)).toEqual({ outcome: "denied" });
    });
    expect((await repository.findConnector(created.id))?.lastUsedAt).toBeNull();
    expect(await repository.admitConnector(input)).toEqual({ outcome: "denied" });
  });

  it("rechecks a changed hash under the token lock and redacts hostile audit actions", async () => {
    const identity = await login();
    const created = await token(identity);
    const input = { id: created.id, tokenHash: created.tokenHash, ipHash: randomBytes(32).toString("hex"), action: "invoice:draft" };
    await withFixtureLock(`update public.connector_tokens set token_hash = '${randomBytes(32).toString("hex")}' where id = '${created.id}'`, async () => {
      expect(await repository.admitConnector(input)).toEqual({ outcome: "denied" });
    });
    await repository.admitConnector({ ...input, action: "https://payr.example/api/mcp/raw-token" });
    const activity = await repository.listActivity(identity);
    expect(activity[0]).toMatchObject({ action: "connector.admit", outcome: "denied" });
    expect(JSON.stringify(activity)).not.toContain("raw-token");
  });

  it("caps activity at the newest 100 redacted events and denies direct runtime writes", async () => {
    const identity = await login();
    fixture(`insert into public.audit_events (id,workspace_id,action,outcome,created_at)
      select gen_random_uuid(),'${identity.workspaceId}','connector.admit','denied',now() + n * interval '1 microsecond' from generate_series(1,105) n;`);
    const activity = await repository.listActivity(identity);
    expect(activity).toHaveLength(100);
    expect(activity.every((event) => event.action === "connector.admit")).toBe(true);
    for (const table of ["auth_nonces", "sender_profiles", "clients", "connector_tokens", "connector_rate_limits", "connector_ip_rate_limits", "audit_events"]) {
      const key = table.includes("rate_limits") ? "subject_hash" : "id";
      const value = key === "id" ? randomUUID() : "f".repeat(64);
      const inserted = key === "id" ? await service.from(table).insert({ id: value }) : await service.from(table).insert({ subject_hash: value });
      for (const response of [inserted,
        await service.from(table).update({ [key]: value }).eq(key, value), await service.from(table).delete().eq(key, value)]) {
        expect(response.error?.code, table).toBe("42501");
      }
    }
  });

  it("does not allocate new IP counters when an exhausted token is rejected", async () => {
    await avoidMinuteBoundary();
    const identity = await login();
    const created = await token(identity);
    fixture(`insert into public.connector_rate_limits (workspace_id,connector_token_id,purpose,subject_hash,window_started_at,request_count)
      values ('${identity.workspaceId}','${created.id}','token','${created.tokenHash}',date_trunc('minute',now()),60);`);
    const ipHash = randomBytes(32).toString("hex");
    expect(await repository.admitConnector({ id: created.id, tokenHash: created.tokenHash, ipHash, action: "invoice:draft" }))
      .toMatchObject({ outcome: "rate_limited" });
    expect((await service.from("connector_ip_rate_limits").select("request_count").eq("subject_hash", ipHash)).data).toEqual([]);
  });

  it("pins all fourteen exact RPC signatures and denies anon/authenticated execution", async () => {
    const scope = { p_workspace_id: randomUUID(), p_owner_wallet: owner };
    const id = randomUUID();
    const calls: Record<string, Record<string, unknown>> = {
      payr_issue_auth_nonce_v1: { p_nonce: nonce() },
      payr_find_auth_nonce_v1: { p_nonce_id: id },
      payr_complete_login_v1: { p_nonce_id: id, p_verified_wallet: owner },
      payr_apply_payout_change_v1: { p_nonce_id: id, ...scope },
      payr_get_sender_profile_v1: scope,
      payr_save_sender_profile_v1: { ...scope, p_input: senderInput },
      payr_list_clients_v1: scope,
      payr_save_client_v1: { ...scope, p_input: clientInput },
      payr_list_connectors_v1: scope,
      payr_create_connector_v1: { ...scope, p_id: id, p_token_hash: "a".repeat(64), p_expires_at: new Date(Date.now() + 86_400_000).toISOString() },
      payr_revoke_connector_v1: { ...scope, p_id: id },
      payr_find_connector_v1: { p_id: id },
      payr_admit_connector_v1: { p_id: id, p_token_hash: "a".repeat(64), p_ip_hash: "b".repeat(64), p_action: "invoice:status" },
      payr_list_activity_v1: scope,
    };
    const metadata: Array<{ name: string; args: string[]; definer: boolean; config: string[]; anon: boolean; authenticated: boolean; service: boolean }> = JSON.parse(fixture(`
      select jsonb_agg(jsonb_build_object('name',p.proname,'args',p.proargnames,'definer',p.prosecdef,'config',p.proconfig,
        'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
        'service',has_function_privilege('service_role',p.oid,'execute')))
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (${Object.keys(calls).map((name) => `'${name}'`).join(",")});`));
    expect(metadata).toHaveLength(14);
    for (const row of metadata) {
      expect(row).toMatchObject({ args: Object.keys(calls[row.name]), definer: true, config: ['search_path=""'], anon: false, authenticated: false, service: true });
    }
    expect(fixture(`select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'payr_identity_%' and (not p.prosecdef or p.proconfig <> array['search_path=""']
      or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')
      or has_function_privilege('service_role',p.oid,'execute'));`)).toBe("0");
    expect(fixture(`select relrowsecurity::text from pg_catalog.pg_class where oid = 'public.connector_ip_rate_limits'::regclass;`)).toBe("true");
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const authenticated = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = `identity-${randomUUID()}@example.test`;
    const password = `Db-${randomUUID()}-Aa1!`;
    const user = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(user.error).toBeNull();
    try {
      expect((await authenticated.auth.signInWithPassword({ email, password })).error).toBeNull();
      for (const client of [anon, authenticated]) {
        for (const [name, args] of Object.entries(calls)) {
          expect((await client.rpc(name, args)).error?.code, name).toBe("42501");
        }
        expect((await client.from("connector_ip_rate_limits").select("*")).error?.code).toBe("42501");
      }
    } finally { if (user.data.user) await service.auth.admin.deleteUser(user.data.user.id); }
  });

  it("serializes independent first-login nonces to one workspace and never resets a changed payout", async () => {
    const inputs = await Promise.all(Array.from({ length: 5 }, () => repository.issueNonce(nonce())));
    const identities = await Promise.all(inputs.map((input) => repository.completeLogin(input.id, owner)));
    expect(identities.every((identity) => identity.workspaceId === identities[0].workspaceId)).toBe(true);
    const identity = identities[0];
    const payout = await repository.issueNonce(nonce({ purpose: "payr-payout-change-v1", workspaceId: identity.workspaceId,
      payoutFrom: owner, payoutTo: otherOwner, profileRevision: 1 }));
    await repository.applyPayoutChange(identity, payout.id);
    expect(await login()).toEqual(identity);
    expect(await repository.getProfile(identity)).toMatchObject({ payoutWallet: otherOwner, revision: 2 });
  });

  it("rechecks payout snapshot even if its revision is unchanged and forbids editing signed payout facts", async () => {
    const identity = await login();
    const payout = await repository.issueNonce(nonce({ purpose: "payr-payout-change-v1", workspaceId: identity.workspaceId,
      payoutFrom: owner, payoutTo: otherOwner, profileRevision: 1 }));
    for (const assignment of [`payout_from = '${otherOwner}'`, `payout_to = '${owner}'`, "profile_revision = 2", "workspace_id = null"]) {
      expectFixtureFailure(`update public.auth_nonces set ${assignment} where id = '${payout.id}';`, "AUTH_NONCE_IMMUTABLE");
    }
    fixture(`update public.sender_profiles set payout_wallet = '0x${"3".repeat(40)}' where workspace_id = '${identity.workspaceId}';`);
    await expect(repository.applyPayoutChange(identity, payout.id)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect((await repository.findNonce(payout.id))?.consumedAt).toBeNull();
  });

  it("rechecks expiry after acquiring the global IP lock", async () => {
    const identity = await login();
    const input = { id: randomUUID(), tokenHash: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 350).toISOString() };
    await repository.createConnector(identity, input);
    const ipHash = randomBytes(32).toString("hex");
    await withFixtureLock(`select pg_advisory_xact_lock(hashtextextended('payr:connector-ip:${ipHash}',0))`, async () => {
      expect(await repository.admitConnector({ ...input, ipHash, action: "invoice:draft" })).toEqual({ outcome: "denied" });
    });
    expect((await repository.findConnector(input.id))?.lastUsedAt).toBeNull();
  });

  it("does not admit after a concurrent revocation commits", async () => {
    const identity = await login();
    const created = await token(identity);
    const input = { id: created.id, tokenHash: created.tokenHash, ipHash: randomBytes(32).toString("hex"), action: "invoice:status" };
    await Promise.all([repository.revokeConnector(identity, created.id), ...Array.from({ length: 10 }, () => repository.admitConnector(input))]);
    const results = await Promise.all(Array.from({ length: 10 }, () => repository.admitConnector(input)));
    expect(results).toEqual(Array.from({ length: 10 }, () => ({ outcome: "denied" })));
  });

  it("uses DB-minute windows independent of previous windows or IP choice", async () => {
    await avoidMinuteBoundary();
    const identity = await login();
    const created = await token(identity);
    const ipHash = randomBytes(32).toString("hex");
    fixture(`insert into public.connector_rate_limits (workspace_id,connector_token_id,purpose,subject_hash,window_started_at,request_count)
      values ('${identity.workspaceId}','${created.id}','token','${created.tokenHash}',date_trunc('minute',now()) - interval '1 minute',60);
      insert into public.connector_ip_rate_limits (subject_hash,window_started_at,request_count)
      values ('${ipHash}',date_trunc('minute',now()) - interval '1 minute',120);`);
    const results = await Promise.all(Array.from({ length: 70 }, (_, index) => repository.admitConnector({
      id: created.id, tokenHash: created.tokenHash, ipHash: index % 2 === 0 ? ipHash : randomBytes(32).toString("hex"), action: "invoice:draft",
    })));
    expect(results.filter((result) => result.outcome === "allowed")).toHaveLength(60);
    expect(results.filter((result) => result.outcome === "rate_limited")).toHaveLength(10);
    const counts = await service.from("connector_rate_limits").select("request_count,window_started_at").eq("connector_token_id", created.id);
    expect(counts.error).toBeNull();
    expect(counts.data).toHaveLength(2);
    expect(counts.data?.every((row) => row.request_count === 60 && row.window_started_at.endsWith(":00+00:00"))).toBe(true);
  });

  it("rejects null/invalid token metadata and unsupported actions without recording caller data", async () => {
    const identity = await login();
    const input = { p_workspace_id: identity.workspaceId, p_owner_wallet: owner, p_id: randomUUID(),
      p_token_hash: randomBytes(32).toString("hex"), p_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() };
    for (const changes of [{ p_id: null }, { p_id: "11111111-1111-0111-1111-111111111111" },
      { p_token_hash: null }, { p_token_hash: "raw-credential" }, { p_token_hash: "A".repeat(64) }, { p_expires_at: null }]) {
      expect((await service.rpc("payr_create_connector_v1", { ...input, ...changes })).error?.message).toBe("INVALID_INPUT");
    }
    expect((await service.rpc("payr_create_connector_v1", input)).error).toBeNull();
    for (const p_action of [null, "", "profile:save", "connector:revoke", "auth.login", "192.0.2.1", "fe80::1", "https://secret.test/token"]) {
      const result = await service.rpc("payr_admit_connector_v1", { p_id: input.p_id, p_token_hash: input.p_token_hash, p_ip_hash: "a".repeat(64), p_action });
      expect(result.error).toBeNull(); expect(result.data).toEqual({ outcome: "denied" });
    }
    for (const action of ["192.0.2.1", "fe80::1", "https://secret.test/token"]) {
      expectFixtureFailure(`insert into public.audit_events (id,workspace_id,action,outcome)
        values (gen_random_uuid(),'${identity.workspaceId}','${action}','denied');`, "audit_events_bounded_codes");
    }
    const events = await repository.listActivity(identity);
    expect(events.filter((event) => event.outcome === "denied").every((event) => event.action === "connector.admit")).toBe(true);
  });
});
