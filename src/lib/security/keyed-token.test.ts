import { describe, expect, it } from "vitest";

import { createKeyedTokenCodec } from "./keyed-token";

describe("keyed bearer tokens", () => {
  const tokenId = "00112233-4455-6677-8899-aabbccddeeff";
  const key = Uint8Array.from({ length: 32 }, (_, index) => index);

  it("matches the frozen serialization vector across fresh codecs", () => {
    const first = createKeyedTokenCodec(
      new Map([
        [1, key],
        [2, key],
      ]),
    );
    const second = createKeyedTokenCodec(new Map([[1, key]]));
    const expected = {
      slug: "ABEiM0RVZneImaq7zN3u_w.iv2J9o0dPsML8GU7VkbEtf9x6NWJ-DbZa39nNpk2X8E",
      verifierHash: "49df95716626487dac28eec1d2dbadb07af55d5b8d73b4e152182811b617c2b0",
    };

    expect(first.derive(tokenId, "invoice-bearer", 1)).toEqual(expected);
    expect(second.derive(tokenId, "invoice-bearer", 1)).toEqual(expected);
    expect(first.derive(tokenId, "receipt-bearer", 1).slug).not.toBe(expected.slug);
    expect(first.derive(tokenId, "invoice-bearer", 2).slug).not.toBe(expected.slug);
    expect(first.parseTokenId(expected.slug)).toBe(tokenId);
    expect(
      first.verify({
        slug: expected.slug,
        purpose: "invoice-bearer",
        keyVersion: 1,
        storedVerifierHash: expected.verifierHash,
      }),
    ).toBe(tokenId);
    expect(
      first.verify({
        slug: expected.slug,
        purpose: "receipt-bearer",
        keyVersion: 1,
        storedVerifierHash: expected.verifierHash,
      }),
    ).toBeNull();
    expect(
      first.verify({
        slug: expected.slug,
        purpose: "invoice-bearer",
        keyVersion: 1,
        storedVerifierHash: "0".repeat(64),
      }),
    ).toBeNull();
  });

  it("rejects unknown key versions instead of falling back", () => {
    const codec = createKeyedTokenCodec(new Map([[1, key]]));
    const known = codec.derive(tokenId, "invoice-bearer", 1);

    expect(() => codec.derive(tokenId, "invoice-bearer", 2)).toThrow();
    expect(() =>
      codec.verify({
        slug: known.slug,
        purpose: "invoice-bearer",
        keyVersion: 2,
        storedVerifierHash: known.verifierHash,
      }),
    ).toThrow();
    expect(() => createKeyedTokenCodec(new Map([[1, new Uint8Array(31)]]))).toThrow();
  });
});
