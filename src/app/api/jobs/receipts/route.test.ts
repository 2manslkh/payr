// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const mocks = vi.hoisted(() => ({ runtime: vi.fn(), run: vi.fn() }));
vi.mock("../../../../lib/receipts/runtime", () => ({ createReceiptRuntime: mocks.runtime }));
vi.mock("../../../../lib/documents/receipt-storage", () => ({ createReceiptDocumentPort: () => ({}) }));
vi.mock("../../../../lib/receipts/worker", () => ({ createReceiptWorker: () => ({ run: mocks.run }) }));
beforeEach(() => { vi.stubEnv("CRON_SECRET", "test-only-cron-secret".repeat(3)); mocks.runtime.mockReset().mockReturnValue({}); mocks.run.mockReset().mockResolvedValue({ outcome: "ready", id: "test-id" }); });
afterEach(() => vi.unstubAllEnvs());
it("requires the cron credential before opening a receipt runtime", async () => {
  expect((await GET(new Request("https://example.test"))).status).toBe(401);
  expect(mocks.runtime).not.toHaveBeenCalled();
});
it("runs one bounded receipt job with private headers", async () => {
  const response = await GET(new Request("https://example.test", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ outcome: "ready", id: "test-id" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
