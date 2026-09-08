// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const { backfill } = vi.hoisted(() => ({ backfill: vi.fn().mockResolvedValue({ ranges: 1 }) }));
vi.mock("../../../../lib/payments/reconciliation-runtime", () => ({ createReconciliationRuntime: () => ({ backfill }) }));
afterEach(() => { vi.unstubAllEnvs(); backfill.mockClear(); });
it("requires the exact configured worker credential before scanning", async () => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  expect((await GET(new Request("https://example.test"))).status).toBe(401);
  expect(backfill).not.toHaveBeenCalled();
  expect((await GET(new Request("https://example.test", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }))).status).toBe(200);
  expect(backfill).toHaveBeenCalledExactlyOnceWith(50);
});
