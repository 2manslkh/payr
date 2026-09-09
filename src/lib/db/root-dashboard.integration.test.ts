import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";

// Run only after the coordinator provisions the isolated database and applies migrations.
// Every fixture rolls back, including limiter counters; no existing fixture suite is changed.
const workspace = randomUUID();
const owner = `0x${randomBytes(20).toString("hex")}`;
const ipHash = "a".repeat(64);
const overview = `public.payr_get_invoice_overview_v2('${workspace}','${owner}',null)`;
const admission = `public.payr_admit_wallet_balance_v1('${workspace}','${owner}','${ipHash}')`;
const seed = `insert into public.workspaces(id,owner_wallet) values ('${workspace}','${owner}');
  insert into public.sender_profiles(id,workspace_id,business_name,contact_name,contact_email,billing_address,payout_wallet,invoice_prefix)
    values ('${randomUUID()}','${workspace}','Studio','Owner','owner@example.test',
      '{"line1":"1 Test Road","city":"London","postalCode":"N1 1AA","countryCode":"GB"}','${owner}','INV');`;

function fixture(sql: string): string[] {
  const api = new URL(process.env.SUPABASE_URL!);
  const database = new URL(process.env.SUPABASE_DB_URL!);
  const container = process.env.PAYR_TEST_DB_CONTAINER ?? "supabase_db_payr";
  if (api.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(api.hostname)
    || !["postgres:", "postgresql:"].includes(database.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
    || database.username !== "postgres" || database.pathname !== "/postgres"
    || !/^supabase_db_[a-zA-Z0-9_-]+$/.test(container)) throw new Error("Isolated local Payr fixtures only");
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], {
    input: `begin; set local statement_timeout = '10s'; ${seed} ${sql} rollback;`,
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000,
  }).trim().split("\n").filter(Boolean);
}

function expectSqlFailure(sql: string, message: string) {
  let failure: unknown;
  try { fixture(sql); } catch (error) { failure = error; }
  expect(failure).toBeDefined();
  expect(String((failure as { stderr: unknown }).stderr)).toContain(message);
}

it.each([null, "0", "30", "365", "-1", "366"])("requires saved terms in range for senderComplete: %s", (terms) => {
  const [result] = fixture(`update public.sender_profiles set default_terms = ${terms === null ? "null" : `'${terms}'`}
    where workspace_id = '${workspace}'; set local role service_role; select ${overview};`);
  expect(JSON.parse(result)).toEqual({ invoiceCount: 0, draftCount: 0, outstandingInvoiceCount: 0,
    receivablesUnavailableCount: 0, receivablesAtomic: "0", attention: [],
    senderComplete: terms !== null && !["-1", "366"].includes(terms), clientCount: 0,
    activeConnectorCount: 0, latestSettlement: null });
});

it("preserves every other overview field and the v1 response when terms are completed", () => {
  const results = fixture(`set local role service_role;
    select ${overview}; select public.payr_get_invoice_overview_v1('${workspace}','${owner}',null);
    reset role; update public.sender_profiles set default_terms = '0' where workspace_id = '${workspace}';
    set local role service_role;
    select ${overview}; select public.payr_get_invoice_overview_v1('${workspace}','${owner}',null);`).map((row) => JSON.parse(row));
  expect(results[2]).toEqual({ ...results[0], senderComplete: true });
  expect(results[3]).toEqual(results[1]);
});

it("retains scoped connector overview reads without granting connectors owner balance admission", () => {
  const token = randomUUID();
  const [result] = fixture(`insert into public.connector_tokens(id,workspace_id,token_hash,expires_at)
      values ('${token}','${workspace}','${"b".repeat(64)}',clock_timestamp() + interval '1 day');
    set local role service_role;
    select public.payr_get_invoice_overview_v2('${workspace}',null,'${token}');`);
  expect(JSON.parse(result)).toMatchObject({ senderComplete: false, activeConnectorCount: 1 });
  expectSqlFailure(`set local role service_role;
    select public.payr_admit_wallet_balance_v1('${workspace}',null,'${ipHash}');`, "INVALID_INPUT");
});

it.each([`'0x${"f".repeat(40)}'`, "null"])("denies mismatched or absent overview owner %s", (wallet) => {
  expectSqlFailure(`set local role service_role;
    select public.payr_get_invoice_overview_v2('${workspace}',${wallet},null);`, "NOT_FOUND");
});

it("denies balance admission for a different workspace owner", () => {
  expectSqlFailure(`set local role service_role;
    select public.payr_admit_wallet_balance_v1('${workspace}','0x${"f".repeat(40)}','${ipHash}');`, "NOT_FOUND");
});

it.each(["null", "'raw-ip'", `'${"A".repeat(64)}'`])("rejects invalid admission hashes %s", (hash) => {
  expectSqlFailure(`set local role service_role;
    select public.payr_admit_wallet_balance_v1('${workspace}','${owner}',${hash});`, "INVALID_INPUT");
});

it.each(["anon", "authenticated"])("keeps both RPCs inaccessible to %s", (role) => {
  expectSqlFailure(`set local role ${role}; select ${overview};`, "permission denied");
  expectSqlFailure(`set local role ${role}; select ${admission};`, "permission denied");
});

