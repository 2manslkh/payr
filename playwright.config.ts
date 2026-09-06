import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

const portValue = process.env.PAYR_TEST_PORT ?? "3000";
const port = Number(portValue);
if (!/^[1-9]\d*$/.test(portValue) || !Number.isInteger(port) || port > 65535) {
  throw new Error("PAYR_TEST_PORT must be an integer between 1 and 65535");
}

const baseURL = `http://localhost:${port}`;

// Ephemeral keys per test run, inherited by workers and the local server only.
process.env.PAYR_E2E_SESSION_KEY ??= randomBytes(32).toString("base64");
process.env.PAYR_E2E_CONNECTOR_PEPPER ??= randomBytes(32).toString("base64");
process.env.PAYR_E2E_LINK_KEY ??= randomBytes(32).toString("base64");
const identityEnvironment = {
  NEXT_PUBLIC_APP_URL: baseURL,
  // Test-only publication binding, not a claim that a contract is deployed here.
  NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: `0x${"3".repeat(40)}`,
  ARC_CHAIN_ID: "5042002",
  SESSION_ENCRYPTION_KEY: process.env.PAYR_E2E_SESSION_KEY,
  CONNECTOR_TOKEN_PEPPER: process.env.PAYR_E2E_CONNECTOR_PEPPER,
  LINK_ACTIVE_KEY_VERSION: "1",
  LINK_TOKEN_KEY_V1: process.env.PAYR_E2E_LINK_KEY,
};
Object.assign(process.env, identityEnvironment);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm build && pnpm start --hostname localhost --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    env: identityEnvironment,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
