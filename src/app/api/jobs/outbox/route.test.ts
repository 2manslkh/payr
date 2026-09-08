// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const mocks = vi.hoisted(() => ({ runtime: vi.fn(), run: vi.fn() }));
vi.mock("../../../../lib/email/runtime", () => ({ createOutboxRuntime: mocks.runtime }));
beforeEach(() => { vi.stubEnv("CRON_SECRET", "test-only-cron-secret".repeat(3)); mocks.runtime.mockReset().mockReturnValue(null); mocks.run.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
const request = () => new Request("https://example.test", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
it("keeps disabled delivery explicit without sending", async () => {
  expect(await (await GET(request())).json()).toEqual({ outcome: "disabled" });
  expect(mocks.run).not.toHaveBeenCalled();
});
it("rejects missing credentials before constructing the outbox", async () => {
  expect((await GET(new Request("https://example.test"))).status).toBe(401);
  expect(mocks.runtime).not.toHaveBeenCalled();
});
it("does not expose provider errors", async () => {
  mocks.runtime.mockReturnValue({ run: mocks.run }); mocks.run.mockRejectedValue(new Error("private provider detail"));
  const response = await GET(request()); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "WORKER_UNAVAILABLE" });
});
