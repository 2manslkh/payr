#!/usr/bin/env node
import { createLocalSupabase } from "./local-supabase.mjs";

try {
  const command = process.argv[2];
  if (process.argv.length !== 3 || !["start", "reset", "lint", "status"].includes(command)) {
    throw new Error("Usage: node scripts/run-local-database.mjs <start|reset|lint|status>");
  }
  const runtime = createLocalSupabase();
  if (command === "status") runtime.testEnvironment();
  else runtime.run(command);
  console.log(`Local ${runtime.config.projectId}: ${command} succeeded (API ${runtime.config.apiPort}, Postgres ${runtime.config.dbPort}, shadow ${runtime.config.shadowPort}).`);
} catch {
  // CLI error objects may contain credentials. Never print them.
  console.error("Local database command failed. Check the explicit PAYR_TEST_PROJECT_ID and all three PAYR_TEST_*_PORT values, local Docker, and pinned dependencies. See docs/ops/test-isolation.md.");
  process.exitCode = 1;
}
