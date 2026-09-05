import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

const portValue = process.env.PAYR_TEST_PORT ?? "3000";
const port = Number(portValue);
if (!/^[1-9]\d*$/.test(portValue) || !Number.isInteger(port) || port > 65535) {
  throw new Error("PAYR_TEST_PORT must be an integer between 1 and 65535");
}

const baseURL = `http://localhost:${port}`;

// One ephemeral keypair per test run, inherited by workers and the local server only.
process.env.PAYR_E2E_SESSION_KEY ??= randomBytes(32).toString("base64");
process.env.PAYR_E2E_CONNECTOR_PEPPER ??= randomBytes(32).toString("base64");
const identityEnvironment = {
  NEXT_PUBLIC_APP_URL: baseURL,
  ARC_CHAIN_ID: "5042002",
  SESSION_ENCRYPTION_KEY: process.env.PAYR_E2E_SESSION_KEY,
  CONNECTOR_TOKEN_PEPPER: process.env.PAYR_E2E_CONNECTOR_PEPPER,
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
