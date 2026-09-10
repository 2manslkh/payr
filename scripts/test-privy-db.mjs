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
  for (const name of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) {
    sql(readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  sql(readFileSync("scripts/privy-db-fixtures.sql", "utf8"));
  console.log("Privy SQL checks passed: migrations, defaults, legacy linking, replay, scopes, gateway issuance, revocation and grants.");
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  try { docker(["rm", "--force", container]); } catch { /* Only this run's container is eligible for cleanup. */ }
}
