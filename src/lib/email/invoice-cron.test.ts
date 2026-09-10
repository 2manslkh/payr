// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const install = readFileSync(new URL("../../../supabase/ops/install-invoice-email-cron.sql", import.meta.url), "utf8");
const disable = readFileSync(new URL("../../../supabase/ops/disable-invoice-email-cron.sql", import.meta.url), "utf8");

it("schedules a named minute job using a private function, not a secret literal in the cron command", () => {
  expect(install).toContain("cron.schedule('payr-invoice-email-outbox', '* * * * *', 'select public.payr_wake_invoice_email_v1();')");
  expect(install).toContain("current_user <> 'postgres'");
  expect(install).toContain("set search_path = ''");
  expect(install).toContain("revoke all on function public.payr_wake_invoice_email_v1() from public, anon, authenticated, service_role");
  expect(install).not.toMatch(/create extension/i);
});

it("uses Vault for only the canonical invoice-worker origin and cron bearer", () => {
  expect(install).toContain("v_origin is distinct from 'https://payrlink.xyz'");
  expect(install).toContain("from vault.decrypted_secrets where name = 'payr_invoice_email_origin'");
  expect(install).toContain("from vault.decrypted_secrets where name = 'payr_invoice_email_cron_secret'");
  expect(install).toContain("v_secrets <> 1");
  expect(install).toContain("v_origin || '/api/jobs/invoice-outbox'");
  expect(install).toContain("'Authorization', 'Bearer ' || v_secret");
  expect(install).toContain("timeout_milliseconds := 300000");
  expect(install).not.toContain("/api/jobs/outbox'");
});

it("rollback removes only this role's named job and retains queued work and secrets", () => {
  expect(disable).toContain("cron.unschedule(jobid)");
  expect(disable).toContain("jobname = 'payr-invoice-email-outbox' and username = current_user");
  expect(disable).not.toMatch(/delete|truncate|drop/i);
});
