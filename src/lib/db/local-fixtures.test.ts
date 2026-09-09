import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seedBrowserWorkspace, seedBrowserReceivables } from "../../../tests/e2e/workspace-fixture";

vi.mock("node:child_process", () => {
  const execFileSync = vi.fn(() => "");
  return { execFileSync, default: { execFileSync } };
});
const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` };

beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    PAYR_TEST_PROJECT_ID: "payr-root-release-v170", PAYR_TEST_API_PORT: "59321", PAYR_TEST_DB_PORT: "59322",
    PAYR_TEST_SHADOW_PORT: "59320", PAYR_TEST_DB_CONTAINER: "supabase_db_payr-root-release-v170",
    SUPABASE_URL: "http://127.0.0.1:59321", SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:59322/postgres",
    DOCKER_HOST: "unix:///var/run/docker.sock", DOCKER_CONTEXT: undefined, PAYR_TEST_DATABASE_CONTAINER: undefined,
  })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

it("sends both browser seed operations only to the selected project container", () => {
  seedBrowserReceivables(identity);
  expect(execFileSync).toHaveBeenCalledTimes(2);
  for (const [command, args] of vi.mocked(execFileSync).mock.calls) {
    expect(command).toBe("docker");
    expect(args).toEqual(["exec", "-i", "supabase_db_payr-root-release-v170", "psql", "-U", "postgres", "-d", "postgres",
      "--no-psqlrc", "--quiet", "--set=ON_ERROR_STOP=1"]);
  }
});

it.each([
  ["PAYR_TEST_DB_CONTAINER", "supabase_db_payr"], ["SUPABASE_URL", "http://127.0.0.1:57321"],
  ["SUPABASE_DB_URL", "postgresql://postgres:postgres@remote:59322/postgres"],
  ["DOCKER_HOST", "ssh://remote"],
])("refuses %s mismatch before executing fixture SQL", (key, value) => {
  vi.stubEnv(key, value);
  expect(() => seedBrowserReceivables(identity)).toThrow();
  expect(execFileSync).not.toHaveBeenCalled();
});

it("preserves workspace and wallet validation before SQL interpolation", () => {
  expect(() => seedBrowserWorkspace({ ...identity, workspaceId: "'; truncate public.workspaces; --" })).toThrow();
  expect(() => seedBrowserWorkspace({ ...identity, ownerWallet: "invalid" })).toThrow();
  expect(execFileSync).not.toHaveBeenCalled();
});
