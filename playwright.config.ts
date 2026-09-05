import { defineConfig, devices } from "@playwright/test";

const portValue = process.env.PAYR_TEST_PORT ?? "3000";
const port = Number(portValue);
if (!/^[1-9]\d*$/.test(portValue) || !Number.isInteger(port) || port > 65535) {
  throw new Error("PAYR_TEST_PORT must be an integer between 1 and 65535");
}

const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: process.env.CI
      ? `pnpm build && pnpm start --hostname 127.0.0.1 --port ${port}`
      : `pnpm dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
