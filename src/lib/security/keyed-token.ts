import { createHmac, timingSafeEqual } from "node:crypto";

export type LinkPurpose = "invoice-bearer" | "receipt-bearer";

export type DerivedLinkToken = Readonly<{
  slug: string;
  verifierHash: string;
}>;

export type KeyedTokenCodec = Readonly<{
  derive(tokenId: string, purpose: LinkPurpose, keyVersion: number): DerivedLinkToken;
  parseTokenId(slug: string): string | null;
  verify(input: {
    slug: string;
    purpose: LinkPurpose;
    keyVersion: number;
    storedVerifierHash: string;
  }): string | null;
}>;

const TOKEN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const VERIFIER_HASH_PATTERN = /^[0-9a-f]{64}$/;

type ParsedSlug = Readonly<{
  tokenId: string;
  credentialMac: Buffer;
}>;

function tokenIdToBytes(tokenId: string): Buffer {
  if (!TOKEN_ID_PATTERN.test(tokenId)) {
    throw new Error("Token ID must be a canonical lowercase UUID");
  }

  return Buffer.from(tokenId.replaceAll("-", ""), "hex");
}

function tokenIdFromBytes(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function decodeBase64urlSegment(value: string, byteLength: number): Buffer | null {
  const encodedLength = Math.ceil((byteLength * 4) / 3);

  if (value.length !== encodedLength || !BASE64URL_PATTERN.test(value)) {
    return null;
  }

  const bytes = Buffer.from(value, "base64url");

  if (bytes.byteLength !== byteLength || bytes.toString("base64url") !== value) {
    return null;
  }

  return bytes;
}

function parseSlug(slug: string): ParsedSlug | null {
  if (typeof slug !== "string") {
    return null;
  }

  const [tokenSegment, macSegment, extraSegment] = slug.split(".");

  if (!tokenSegment || !macSegment || extraSegment !== undefined) {
    return null;
  }

  const tokenBytes = decodeBase64urlSegment(tokenSegment, 16);
  const credentialMac = decodeBase64urlSegment(macSegment, 32);

  if (!tokenBytes || !credentialMac) {
    return null;
  }

  return { tokenId: tokenIdFromBytes(tokenBytes), credentialMac };
}

function deriveCredentialMac(
  key: Uint8Array,
  tokenId: string,
  purpose: LinkPurpose,
  keyVersion: number,
): Buffer {
  return createHmac("sha256", key)
    .update(`payr:${purpose}:v${keyVersion}:${tokenId}`)
    .digest();
}

function deriveVerifierHash(key: Uint8Array, purpose: LinkPurpose, slug: string): Buffer {
  return createHmac("sha256", key)
    .update(`payr:bearer-lookup:v1:${purpose}:${slug}`)
    .digest();
}

export function createKeyedTokenCodec(keys: ReadonlyMap<number, Uint8Array>): KeyedTokenCodec {
  const keyRing = new Map<number, Buffer>();

  for (const [version, key] of keys) {
    if (key.byteLength < 32) {
      throw new Error("Link token keys must contain at least 32 bytes");
    }

    keyRing.set(version, Buffer.from(key));
  }

  function getKey(keyVersion: number): Buffer {
    const key = keyRing.get(keyVersion);

    if (!key) {
      throw new Error(`Unknown link token key version: ${keyVersion}`);
    }

    return key;
  }

  function derive(tokenId: string, purpose: LinkPurpose, keyVersion: number): DerivedLinkToken {
    const key = getKey(keyVersion);
    const tokenSegment = tokenIdToBytes(tokenId).toString("base64url");
    const credentialMac = deriveCredentialMac(key, tokenId, purpose, keyVersion).toString(
      "base64url",
    );
    const slug = `${tokenSegment}.${credentialMac}`;
    const verifierHash = deriveVerifierHash(key, purpose, slug).toString("hex");

    return { slug, verifierHash };
  }

  function parseTokenId(slug: string): string | null {
    return parseSlug(slug)?.tokenId ?? null;
  }

  function verify(input: {
    slug: string;
    purpose: LinkPurpose;
    keyVersion: number;
    storedVerifierHash: string;
  }): string | null {
    const parsed = parseSlug(input.slug);

    if (!parsed) {
      return null;
    }

    if (!VERIFIER_HASH_PATTERN.test(input.storedVerifierHash)) {
      return null;
    }

    const key = getKey(input.keyVersion);
    const expectedMac = deriveCredentialMac(
      key,
      parsed.tokenId,
      input.purpose,
      input.keyVersion,
    );
    const actualVerifierHash = Buffer.from(input.storedVerifierHash, "hex");
    const expectedVerifierHash = deriveVerifierHash(key, input.purpose, input.slug);

    const credentialMatches = timingSafeEqual(parsed.credentialMac, expectedMac);
    const verifierMatches = timingSafeEqual(actualVerifierHash, expectedVerifierHash);

    return credentialMatches && verifierMatches ? parsed.tokenId : null;
  }

  return { derive, parseTokenId, verify };
}
