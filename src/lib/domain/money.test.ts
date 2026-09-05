import { describe, expect, it } from "vitest";

import { formatNativeAtomicAmount, parseUsdcAmount } from "./money";

describe("native Arc USDC money", () => {
  it("parses and formats exact 18-decimal atomic values", () => {
    expect(parseUsdcAmount("1.2300")).toEqual({
      decimal: "1.23",
      atomic: 1_230_000_000_000_000_000n,
    });
    expect(parseUsdcAmount("0.000000000000000001").atomic).toBe(1n);
    expect(parseUsdcAmount("1.000000000000000000")).toEqual({
      decimal: "1",
      atomic: 1_000_000_000_000_000_000n,
    });
    expect(formatNativeAtomicAmount(1_230_000_000_000_000_000n)).toBe("1.23");
    expect(formatNativeAtomicAmount(1n)).toBe("0.000000000000000001");

    expect(parseUsdcAmount("9007199254740993.000000000000000001")).toEqual({
      decimal: "9007199254740993.000000000000000001",
      atomic: 9_007_199_254_740_993_000_000_000_000_000_001n,
    });
    expect(formatNativeAtomicAmount(9_007_199_254_740_993_000_000_000_000_000_001n)).toBe(
      "9007199254740993.000000000000000001",
    );

    for (const input of [
      "",
      "+1",
      "-1",
      "1e3",
      "1,000",
      "0",
      "0.0",
      "0.000000000000000000",
      "01",
      "00.1",
      ".1",
      "1.",
      " 1",
      "1 ",
      "1.0000000000000000001",
    ]) {
      expect(() => parseUsdcAmount(input)).toThrow();
    }

    expect(() => formatNativeAtomicAmount(0n)).toThrow();
    expect(() => formatNativeAtomicAmount(-1n)).toThrow();
  });
});
