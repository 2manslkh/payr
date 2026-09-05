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
    const expectedReceipt = {
      slug: "ABEiM0RVZneImaq7zN3u_w.AhOv7a8rRVDj21T9gzt7hIsokmWgGIAH7SF9gl4Eb2Y",
      verifierHash: "ee8029cf868128e150a4c389df5027d27140db1db8f30bef22e588f9af2ba699",
    };
    const expectedVersionTwo = {
      slug: "ABEiM0RVZneImaq7zN3u_w.6IkSUxKZMUjs1-q8Vd-1SzmV2M1rfAlsWvRFp2d1ybo",
      verifierHash: "a5a75f60eda5ec443315b23481eea916a74536ef37ab29efe3b9b70838e7b6a3",
    };

    expect(first.derive(tokenId, "invoice-bearer", 1)).toEqual(expected);
    expect(second.derive(tokenId, "invoice-bearer", 1)).toEqual(expected);
    expect(first.derive(tokenId, "receipt-bearer", 1)).toEqual(expectedReceipt);
    expect(second.derive(tokenId, "receipt-bearer", 1)).toEqual(expectedReceipt);
    expect(first.derive(tokenId, "invoice-bearer", 2)).toEqual(expectedVersionTwo);
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

  it("supports parse, candidate load, and stored-hash verification", () => {
    const codec = createKeyedTokenCodec(new Map([[1, key]]));
    const known = codec.derive(tokenId, "invoice-bearer", 1);
    const candidates = new Map([
      [
        tokenId,
        {
          purpose: "invoice-bearer" as const,
          keyVersion: 1,
          storedVerifierHash: known.verifierHash,
        },
      ],
    ]);

    const parsedTokenId = codec.parseTokenId(known.slug);
    const candidate = parsedTokenId ? candidates.get(parsedTokenId) : undefined;

    expect(candidate).toBeDefined();
    expect(codec.verify({ slug: known.slug, ...candidate! })).toBe(tokenId);
  });

  it("does not verify a slug against a different known key version", () => {
    const codec = createKeyedTokenCodec(
      new Map([
        [1, key],
        [2, key],
      ]),
    );
    const known = codec.derive(tokenId, "invoice-bearer", 1);

    expect(
      codec.verify({
        slug: known.slug,
        purpose: "invoice-bearer",
        keyVersion: 2,
        storedVerifierHash: known.verifierHash,
      }),
    ).toBeNull();
  });

  it("rejects noncanonical token IDs", () => {
    const codec = createKeyedTokenCodec(new Map([[1, key]]));
    const malformedTokenIds = [
      tokenId.toUpperCase(),
      tokenId.replaceAll("-", ""),
      `${tokenId} `,
      `g${tokenId.slice(1)}`,
      tokenId.slice(0, -1),
    ];

    for (const malformedTokenId of malformedTokenIds) {
      expect(() => codec.derive(malformedTokenId, "invoice-bearer", 1)).toThrow();
    }
  });

  it("rejects malformed and noncanonical slugs before candidate lookup", () => {
    const codec = createKeyedTokenCodec(new Map([[1, key]]));
    const known = codec.derive(tokenId, "invoice-bearer", 1);
    const [tokenSegment, macSegment] = known.slug.split(".");
    const malformedSlugs = [
      `${known.slug}=`,
      `${known.slug}.extra`,
      `${tokenSegment}.A`,
      `${tokenSegment.slice(0, -1)}x.${macSegment}`,
      `${tokenSegment}.${macSegment.slice(0, -1)}F`,
    ];

    for (const slug of malformedSlugs) {
      expect(codec.parseTokenId(slug)).toBeNull();
      expect(
        codec.verify({
          slug,
          purpose: "invoice-bearer",
          keyVersion: 1,
          storedVerifierHash: known.verifierHash,
        }),
      ).toBeNull();
    }
  });

  it("rejects malformed stored verifier hashes", () => {
    const codec = createKeyedTokenCodec(new Map([[1, key]]));
    const known = codec.derive(tokenId, "invoice-bearer", 1);
    const malformedHashes = [
      known.verifierHash.toUpperCase(),
      known.verifierHash.slice(1),
      `${known.verifierHash}0`,
      "g".repeat(64),
    ];

    for (const storedVerifierHash of malformedHashes) {
      expect(
        codec.verify({
          slug: known.slug,
          purpose: "invoice-bearer",
          keyVersion: 1,
          storedVerifierHash,
        }),
      ).toBeNull();
    }
  });

  it("isolates derivation from mutable input keys and key rings", () => {
    const mutableKey = Uint8Array.from({ length: 32 }, (_, index) => index);
    const mutableKeyRing = new Map([[1, mutableKey]]);
    const codec = createKeyedTokenCodec(mutableKeyRing);
    const known = codec.derive(tokenId, "invoice-bearer", 1);

    mutableKey.fill(255);
    mutableKeyRing.set(1, new Uint8Array(32).fill(127));

    expect(codec.derive(tokenId, "invoice-bearer", 1)).toEqual(known);
    expect(
      codec.verify({
        slug: known.slug,
        purpose: "invoice-bearer",
        keyVersion: 1,
        storedVerifierHash: known.verifierHash,
      }),
    ).toBe(tokenId);
  });

  it("fails closed for non-string slug values at runtime", () => {
    const codec = createKeyedTokenCodec(new Map([[1, key]]));
    const known = codec.derive(tokenId, "invoice-bearer", 1);

    for (const malformedSlug of [null, undefined, 42, {}]) {
      const slug = malformedSlug as unknown as string;

      expect(codec.parseTokenId(slug)).toBeNull();
      expect(
        codec.verify({
          slug,
          purpose: "invoice-bearer",
          keyVersion: 1,
          storedVerifierHash: known.verifierHash,
        }),
      ).toBeNull();
    }
  });
});
