import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

it("preserves the deployed gateway migration bytes and orders main's additive hardening after it", () => {
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  const files = readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort();
  const gateway = "202609090002_agent_gateway.sql";
  expect(createHash("sha256").update(readFileSync(new URL(gateway, migrations))).digest("hex"))
    .toBe("e519c7ef96ea161530a1e0e05f628ab028ad01f66a563ec3948a7a12e9e1b07c");
  expect(files.indexOf("202609080003_dashboard_overview.sql")).toBeLessThan(files.indexOf(gateway));
  expect(files.indexOf("202609090001_connector_sender_profile.sql")).toBeLessThan(files.indexOf(gateway));
  expect(files.indexOf("202609090010_root_dashboard_hardening.sql")).toBeGreaterThan(files.indexOf(gateway));
  expect(new Set(files.map((name) => name.split("_")[0])).size).toBe(files.length);
});
