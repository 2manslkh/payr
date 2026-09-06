import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { createKeyedTokenCodec } from "../security/keyed-token";
import type { LinkMaterial } from "../invoices/publication-contracts";
import { DocumentUnavailableError, type DocumentAccessConfig, type DocumentRepository, type InvoiceAccessTarget } from "./contracts";

const tokenIdSchema = z.string().uuid();

export function createInvoiceAccessService(repository: DocumentRepository, config: DocumentAccessConfig) {
  return {
    async resolve(slug: string, ip?: string): Promise<InvoiceAccessTarget | null> {
      try {
        if (ip !== undefined) {
          const keyHash = createHmac("sha256", config.pepper)
            .update(`payr:document-access:v1:ip:${normalizeDocumentIp(ip)}`).digest("hex");
          // The IP-stage RPC also enforces the database-minute global ceiling.
          if (!(await repository.admit("ip", keyHash)).allowed) return null;
        }
        const codec = createKeyedTokenCodec(config.keys);
        const tokenId = codec.parseTokenId(slug);
        if (!tokenId || !tokenIdSchema.safeParse(tokenId).success) return null;
        const candidate = await repository.findCandidate(tokenId);
        if (!candidate || candidate.tokenId !== tokenId || candidate.purpose !== "invoice-bearer"
          || !config.keys.has(candidate.keyVersion)
          || codec.verify({ slug, purpose: "invoice-bearer", keyVersion: candidate.keyVersion,
            storedVerifierHash: candidate.verifierHash }) !== tokenId || !liveLink(candidate)) return null;
        if (ip !== undefined) {
          const keyHash = createHmac("sha256", config.pepper)
            .update(`payr:document-access:v1:token:${tokenId}`).digest("hex");
          if (!(await repository.admit("token", keyHash)).allowed) return null;
        }
        const target = await repository.readTarget(tokenId);
        if (!target) return null;
        const { attempt } = target;
        if (!attempt || attempt.workspaceId !== candidate.workspaceId || attempt.invoiceId !== candidate.invoiceId
          || attempt.invoiceVersionId !== candidate.invoiceVersionId || target.invoiceId !== candidate.invoiceId
          || target.invoiceVersion !== attempt.invoiceVersion || target.invoiceNumber !== attempt.invoiceNumber
          || !["published", "expired"].includes(target.commercialState) || target.voidedAt !== null
          || attempt.state !== "finalized" || !attempt.artifact || attempt.finalizedAt === null
          || !(Date.parse(attempt.finalizedAt) <= Date.now()) || !liveLink(attempt.link)
          || attempt.link.tokenId !== candidate.tokenId || attempt.link.keyVersion !== candidate.keyVersion
          || attempt.link.activatedAt !== candidate.activatedAt || attempt.link.expiresAt !== candidate.expiresAt
          || attempt.link.revokedAt !== candidate.revokedAt
          || codec.verify({ slug, purpose: "invoice-bearer", keyVersion: attempt.link.keyVersion,
            storedVerifierHash: attempt.link.verifierHash }) !== tokenId) return null;
        return target;
      } catch { throw new DocumentUnavailableError(); }
    },
  };
}

function normalizeDocumentIp(value: string): string {
  if (value.length > 45 || value.includes("%")) return "local";
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) return "local";
  return new URL(`http://[${value}]/`).hostname.slice(1, -1);
}

function liveLink(link: LinkMaterial): boolean {
  const now = Date.now();
  return link.activatedAt !== null && Date.parse(link.activatedAt) <= now
    && now < Date.parse(link.expiresAt) && link.revokedAt === null;
}
