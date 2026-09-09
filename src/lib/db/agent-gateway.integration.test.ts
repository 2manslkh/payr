import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_SCOPES, operationNames, type RegistrationChallenge } from "../agent-api/contracts";
import { createConnectorHasher } from "../connectors/crypto";
import { createGatewayRepository } from "./agent-gateway";
import { createIdentityRepository } from "./identity";
import { fixtureDatabaseContainer } from "../../../scripts/local-test-config.mjs";

// Select the validated isolated project, or explicitly opt into the fresh CI runner.
// Never set the disposable opt-in for the retained root stack.
function guard() {
  const container = fixtureDatabaseContainer();
  if (container === "supabase_db_payr" && process.env.PAYR_TEST_DISPOSABLE_DB !== "agent-gateway") {
    throw new Error("Gateway fixtures require the disposable Payr harness and PAYR_TEST_DISPOSABLE_DB=agent-gateway");
  }
  return container;
}
guard();
const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const repository = createGatewayRepository(service);
const identity = createIdentityRepository(service);
const owner = `0x${"1".repeat(40)}`, otherOwner = `0x${"2".repeat(40)}`;
const hash = () => randomBytes(32).toString("hex");
const hasher = createConnectorHasher(new Uint8Array(32).fill(7));
const fixtureArgs = ["exec", "-i", guard(), "psql", "-U", "postgres", "-d", "postgres",
  "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"];
function fixture(sql: string) {
  guard();
  return execFileSync("docker", fixtureArgs, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
async function withLock(sql: string, operation: () => Promise<void>) {
  guard();
  const child = spawn("docker", fixtureArgs, { stdio: ["pipe", "pipe", "pipe"] });
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (data) => { if (String(data).includes("locked")) resolve(); });
    child.on("error", reject);
    child.on("exit", () => reject(new Error("Fixture closed before lock")));
  });
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Fixture failed")));
  });
  void finished.catch(() => {});
  child.stdin.end(`begin; ${sql}; select 'locked'; select pg_sleep(0.6); commit;`);
  try { await ready; await operation(); } finally { await finished; }
}
function challenge(changes: Partial<RegistrationChallenge> = {}): RegistrationChallenge {
  const now = Date.now() - 100;
  return { id: randomUUID(), serviceId: "bazantic", wallet: owner, challenge: randomBytes(32).toString("base64url"),
    domain: "payr.example", uri: "https://payr.example", chainId: 5042002, issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 300_000).toISOString(), consumedAt: null, scopes: [...ACCOUNT_SCOPES], expiresInDays: 7, ...changes };
}
async function issue(changes: Partial<RegistrationChallenge> = {}) {
  const c = challenge(changes);
  await repository.issueChallenge({ challenge: c, walletHash: hash(), ipHash: hash() });
  return c;
}
function completion(c: RegistrationChallenge) {
  const connectorId = randomUUID(), raw = `pac_${connectorId}.${randomBytes(32).toString("base64url")}`;
  return { input: { challengeId: c.id, serviceId: c.serviceId, verifiedWallet: c.wallet, connectorId,
    tokenHash: hasher("connector", raw) }, raw };
}
async function register(changes: Partial<RegistrationChallenge> = {}) {
  const c = await issue(changes), mint = completion(c), account = await repository.completeRegistration(mint.input);
  return { c, ...mint, account, auth: { serviceId: c.serviceId, id: mint.input.connectorId, tokenHash: mint.input.tokenHash } };
}
async function provision(serviceId = "bazantic", allowedOperations: readonly string[] = operationNames) {
  const key = { id: randomUUID(), tokenHash: hash(), serviceId };
  const result = await service.rpc("payr_admin_provision_gateway_key_v1", { p_id: key.id, p_service_id: key.serviceId,
    p_token_hash: key.tokenHash, p_allowed_operations: allowedOperations });
  expect(result.error).toBeNull();
  return key;
}
async function avoidMinuteBoundary() {
  // Callers budget for up to 15 seconds of waiting before exercising the quota.
  const seconds = Number(fixture("select extract(second from clock_timestamp());"));
  if (seconds > 45) await new Promise((resolve) => setTimeout(resolve, (60 - seconds) * 1000 + 20));
}

