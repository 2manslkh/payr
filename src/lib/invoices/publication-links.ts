import { timingSafeEqual } from "node:crypto";
import { canonicalJson } from "../domain/canonical-json";
import { createKeyedTokenCodec, type LinkPurpose } from "../security/keyed-token";
import { PublicationError, type LinkMaterial, type PublicationAttempt, type PublicationLinkConfig } from "./publication-contracts";

export function publicationLink(link: LinkMaterial, purpose: LinkPurpose, config: PublicationLinkConfig): string {
  try {
    const derived = createKeyedTokenCodec(config.keys).derive(link.tokenId, purpose, link.keyVersion);
    if (!/^[0-9a-f]{64}$/.test(link.verifierHash) || !timingSafeEqual(Buffer.from(derived.verifierHash, "hex"), Buffer.from(link.verifierHash, "hex"))) {
      throw new Error("Link metadata mismatch");
    }
    return new URL(`/${purpose === "invoice-bearer" ? "invoice" : "receipt"}/${derived.slug}`, config.appOrigin).href;
  } catch { throw new PublicationError("LINK_UNAVAILABLE", 503); }
}

export function canonicalPublicationJson(attempt: PublicationAttempt): string {
  return canonicalJson({
    schemaVersion: "payr.invoice-document.v1", invoiceId: attempt.invoiceId, invoiceVersion: attempt.invoiceVersion,
    invoiceNumber: attempt.invoiceNumber, invoiceKey: attempt.invoiceKey, chainId: attempt.chainId,
    contractAddress: attempt.contractAddress, invoice: attempt.snapshot,
  });
}
