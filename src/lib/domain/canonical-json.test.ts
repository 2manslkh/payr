import { describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical-json";

describe("canonicalJson", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(
      canonicalJson({
        z: [{ b: 2, a: 1 }, "first"],
        a: { d: true, c: null },
      }),
    ).toBe('{"a":{"c":null,"d":true},"z":[{"a":1,"b":2},"first"]}');

    const supplementary = "\u{10000}";
    const privateUse = "\uE000";
    expect(canonicalJson({ [privateUse]: 2, [supplementary]: 1 })).toBe(
      `{"${supplementary}":1,"${privateUse}":2}`,
    );

    expect(() => canonicalJson({ value: Number.NaN })).toThrow();
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => canonicalJson({ value: Number.NEGATIVE_INFINITY })).toThrow();
    expect(() => canonicalJson({ value: undefined } as unknown as Parameters<typeof canonicalJson>[0])).toThrow();
    expect(() => canonicalJson({ value: new Date(0) } as unknown as Parameters<typeof canonicalJson>[0])).toThrow();
    expect(() => canonicalJson({ value: 1n } as unknown as Parameters<typeof canonicalJson>[0])).toThrow();
  });
});
