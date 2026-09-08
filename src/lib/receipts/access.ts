import { createHmac } from "node:crypto";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { normalizeDocumentIp } from "../documents/access";
import { DocumentUnavailableError, type DocumentAccessConfig, type DocumentRepository } from "../documents/contracts";
import type { LinkMaterial } from "../invoices/publication-contracts";
import type { ReceiptRepository } from "./contracts";

export function createReceiptAccessService(documents: Pick<DocumentRepository, "findCandidate" | "admit">,
  receipts: Pick<ReceiptRepository, "read">, config: DocumentAccessConfig, now: () => number = Date.now) {
  const live = (link: LinkMaterial) => link.activatedAt !== null && Date.parse(link.activatedAt) <= now()
    && Date.parse(link.expiresAt) > now() && link.revokedAt === null;
  return { async resolve(slug: string, ip?: string) {
    try {
      if (ip !== undefined) {
        const hash = createHmac("sha256", config.pepper).update(`payr:document-access:v1:ip:${normalizeDocumentIp(ip)}`).digest("hex");
        if (!(await documents.admit("ip", hash)).allowed) return null;
      }
      const codec = createKeyedTokenCodec(config.keys);
      const tokenId = codec.parseTokenId(slug);
      if (!tokenId) return null;
      const candidate = await documents.findCandidate(tokenId);
      if (!candidate || candidate.purpose !== "receipt-bearer" || !live(candidate) || !config.keys.has(candidate.keyVersion)
        || codec.verify({ slug, purpose: "receipt-bearer", keyVersion: candidate.keyVersion, storedVerifierHash: candidate.verifierHash }) !== tokenId) return null;
      if (ip !== undefined) {
        const hash = createHmac("sha256", config.pepper).update(`payr:document-access:v1:token:${tokenId}`).digest("hex");
        if (!(await documents.admit("token", hash)).allowed) return null;
      }
      const target = await receipts.read(tokenId);
      if (!target || target.state !== "ready" || !target.artifact || !live(target.link)
        || target.workspaceId !== candidate.workspaceId || target.invoiceId !== candidate.invoiceId || target.invoiceVersionId !== candidate.invoiceVersionId
        || target.link.tokenId !== tokenId || target.link.keyVersion !== candidate.keyVersion
        || target.link.expiresAt !== candidate.expiresAt || target.link.activatedAt !== candidate.activatedAt
        || codec.verify({ slug, purpose: "receipt-bearer", keyVersion: target.link.keyVersion, storedVerifierHash: target.link.verifierHash }) !== tokenId) return null;
      return target;
    } catch { throw new DocumentUnavailableError(); }
  } };
}
