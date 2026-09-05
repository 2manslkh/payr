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

export function createKeyedTokenCodec(_keys: ReadonlyMap<number, Uint8Array>): KeyedTokenCodec {
  throw new Error("F1 implementation pending");
}
