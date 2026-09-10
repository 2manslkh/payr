import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

// A new, network-isolated container only. Never connect to a retained Supabase database.
const container = `payr-privy-test-${randomUUID()}`;
const docker = (args, input) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });
const sql = (input) => docker(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], input).trim();
try {
  docker(["run", "--detach", "--rm", "--name", container, "--network", "none", "--tmpfs", "/var/lib/postgresql/data",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"]);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { sql("select 1"); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error("Disposable database failed to start");
  // Storage tables are schema stubs, not a storage-service integration test.
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid, bucket_id text, name text, version text, metadata jsonb, user_metadata jsonb, owner uuid, owner_id text);`);
  const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
  const privy = "202609090003_privy_identity.sql";
  const invoiceEmail = "202609090011_invoice_email.sql";
  if (!migrations.includes(privy) || !migrations.includes(invoiceEmail)) throw new Error("Missing reconciliation migrations");
  // Reproduce released v1.8.0 first, then the recorded hosted Privy overlay and the forward upgrade.
  for (const name of migrations.filter((name) => name < invoiceEmail && name !== privy)) {
    sql(readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  const workspace = randomUUID(), token = randomUUID();
  const owner = "0x5555555555555555555555555555555555555555";
  sql(`insert into public.workspaces(id,owner_wallet) values('${workspace}','${owner}');
    insert into public.sender_profiles(id,workspace_id,payout_wallet) values(gen_random_uuid(),'${workspace}','${owner}');
    select public.payr_create_connector_v1('${workspace}','${owner}','${token}',repeat('e',64),clock_timestamp()+interval '1 day');`);
  const legacyRows = `select jsonb_build_object(
    'workspace',(select to_jsonb(w) from public.workspaces w where id='${workspace}'),
    'sender',(select to_jsonb(s) from public.sender_profiles s where workspace_id='${workspace}'),
    'credential',(select to_jsonb(t) from public.connector_tokens t where id='${token}'));`;
  const before = sql(legacyRows);
  sql(readFileSync(`supabase/migrations/${privy}`, "utf8"));
  const audit = randomUUID();
  sql(`insert into public.audit_events(id,workspace_id,connector_token_id,action,outcome)
    values('${audit}','${workspace}','${token}','wallet:read','allowed');`);
  for (const name of migrations.filter((name) => name >= invoiceEmail)) sql(readFileSync(`supabase/migrations/${name}`, "utf8"));
  if (sql(legacyRows) !== before) throw new Error("Upgrade changed legacy workspace, payout or credential rows");
  if (sql(`select count(*) from public.audit_events where id='${audit}' and action='wallet:read';`) !== "1") throw new Error("Upgrade lost wallet audit history");
  if (sql("select count(*) from public.email_deliveries;") !== "0") throw new Error("Upgrade backfilled email deliveries");
  sql(readFileSync("scripts/privy-db-fixtures.sql", "utf8"));
  console.log("Privy SQL checks passed: v1.8.0/hosted-overlay upgrade, retained rows and wallet audit, no mail backfill, defaults, linking, replay, scopes, gateway issuance, revocation and grants.");
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  try { docker(["rm", "--force", container]); } catch { /* Only this run's container is eligible for cleanup. */ }
}