describe("gateway SQL transactions (disposable database only)", () => {
  beforeEach(() => fixture("truncate public.gateway_service_keys, public.agent_registration_challenges, public.gateway_rate_limits, public.auth_nonce_rate_limits, public.connector_ip_rate_limits, public.workspaces cascade;"));

  it("round-trips signed facts, atomically consumes one challenge and mints one mapped account under concurrent replay", async () => {
    const c = await issue({ scopes: ["invoice:status", "sender:read"], expiresInDays: 1 });
    expect(await repository.findChallenge({ id: c.id, serviceId: c.serviceId })).toEqual(c);
    expect(await repository.findChallenge({ id: c.id, serviceId: "other" })).toBeNull();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => repository.completeRegistration(completion(c).input)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "NONCE_INVALID_OR_USED", status: 400 });
    const success = results.find((r) => r.status === "fulfilled");
    if (success?.status !== "fulfilled") throw new Error("No successful registration");
    const a = success.value;
    expect(a).toMatchObject({ ownerWallet: owner, senderSetupRequired: true, credential: { scopes: c.scopes, revokedAt: null } });
    expect(Date.parse(a.credential.expiresAt) - Date.parse(a.credential.createdAt)).toBeGreaterThan(86_399_000);
    expect(Date.parse(a.credential.expiresAt) - Date.parse(a.credential.createdAt)).toBeLessThanOrEqual(86_400_000);
    expect(await identity.getProfile(a)).toMatchObject({ revision: 1, payoutWallet: owner, businessName: null });
    expect((await repository.findChallenge({ id: c.id, serviceId: c.serviceId }))?.consumedAt).not.toBeNull();
    expect(fixture("select (select count(*) from public.connector_tokens) || ':' || (select count(*) from public.agent_account_credentials) || ':' || (select count(*) from public.auth_nonces);"))
      .toBe("1:1:0");
    expect((await identity.listActivity(a)).map((e) => e.action)).toEqual(["connector.create"]);
  });

  it("normalizes uppercase UUIDs through service admission, challenge issuance/lookup, registration and account admission/revocation", async () => {
    const key = await provision();
    expect(await repository.admitService({ id: key.id.toUpperCase(), tokenHash: key.tokenHash, operation: "get_account", ipHash: hash() }))
      .toEqual({ serviceId: key.serviceId });
    const c = challenge({ id: "aaaaaaaa-1111-4111-8111-111111111111" });
    await repository.issueChallenge({ challenge: { ...c, id: c.id.toUpperCase() }, walletHash: hash(), ipHash: hash() });
    expect(await repository.findChallenge({ id: c.id.toUpperCase(), serviceId: c.serviceId })).toEqual(c);
    const connectorId = "bbbbbbbb-2222-4222-8222-222222222222";
    const tokenHash = hasher("connector", `pac_${connectorId}.${randomBytes(32).toString("base64url")}`);
    const a = await repository.completeRegistration({ challengeId: c.id.toUpperCase(), serviceId: c.serviceId,
      verifiedWallet: c.wallet, connectorId: connectorId.toUpperCase(), tokenHash });
    expect(a.credential.id).toBe(connectorId);
    const auth = { serviceId: c.serviceId, id: connectorId.toUpperCase(), tokenHash };
    expect(await repository.admitAccount({ ...auth, action: "invoice:status", ipHash: hash() })).toMatchObject({
      workspaceId: a.workspaceId, credential: { id: connectorId },
    });
    expect(await repository.revokeAccount(auth)).toEqual({ credentialId: connectorId, revoked: true });
  });

  it("rejects service/wallet mismatches and browser login nonces without consuming or creating anything", async () => {
    const c = await issue(), { input } = completion(c);
    for (const change of [{ serviceId: "other" }, { verifiedWallet: otherOwner }, { challengeId: randomUUID() }]) {
      await expect(repository.completeRegistration({ ...input, ...change })).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
    }
    const browser = await identity.issueNonce({ id: randomUUID(), workspaceId: null, wallet: owner, purpose: "payr-login-v1",
      challenge: randomBytes(32).toString("base64url"), domain: c.domain, uri: c.uri, chainId: c.chainId,
      issuedAt: c.issuedAt, expiresAt: c.expiresAt, consumedAt: null, payoutFrom: null, payoutTo: null, profileRevision: null });
    await expect(repository.completeRegistration({ ...input, challengeId: browser.id })).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
    expect((await repository.findChallenge({ id: c.id, serviceId: c.serviceId }))?.consumedAt).toBeNull();
    expect(fixture("select count(*) from public.workspaces;")).toBe("0");
  });

  it("rolls back nonce, workspace, profile, connector and audit if mapping insertion fails", async () => {
    const c = await issue(), { input } = completion(c);
    fixture("alter table public.agent_account_credentials add constraint gateway_fixture_fail check (false) not valid;");
    try {
      await expect(repository.completeRegistration(input)).rejects.toMatchObject({ code: "DATABASE_ERROR", status: 503 });
      expect((await repository.findChallenge({ id: c.id, serviceId: c.serviceId }))?.consumedAt).toBeNull();
      for (const table of ["workspaces", "sender_profiles", "connector_tokens", "agent_account_credentials", "audit_events"]) {
        expect(fixture(`select count(*) from public.${table};`)).toBe("0");
      }
    } finally { fixture("alter table public.agent_account_credentials drop constraint gateway_fixture_fail;"); }
    expect(await repository.completeRegistration(input)).toMatchObject({ ownerWallet: owner });
  });

  it("rejects expired challenges after challenge and workspace lock waits", async () => {
    const existing = await register();
    for (const target of ["challenge", "workspace"]) {
      const c = await issue({ expiresAt: new Date(Date.now() + 350).toISOString() });
      await withLock(target === "challenge"
        ? `select id from public.agent_registration_challenges where id = '${c.id}' for update`
        : `select id from public.workspaces where id = '${existing.account.workspaceId}' for no key update`, async () => {
        await expect(repository.completeRegistration(completion(c).input)).rejects.toMatchObject({ code: "NONCE_INVALID_OR_USED" });
      });
      expect((await repository.findChallenge({ id: c.id, serviceId: c.serviceId }))?.consumedAt).toBeNull();
    }
    expect(fixture("select count(*) from public.connector_tokens;")).toBe("1");
  });

  it("keeps existing-wallet profile and payout unchanged, with readiness reflecting setup", async () => {
    const first = await register();
    await identity.saveProfile(first.account, { expectedRevision: 1, businessName: "Existing Studio", contactName: "Owner",
      contactEmail: "owner@example.test", billingAddress: { line1: "1 Road", city: "London", postalCode: "N1", countryCode: "GB" },
      invoicePrefix: "OLD", defaultPaymentTermsDays: 30 });
    fixture(`update public.sender_profiles set payout_wallet = '${otherOwner}' where workspace_id = '${first.account.workspaceId}';`);
    const before = await identity.getProfile(first.account);
    const second = await register();
    expect(second.account).toMatchObject({ workspaceId: first.account.workspaceId, ownerWallet: owner, senderSetupRequired: false });
    expect(await identity.getProfile(second.account)).toEqual(before);
    expect(second.account.credential.id).not.toBe(first.account.credential.id);
  });

  it("rejects SQL scope/lifetime/coercion/injection inputs and preserves signed facts", async () => {
    const c = challenge();
    for (const change of [{ scopes: [] }, { scopes: [null] }, { scopes: ["sender:read"] }, { scopes: ["invoice:status", "invoice:void"] },
      { scopes: ["invoice:status", "invoice:status"] }, { scopes: [["invoice:status"]] }, { scopes: null },
      { expiresInDays: 0 }, { expiresInDays: 8 }, { expiresInDays: "1" }, { expiresInDays: 1.5 }, { expiresInDays: null },
      { chainId: "5042002" }, { chainId: 9007199254740992 }, { consumedAt: c.issuedAt }, { ownerWallet: owner },
      { purpose: "payr-login-v1" }, { wallet: null }, { uri: "https://other.example" }]) {
      expect((await service.rpc("payr_issue_agent_challenge_v1", { p_challenge: { ...c, ...change }, p_wallet_hash: hash(), p_ip_hash: hash() })).error)
        .toMatchObject({ code: "22023", message: "INVALID_INPUT" });
    }
    expect(fixture("select count(*) from public.agent_registration_challenges;")).toBe("0");
    const issued = await issue();
    for (const assignment of ["expires_in_days = 1", "scopes = array['invoice:status']", `wallet = '${otherOwner}'`, "consumed_at = expires_at"]) {
      expect(() => fixture(`update public.agent_registration_challenges set ${assignment} where id = '${issued.id}';`)).toThrow();
    }
    expect(await repository.findChallenge({ id: issued.id, serviceId: issued.serviceId })).toEqual(issued);
  });

  it("requires exact mapping/service/id/hash, denies stripped MCP hashes, and never escalates to owner", async () => {
    const a = await register({ scopes: ["invoice:status", "sender:read"] }), b = await register({ wallet: otherOwner, serviceId: "other" });
    const legacyId = randomUUID(), legacyHash = hash();
    const legacy = await identity.createConnector(a.account, { id: legacyId, tokenHash: legacyHash, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(legacy.scopes).toEqual(["invoice:draft", "invoice:publish", "invoice:status", "invoice:void"]);
    for (const bad of [{ ...a.auth, serviceId: "other" }, { ...a.auth, tokenHash: b.auth.tokenHash },
      { ...a.auth, id: b.auth.id }, { ...a.auth, id: legacyId, tokenHash: legacyHash },
      { ...a.auth, tokenHash: hasher("connector", a.raw.slice(4)) }]) {
      await expect(repository.admitAccount({ ...bad, action: "invoice:status", ipHash: hash() })).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
      await expect(repository.revokeAccount(bad)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    }
    // Failed mapping/hash authentication never reaches the token's legacy audit or quotas.
    expect((await identity.listActivity(a.account)).filter((e) => e.outcome === "denied")).toEqual([]);
    expect((await identity.listActivity(b.account)).filter((e) => e.outcome === "denied")).toEqual([]);
    expect(fixture("select count(*) from public.connector_rate_limits;")).toBe("0");
    expect(await identity.admitConnector({ id: a.auth.id, tokenHash: hasher("connector", a.raw.slice(4)), ipHash: hash(), action: "invoice:status" })).toEqual({ outcome: "denied" });
    expect(await repository.admitAccount({ ...a.auth, action: "sender:read", ipHash: hash() })).toMatchObject({ workspaceId: a.account.workspaceId });
    await expect(repository.admitAccount({ ...a.auth, action: "sender:write", ipHash: hash() })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    const scopeDenied = await service.rpc("payr_admit_agent_account_v1", { p_service_id: a.auth.serviceId, p_id: a.auth.id,
      p_token_hash: a.auth.tokenHash, p_action: "sender:write", p_ip_hash: hash() });
    expect(scopeDenied.error).toBeNull();
    expect(scopeDenied.data).toEqual({ outcome: "denied", code: "FORBIDDEN" });
    expect((await identity.listActivity(a.account)).filter((e) => e.tokenId === a.auth.id && e.action === "connector.admit" && e.outcome === "denied"))
      .toHaveLength(2);
    const actor = { workspaceId: a.account.workspaceId, connectorId: a.auth.id, ownerWallet: null };
    await expect(identity.getConnectorProfile({ ...actor, workspaceId: b.account.workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await repository.revokeAccount(a.auth)).toEqual({ credentialId: a.auth.id, revoked: true });
    await expect(repository.admitAccount({ ...a.auth, action: "invoice:status", ipHash: hash() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await identity.findConnector(legacyId))?.revokedAt).toBeNull();
    expect((await identity.findConnector(b.auth.id))?.revokedAt).toBeNull();
  });

  it("rechecks account expiry/revocation after token locks", async () => {
    for (const change of ["revoked_at = clock_timestamp()", "created_at = clock_timestamp() - interval '2 days', expires_at = clock_timestamp() - interval '1 day'"]) {
      const a = await register();
      await withLock(`update public.connector_tokens set ${change} where id = '${a.auth.id}'`, async () => {
        await expect(repository.admitAccount({ ...a.auth, action: "invoice:status", ipHash: hash() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });
      expect((await identity.listActivity(a.account)).filter((e) => e.tokenId === a.auth.id && e.action === "invoice:status" && e.outcome === "denied"))
        .toHaveLength(1);
      const lifecycleDenied = await service.rpc("payr_admit_agent_account_v1", { p_service_id: a.auth.serviceId, p_id: a.auth.id,
        p_token_hash: a.auth.tokenHash, p_action: "invoice:status", p_ip_hash: hash() });
      expect(lifecycleDenied.error).toBeNull();
      expect(lifecycleDenied.data).toEqual({ outcome: "denied", code: "UNAUTHORIZED" });
      expect((await identity.listActivity(a.account)).filter((e) => e.tokenId === a.auth.id && e.action === "invoice:status" && e.outcome === "denied"))
        .toHaveLength(2);
      await expect(repository.revokeAccount(a.auth)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("rechecks account expiry after the inherited account-bucket lock", async () => {
    const a = await register();
    fixture(`update public.connector_tokens set expires_at = clock_timestamp() + interval '350 milliseconds' where id = '${a.auth.id}';`);
    await withLock(`select pg_advisory_xact_lock(hashtextextended('payr:connector-ip:${a.auth.tokenHash}',0))`, async () => {
      await expect(repository.admitAccount({ ...a.auth, action: "invoice:status", ipHash: hash() }))
        .rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    });
    expect(fixture("select count(*) from public.connector_rate_limits;")).toBe("0");
    expect((await identity.listActivity(a.account)).filter((e) => e.tokenId === a.auth.id && e.action === "invoice:status" && e.outcome === "denied"))
      .toHaveLength(1);
  });

  it("meters accounts independently behind one proxy, retaining the existing 60/token limit", async () => {
    await avoidMinuteBoundary();
    const accounts = await Promise.all([register(), register({ wallet: otherOwner }), register({ wallet: `0x${"3".repeat(40)}` })]);
    const ipHash = hash();
    for (const a of accounts) {
      const results = await Promise.allSettled(Array.from({ length: 61 }, () => repository.admitAccount({ ...a.auth, action: "invoice:status", ipHash })));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(60);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "RATE_LIMITED", status: 429, retryAfterSeconds: expect.any(Number) } });
      const events = (await identity.listActivity(a.account)).filter((e) => e.tokenId === a.auth.id && e.action === "invoice:status");
      expect(events.filter((e) => e.outcome === "allowed")).toHaveLength(60);
      expect(events.filter((e) => e.outcome === "rate_limited")).toHaveLength(1);
      const limited = await service.rpc("payr_admit_agent_account_v1", { p_service_id: a.auth.serviceId, p_id: a.auth.id,
        p_token_hash: a.auth.tokenHash, p_action: "invoice:status", p_ip_hash: ipHash });
      expect(limited.error).toBeNull();
      expect(limited.data).toEqual({ outcome: "rate_limited", retryAfterSeconds: expect.any(Number) });
      expect(limited.data.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(limited.data.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
    expect(fixture("select count(*) from public.connector_ip_rate_limits where request_count = 60;")).toBe("3");
    expect(fixture(`select count(*) from public.connector_ip_rate_limits where subject_hash = '${ipHash}';`)).toBe("0");
  }, 25_000);

  it("provisions separate rotatable service keys, enforces operations, and revokes by exact identity", async () => {
    const a = await provision("bazantic", ["get_account"]), rotation = await provision("bazantic");
    const input = { id: a.id, tokenHash: a.tokenHash, operation: "get_account" as const, ipHash: hash() };
    expect(await repository.admitService(input)).toEqual({ serviceId: "bazantic" });
    await expect(repository.admitService({ ...input, tokenHash: hash() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(repository.admitService({ ...input, operation: "register_account" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await service.rpc("payr_admin_revoke_gateway_key_v1", { p_id: a.id, p_service_id: "other" })).error?.message).toBe("NOT_FOUND");
    expect((await service.rpc("payr_admin_revoke_gateway_key_v1", { p_id: randomUUID(), p_service_id: a.serviceId })).error?.message).toBe("NOT_FOUND");
    const revoke = await service.rpc("payr_admin_revoke_gateway_key_v1", { p_id: a.id, p_service_id: a.serviceId });
    expect(revoke.error).toBeNull();
    expect(revoke.data).toEqual({ id: a.id, revoked: true });
    const revokedAt = fixture(`select revoked_at from public.gateway_service_keys where id = '${a.id}';`);
    expect((await service.rpc("payr_admin_revoke_gateway_key_v1", { p_id: a.id, p_service_id: a.serviceId })).error).toBeNull();
    expect(fixture(`select revoked_at from public.gateway_service_keys where id = '${a.id}';`)).toBe(revokedAt);
    await expect(repository.admitService(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await repository.admitService({ ...input, id: rotation.id, tokenHash: rotation.tokenHash })).toEqual({ serviceId: "bazantic" });
    expect(fixture("select count(*) from public.gateway_service_keys where last_used_at is not null;")).toBe("2");
    for (const operations of [null, [], [null], ["get_account", "get_account"], ["invoice:void"], ["get_account", "admin"]]) {
      expect((await service.rpc("payr_admin_provision_gateway_key_v1", { p_id: randomUUID(), p_service_id: "bazantic", p_token_hash: hash(), p_allowed_operations: operations })).error?.message).toBe("INVALID_INPUT");
    }
  });

  it("enforces service/source-IP quotas across key rotation and challenge wallet quotas, without denial increments", async () => {
    await avoidMinuteBoundary();
    const key = await provision(), rotation = await provision(), ipHash = hash();
    fixture(`insert into public.gateway_rate_limits values ('service','bazantic',date_trunc('minute',clock_timestamp()),600);`);
    for (const k of [key, rotation]) await expect(repository.admitService({ id: k.id, tokenHash: k.tokenHash, operation: "get_account", ipHash }))
      .rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(fixture("select count(*) from public.gateway_rate_limits;")).toBe("1");
    fixture(`truncate public.gateway_rate_limits; insert into public.gateway_rate_limits values ('ip','${ipHash}',date_trunc('minute',clock_timestamp()),1200);`);
    await expect(repository.admitService({ id: key.id, tokenHash: key.tokenHash, operation: "get_account", ipHash })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fixture("select count(*) from public.gateway_rate_limits;")).toBe("1");
    const walletHash = hash();
    for (let i = 0; i < 5; i++) await repository.issueChallenge({ challenge: challenge(), walletHash, ipHash: hash() });
    await expect(repository.issueChallenge({ challenge: challenge(), walletHash, ipHash: hash() })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fixture("select count(*) from public.agent_registration_challenges;")).toBe("5");
  }, 25_000);

  it("serializes concurrent rotated-key admission against the same service quota", async () => {
    await avoidMinuteBoundary();
    const keys = [await provision(), await provision()];
    fixture("insert into public.gateway_rate_limits values ('service','bazantic',date_trunc('minute',clock_timestamp()),590);");
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => repository.admitService({
      id: keys[i % 2].id, tokenHash: keys[i % 2].tokenHash, operation: "get_account", ipHash: hash(),
    })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(10);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(fixture("select request_count from public.gateway_rate_limits where purpose = 'service';")).toBe("600");
    expect(fixture("select count(*) from public.gateway_rate_limits where purpose = 'ip';")).toBe("10");
  }, 25_000);

  // Each catalog assertion launches Docker/psql inside the private daemon.
  it("denies anon, authenticated and PUBLIC-only execution and direct table writes, with forced RLS", async () => {
    const signatures = ["payr_admin_provision_gateway_key_v1(uuid,text,text,text[])", "payr_admin_revoke_gateway_key_v1(uuid,text)",
      "payr_admit_gateway_service_v1(uuid,text,text,text)", "payr_issue_agent_challenge_v1(jsonb,text,text)",
      "payr_find_agent_challenge_v1(uuid,text)", "payr_complete_agent_registration_v1(uuid,text,text,uuid,text)",
      "payr_admit_agent_account_v1(text,uuid,text,text,text)", "payr_revoke_agent_account_v1(text,uuid,text)"];
    for (const signature of signatures) {
      for (const role of ["anon", "authenticated"]) expect(fixture(`select has_function_privilege('${role}','public.${signature}','EXECUTE');`)).toBe("f");
      expect(fixture(`select has_function_privilege('service_role','public.${signature}','EXECUTE');`)).toBe("t");
    }
    for (const role of ["anon", "authenticated"]) {
      expect(() => fixture(`begin; set local role ${role}; select public.payr_find_agent_challenge_v1('${randomUUID()}','bazantic'); rollback;`)).toThrow();
    }
    expect(() => fixture(`begin; create role payr_gateway_public_fixture nologin; grant payr_gateway_public_fixture to postgres;
      grant usage on schema public to payr_gateway_public_fixture; set local role payr_gateway_public_fixture;
      select public.payr_find_agent_challenge_v1('${randomUUID()}','bazantic'); rollback;`)).toThrow();
    for (const table of ["gateway_service_keys", "agent_registration_challenges", "agent_account_credentials", "gateway_rate_limits"]) {
      expect(fixture(`select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.${table}'::regclass;`)).toBe("t");
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          expect(fixture(`select has_table_privilege('${role}','public.${table}','${privilege}');`)).toBe("f");
        }
      }
    }
    expect((await service.from("gateway_service_keys").insert({ id: randomUUID(), service_id: "bazantic", token_hash: hash(), allowed_operations: ["get_account"] })).error?.code).toBe("42501");
  }, 25_000);
});
