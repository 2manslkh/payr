#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createLocalSupabase } from "./local-supabase.mjs";

const mode = process.argv[2];
if (mode !== "db" && mode !== "browser") {
  console.error("Usage: node scripts/run-local-tests.mjs <db|browser> [test arguments]");
  process.exit(1);
}

try {
  const environment = createLocalSupabase().testEnvironment();
  const command = mode === "db" ? ["test:db"] : ["exec", "playwright", "test"];
  const result = spawnSync("pnpm", [...command, ...process.argv.slice(3)], {
    stdio: "inherit",
    env: {
      ...environment,
      ...(mode === "db" ? { NODE_ENV: "test" } : {}),
    },
  });
  process.exitCode = result.status ?? 1;
} catch {
  console.error("Local database/browser tests require the selected running Payr stack with matching project and ports. Run pnpm db:start with the same isolation environment. See docs/ops/test-isolation.md.");
  process.exitCode = 1;
}
