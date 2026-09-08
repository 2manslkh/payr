// @vitest-environment node
import { expect, it, vi } from "vitest";
import { locateReplacement } from "./browser-payment";

it("recovers a committed replacement from persisted sender/nonce after the original disappears", async () => {
  const from = `0x${"1".repeat(40)}` as const, hash = `0x${"2".repeat(64)}` as const;
  const nonceAt = vi.fn(async (block: bigint) => block < 130n ? 7 : 8), transactions = vi.fn(async () => [{ from, nonce: 7, hash }]);
  expect(await locateReplacement({ from, nonce: 7, firstBlock: "100" }, 1000n, nonceAt, transactions)).toBe(hash);
  expect(transactions).toHaveBeenCalledExactlyOnceWith(130n); expect(nonceAt.mock.calls.length).toBeLessThan(15);
});
it("never infers cancellation from a timeout or an unconsumed nonce", async () => {
  const transactions = vi.fn();
  expect(await locateReplacement({ from: `0x${"1".repeat(40)}`, nonce: 7, firstBlock: "100" }, 1000n, async () => 7, transactions)).toBeNull();
  expect(transactions).not.toHaveBeenCalled();
});
