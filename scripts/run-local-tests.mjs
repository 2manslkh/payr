#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

const mode = process.argv[2];
if (mode !== "db" && mode !== "browser") {
  console.error("Usage: node scripts/run-local-tests.mjs <db|browser> [test arguments]");
  process.exit(1);
}

try {
  // Capture only the running local project's credentials; never evaluate CLI output as shell code.
  const status = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }));
  const api = new URL(status.API_URL);
  const database = new URL(status.DB_URL);
  if (api.origin !== "http://127.0.0.1:57321" || api.username || api.password
    || database.protocol !== "postgresql:" || database.hostname !== "127.0.0.1"
    || database.port !== "58322" || database.username !== "postgres" || database.pathname !== "/postgres"
    || typeof status.ANON_KEY !== "string" || !status.ANON_KEY
    || typeof status.SERVICE_ROLE_KEY !== "string" || !status.SERVICE_ROLE_KEY) {
    throw new Error("Unexpected local project");
  }

  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("SUPABASE_")),
  );
  delete environment.NODE_ENV;
  const command = mode === "db" ? ["test:db"] : ["exec", "playwright", "test"];
  const result = spawnSync("pnpm", [...command, ...process.argv.slice(3)], {
    stdio: "inherit",
    env: {
      ...environment,
      ...(mode === "db" ? { NODE_ENV: "test" } : {}),
      SUPABASE_URL: status.API_URL,
      SUPABASE_DB_URL: status.DB_URL,
      SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    },
  });
  process.exitCode = result.status ?? 1;
} catch {
  console.error("Local database/browser tests require the running Payr stack (API 57321, Postgres 58322). Run pnpm db:start first.");
  process.exitCode = 1;
}
