#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

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
    || database.port !== "57322" || database.username !== "postgres" || database.pathname !== "/postgres"
    || typeof status.ANON_KEY !== "string" || !status.ANON_KEY
    || typeof status.SERVICE_ROLE_KEY !== "string" || !status.SERVICE_ROLE_KEY) {
    throw new Error("Unexpected local project");
  }

  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("SUPABASE_")),
  );
  const result = spawnSync("pnpm", ["test:db", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: {
      ...environment,
      NODE_ENV: "test",
      SUPABASE_URL: status.API_URL,
      SUPABASE_DB_URL: status.DB_URL,
      SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    },
  });
  process.exitCode = result.status ?? 1;
} catch {
  console.error("Database tests require the running local Payr stack on 5732x ports. Run pnpm db:start first.");
  process.exitCode = 1;
}
