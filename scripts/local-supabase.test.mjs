import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createLocalSupabase } from "./local-supabase.mjs";
import { spawnSync } from "node:child_process";

const env = { PAYR_TEST_PROJECT_ID: "payr-root-release-v170", PAYR_TEST_API_PORT: "59321",
  PAYR_TEST_DB_PORT: "59322", PAYR_TEST_SHADOW_PORT: "59320" };
const status = { API_URL: "http://127.0.0.1:59321", DB_URL: "postgresql://postgres:postgres@127.0.0.1:59322/postgres",
  ANON_KEY: "local-anon", SERVICE_ROLE_KEY: "local-service" };
function harness(t, overrides = {}) {
  mkdirSync(".supabase", { recursive: true });
  const generatedRoot = mkdtempSync(resolve(".supabase/isolation-test-"));
  t.after(() => rmSync(generatedRoot, { recursive: true, force: true }));
  const calls = [];
  const exec = (file, args, options) => {
    calls.push({ file, args, options });
    if (file === "docker") {
      if (args[0] === "context") return JSON.stringify(overrides.host ?? "unix:///var/run/docker.sock");
      if (args[0] === "container") return overrides.absent ? "" : `supabase_db_${overrides.defaults ? "payr" : "payr-root-release-v170"}\n`;
      if (overrides.absent) throw new Error("No such container");
      const db = args.at(-1).startsWith("supabase_db_");
      return JSON.stringify([{ Name: `/${args.at(-1)}`, Config: { Labels: { "com.supabase.cli.project": overrides.project ?? (overrides.defaults ? "payr" : env.PAYR_TEST_PROJECT_ID) } },
        NetworkSettings: { Ports: { [db ? "5432/tcp" : "8000/tcp"]: [{ HostIp: "0.0.0.0", HostPort: overrides.port ?? (overrides.defaults ? (db ? "58322" : "57321") : (db ? "59322" : "59321")) }] } } }]);
    }
    if (args.includes("--version")) return overrides.version ?? "2.116.0\n";
    if (args.includes("status")) return JSON.stringify({ ...status, ...(overrides.defaults ? {
      API_URL: "http://127.0.0.1:57321", DB_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres" } : {}), ...overrides.status });
    return "";
  };
  return { calls, generatedRoot, create: () => createLocalSupabase({ env: { ...(overrides.defaults ? {} : env), ...overrides.env }, generatedRoot, exec }) };
}

test("uses one generated project for start, reset, lint and status without copying credentials", (t) => {
  const h = harness(t);
  const runtime = h.create();
  for (const command of ["start", "reset", "lint"]) runtime.run(command);
  const child = runtime.testEnvironment();
  assert.equal(child.PAYR_TEST_DB_CONTAINER, "supabase_db_payr-root-release-v170");
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, "local-service");
  assert.equal(child.DOCKER_HOST, "unix:///var/run/docker.sock");
  const commands = h.calls.filter(({ file, args }) => file !== "docker" && !args.includes("--version"));
  for (const { args } of commands) assert.equal(args[args.indexOf("--workdir") + 1], runtime.workdir);
  assert.ok(commands.some(({ args }) => args.includes("reset") && args.includes("--local")));
  assert.ok(commands.some(({ args }) => args.includes("lint") && args.includes("--fail-on")));
  const config = readFileSync(resolve(runtime.workdir, "supabase/config.toml"), "utf8");
  assert.match(config, /project_id = "payr-root-release-v170"/);
  assert.match(config, /port = 59321/);
  assert.match(config, /port = 59322/);
  assert.match(config, /shadow_port = 59320/);
  assert.ok(!config.includes("local-service"));
  assert.equal(realpathSync(resolve(runtime.workdir, "supabase/migrations")), realpathSync("supabase/migrations"));
});

test("rejects host, project, binding and status mismatches before reset or test credentials escape", (t) => {
  for (const overrides of [ { host: "ssh://remote" }, { env: { DOCKER_HOST: "tcp://remote:2375" } },
    { project: "payr" }, { port: "58322" }, { status: { API_URL: "https://remote.supabase.co" } },
    { status: { DB_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres" } },
    { status: { SERVICE_ROLE_KEY: "" } }, { absent: true }, { version: "2.117.0\n" } ]) {
    const h = harness(t, overrides);
    assert.throws(() => h.create().run("reset"));
    assert.ok(!h.calls.some(({ args }) => args.includes("reset")));
  }
});

test("retains the checked-in default workdir for existing CI stacks", (t) => {
  const runtime = harness(t, { defaults: true }).create();
  assert.equal(runtime.workdir, process.cwd());
  runtime.run("reset");
  assert.equal(runtime.testEnvironment().PAYR_TEST_DB_CONTAINER, "supabase_db_payr");
});

test("drops inherited Supabase credentials and remote CLI overrides, and pins the fixture daemon", (t) => {
  const h = harness(t, { env: { SUPABASE_URL: "https://remote.supabase.co", SUPABASE_DB_URL: "postgresql://remote",
    SUPABASE_ACCESS_TOKEN: "inherited-token", SUPABASE_WORKDIR: "/other/worktree", SUPABASE_PROJECT_ID: "remote",
    DOCKER_CONTEXT: "desktop-linux", NODE_ENV: "production", PAYR_TEST_PORT: "3197" } });
  const runtime = h.create();
  const child = runtime.testEnvironment();
  assert.equal(child.SUPABASE_URL, status.API_URL);
  assert.equal(child.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(child.SUPABASE_WORKDIR, undefined);
  assert.equal(child.SUPABASE_PROJECT_ID, undefined);
  assert.equal(child.NODE_ENV, undefined);
  assert.equal(child.DOCKER_CONTEXT, undefined);
  assert.equal(child.PAYR_TEST_PORT, "3197");
  for (const { options } of h.calls) {
    assert.equal(options.env.SUPABASE_ACCESS_TOKEN, undefined);
    assert.equal(options.env.SUPABASE_DB_URL, undefined);
  }
});

test("allows provisioning an absent owned project and refuses arbitrary CLI flags", (t) => {
  const h = harness(t, { absent: true });
  const runtime = h.create();
  runtime.run("start");
  assert.ok(h.calls.some(({ args }) => args.includes("start")));
  assert.throws(() => runtime.run("--linked"));
});

test("keeps two explicit projects in separate ignored directories without changing the template", (t) => {
  const template = readFileSync("supabase/config.toml", "utf8");
  const first = harness(t).create();
  const second = harness(t, { env: { PAYR_TEST_PROJECT_ID: "payr-second-check",
    PAYR_TEST_API_PORT: "59421", PAYR_TEST_DB_PORT: "59422", PAYR_TEST_SHADOW_PORT: "59420" } }).create();
  assert.notEqual(first.workdir, second.workdir);
  assert.match(readFileSync(resolve(second.workdir, "supabase/config.toml"), "utf8"), /project_id = "payr-second-check"/);
  assert.equal(readFileSync("supabase/config.toml", "utf8"), template);
});

test("entrypoints reject retained-project opt-in and CLI flag injection without exposing inherited secrets", () => {
  for (const args of [["scripts/run-local-database.mjs", "reset"],
    ["scripts/run-local-database.mjs", "reset", "--linked"],
    ["scripts/run-local-tests.mjs", "db"], ["scripts/run-local-tests.mjs", "browser"]]) {
    const result = spawnSync(process.execPath, args, { encoding: "utf8",
      env: { ...process.env, ...env, PAYR_TEST_PROJECT_ID: "payr", SUPABASE_SERVICE_ROLE_KEY: "must-not-escape" } });
    assert.equal(result.status, 1);
    assert.ok(!`${result.stdout}${result.stderr}`.includes("must-not-escape"));
  }
});
