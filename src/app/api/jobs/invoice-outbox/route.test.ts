// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { drainInvoiceEmails } from "../../../../lib/email/invoice-runtime";
import { GET } from "./route";
vi.mock("../../../../lib/email/invoice-runtime", () => ({ drainInvoiceEmails: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("requires the cron secret before any bounded invoice drain", async () => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  expect((await GET(new Request("https://example.test/api/jobs/invoice-outbox"))).status).toBe(401);
  expect(drainInvoiceEmails).not.toHaveBeenCalled();
  vi.mocked(drainInvoiceEmails).mockResolvedValue({ outcome: "drained", processed: 2 });
  const result = await GET(new Request("https://example.test/api/jobs/invoice-outbox", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }));
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ outcome: "drained", processed: 2 });
  expect(drainInvoiceEmails).toHaveBeenCalledExactlyOnceWith({ limit: 8 });
  expect(result.headers.get("cache-control")).toContain("no-store");
});

it("supports an independently rotated invoice secret without accepting the other workers' credential", async () => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  vi.stubEnv("PAYR_INVOICE_CRON_SECRET", "y".repeat(32));
  const request = (key: string) => new Request("https://example.test/api/jobs/invoice-outbox", { headers: { authorization: `Bearer ${key}` } });
  expect((await GET(request("x".repeat(32)))).status).toBe(401);
  expect(drainInvoiceEmails).not.toHaveBeenCalled();
  vi.mocked(drainInvoiceEmails).mockResolvedValue({ outcome: "disabled", processed: 0 });
  expect((await GET(request("y".repeat(32)))).status).toBe(200);
  vi.stubEnv("PAYR_INVOICE_CRON_SECRET", "");
  expect((await GET(request("x".repeat(32)))).status).toBe(503);
});
