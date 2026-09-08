// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const { admit, transaction, abort } = vi.hoisted(() => ({ admit: vi.fn(), transaction: vi.fn(), abort: vi.fn() }));
vi.mock("../../../../config/env", () => ({ createDocumentAccessEnv: () => ({ pepper: new Uint8Array(32).fill(1) }) }));
vi.mock("../../../../lib/db/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: () => {
  const result = admit().then((data: unknown) => ({ data, error: null }));
  return Object.assign(result, { abortSignal: (signal: AbortSignal) => { abort(signal); return result; } });
} }) }));
vi.mock("../../../../lib/payments/reconciliation-runtime", () => ({ createReconciliationRuntime: () => ({ transaction }) }));
const hash = `0x${"1".repeat(64)}`;
beforeEach(() => { admit.mockReset().mockResolvedValue({ allowed: true }); transaction.mockReset().mockResolvedValue({ outcome: "pending" }); abort.mockReset(); });
afterEach(() => vi.restoreAllMocks());
const request = (body: string) => new Request("https://example.test/api/reconcile/transaction", { method: "POST", headers: { "Content-Type": "application/json" }, body });

it("accepts only a hash and keeps propagation pending with private headers", async () => {
  const response = await POST(request(JSON.stringify({ transactionHash: hash })));
  expect(response.status).toBe(202);
  expect(transaction).toHaveBeenCalledExactlyOnceWith(hash, undefined, expect.any(Number));
  expect(await response.json()).toEqual({ outcome: "pending" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("bounds admission and includes its elapsed time in the reconciliation deadline", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(0);
  admit.mockImplementation(async () => { clock.mockReturnValue(10_000); return { allowed: true }; });
  const response = await POST(request(JSON.stringify({ transactionHash: hash })));
  expect(response.status).toBe(202);
  expect(abort).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
  expect(transaction).toHaveBeenCalledExactlyOnceWith(hash, undefined, 240_000);
});

it("redacts failed admission without contacting the chain", async () => {
  admit.mockRejectedValue(new Error("private database detail"));
  const response = await POST(request(JSON.stringify({ transactionHash: hash })));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "RECONCILIATION_UNAVAILABLE" });
  expect(transaction).not.toHaveBeenCalled();
});
it.each(["{", JSON.stringify({ transactionHash: "bad" }), JSON.stringify({ transactionHash: hash, amount: "1" })])("rejects untrusted payment facts and invalid input", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(transaction).not.toHaveBeenCalled();
});
it("limits abuse before RPC work and redacts provider errors", async () => {
  admit.mockResolvedValueOnce({ allowed: false });
  expect((await POST(request(JSON.stringify({ transactionHash: hash })))).status).toBe(429);
  expect(transaction).not.toHaveBeenCalled();
  transaction.mockRejectedValue(new Error("secret provider details"));
  const response = await POST(request(JSON.stringify({ transactionHash: hash })));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "RECONCILIATION_UNAVAILABLE" });
});