it("retains empty search paths, security definers, service-only execution and private limiter storage", () => {
  const rows = fixture(`select jsonb_build_object('name',p.proname,'definer',p.prosecdef,
      'emptyPath','search_path=""' = any(p.proconfig),
      'service',has_function_privilege('service_role',p.oid,'EXECUTE'),
      'public',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
    from pg_proc p where p.oid in ('public.payr_get_invoice_overview_v2(uuid,text,uuid)'::regprocedure,
      'public.payr_admit_wallet_balance_v1(uuid,text,text)'::regprocedure) order by p.proname;
    select relrowsecurity from pg_class where oid = 'public.wallet_balance_rate_limits'::regclass;
    select count(*) from pg_policy where polrelid = 'public.wallet_balance_rate_limits'::regclass;`);
  for (const row of rows.slice(0, 2)) expect(JSON.parse(row)).toMatchObject({ definer: true, emptyPath: true, service: true, public: false });
  expect(rows.slice(2)).toEqual(["t", "0"]);
  for (const role of ["anon", "authenticated", "service_role"]) {
    expectSqlFailure(`set local role ${role}; select * from public.wallet_balance_rate_limits;`, "permission denied");
  }
});

// Retry only if the real clock crossed the fixed-minute boundary during this rollback-only fixture.
function inOneMinute(sql: string): string[] {
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = fixture(`truncate public.wallet_balance_rate_limits;
      select date_trunc('minute',clock_timestamp()); ${sql}
      select date_trunc('minute',clock_timestamp());`);
    if (rows[0] === rows.at(-1)) return rows.slice(1, -1);
  }
  throw new Error("Fixture repeatedly crossed the admission minute");
}

it("caps one owner at 12 across rotating IPs and does not allocate counters on denial", () => {
  const rows = inOneMinute(`set local role service_role;
    select public.payr_admit_wallet_balance_v1('${workspace}','${owner}',lpad(to_hex(n),64,'0'))
      from generate_series(1,15) n;
    reset role; select count(*) from public.wallet_balance_rate_limits;
    select max(request_count) from public.wallet_balance_rate_limits where scope = 'global';`);
  expect(rows.slice(0, 12).map((row) => JSON.parse(row))).toEqual(Array(12).fill({ allowed: true }));
  expect(rows.slice(12, 15).map((row) => JSON.parse(row))).toEqual(Array(3).fill({ allowed: false }));
  expect(rows.slice(15)).toEqual(["14", "12"]);
});

it.each([['ip', 60], ['global', 600]] as const)("honors shared %s capacity before allocating an owner counter", (scope, limit) => {
  const key = scope === "ip" ? ipHash : "0".repeat(64);
  const secondWorkspace = randomUUID(), secondOwner = `0x${randomBytes(20).toString("hex")}`;
  const secondIp = scope === "ip" ? ipHash : "b".repeat(64);
  const rows = inOneMinute(`insert into public.workspaces(id,owner_wallet) values ('${secondWorkspace}','${secondOwner}');
    insert into public.wallet_balance_rate_limits(scope,key_hash,window_start,request_count)
    values ('${scope}','${key}',date_trunc('minute',clock_timestamp()),${limit - 1});
    set local role service_role; select ${admission};
    select public.payr_admit_wallet_balance_v1('${secondWorkspace}','${secondOwner}','${secondIp}');
    reset role; select count(*) from public.wallet_balance_rate_limits;
    select request_count from public.wallet_balance_rate_limits where scope = '${scope}';
    update public.wallet_balance_rate_limits set window_start = window_start - interval '2 minutes';
    set local role service_role; select ${admission};`);
  expect(rows.map((row) => JSON.parse(row))).toEqual([{ allowed: true }, { allowed: false }, 3, limit, { allowed: true }]);
});

it("shares the 60-request IP budget across authenticated owners", () => {
  const owners = Array.from({ length: 6 }, () => ({ id: randomUUID(), wallet: `0x${randomBytes(20).toString("hex")}` }));
  const rows = inOneMinute(`insert into public.workspaces(id,owner_wallet)
    values ${owners.map(({ id, wallet }) => `('${id}','${wallet}')`).join(",")};
    set local role service_role;
    select public.payr_admit_wallet_balance_v1(w.id,w.owner_wallet,'${ipHash}')
      from public.workspaces w cross join generate_series(1,12) n
      where w.id in (${owners.map(({ id }) => `'${id}'`).join(",")});`);
  expect(rows.map((row) => JSON.parse(row)).filter((row) => row.allowed)).toHaveLength(60);
  expect(rows.map((row) => JSON.parse(row)).filter((row) => !row.allowed)).toHaveLength(12);
});

it("fails closed instead of waiting indefinitely for concurrent admission", async () => {
  fixture("select 1;"); // Validate the isolated target before starting the lock holder.
  const holder = spawn("docker", ["exec", "-i", process.env.PAYR_TEST_DB_CONTAINER ?? "supabase_db_payr",
    "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "--quiet", "--tuples-only", "--no-align",
    "--set=ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  holder.stderr.on("data", (data) => { stderr += String(data); });
  const ready = new Promise<void>((resolve, reject) => {
    let stdout = "";
    holder.stdout.on("data", (data) => { stdout += String(data); if (stdout.includes("lock-ready")) resolve(); });
    holder.on("error", reject);
    holder.on("close", () => reject(new Error(stderr || "Lock holder closed")));
  });
  const finished = new Promise<void>((resolve, reject) => {
    holder.on("error", reject);
    holder.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
  void finished.catch(() => {});
  holder.stdin.write(`begin; set local statement_timeout = '5s'; set local idle_in_transaction_session_timeout = '8s';
    select pg_advisory_xact_lock(hashtextextended('payr:wallet-balance:admission',0)); select 'lock-ready';\n`);
  try {
    await ready;
    expectSqlFailure(`set local role service_role; select ${admission};`, "lock timeout");
  } finally {
    holder.stdin.end("rollback;\n");
    await finished;
  }
}, 15_000);
