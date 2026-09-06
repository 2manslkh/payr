import { z } from "zod";
import { canonicalJson } from "../domain/canonical-json";
import { DocumentUnavailableError, type DocumentRepository } from "../documents/contracts";
import { publicationAttemptSchema, publicationSnapshotSchema, publicationStatusDataSchema } from "./publication";
import type { RpcClient } from "./repositories";

const uuid = z.string().uuid().refine((value) => value === value.toLowerCase());
const storageKey = z.string().regex(/^workspace\/([0-9a-f-]{36})\/invoice\/([0-9a-f-]{36})\/([1-9][0-9]{0,9})\/attempt\/([0-9a-f-]{36})\.pdf$/)
  .refine((value) => {
    const parts = value.split("/");
    return [parts[1], parts[3], parts[6]?.slice(0, -4)].every((id) => uuid.safeParse(id).success)
      && Number(parts[4]) <= 2147483647;
  });
const candidate = publicationAttemptSchema.shape.link.extend({
  purpose: z.enum(["invoice-bearer", "receipt-bearer"]), workspaceId: uuid, invoiceId: uuid, invoiceVersionId: uuid,
}).strict();
const target = publicationStatusDataSchema.safeExtend({ snapshot: publicationSnapshotSchema, attempt: publicationAttemptSchema })
  .refine((value) => {
    const a = value.attempt, s = value.settlement, r = value.receipt;
    if (!["published", "expired"].includes(value.commercialState) || value.voidedAt !== null
      || a.state !== "finalized" || a.link.activatedAt === null || a.link.revokedAt !== null
      || Date.parse(a.link.activatedAt) > Date.now() || Date.parse(a.link.expiresAt) <= Date.now()
      || a.invoiceVersion !== value.invoiceVersion || a.invoiceNumber !== value.invoiceNumber
      || Date.parse(a.snapshot.payableUntil) !== Date.parse(value.payableUntil!)
      || canonicalJson(a.snapshot) !== canonicalJson(value.snapshot)) return false;
    if (s && (s.chainId !== a.chainId || s.contractAddress !== a.contractAddress || s.invoiceVersion !== a.invoiceVersion
      || s.payee !== a.snapshot.sender.payoutWallet || s.amountAtomic !== a.snapshot.amountAtomic
      || s.amountDecimal !== a.snapshot.amountDecimal || s.documentCommitment !== a.artifact!.documentCommitment || r === null)) return false;
    if (r && (r.link.tokenId === a.link.tokenId || r.state === "ready" && r.link.activatedAt === null)) return false;
    const recipients = new Set<string>();
    return value.deliveries.every((d) => {
      if (recipients.has(d.normalizedRecipient)) return false;
      recipients.add(d.normalizedRecipient);
      return d.roles.every((role) => d.normalizedRecipient === (role === "issuer" ? a.snapshot.sender : a.snapshot.client).contactEmail);
    });
  });

export function createDocumentRepository(client: RpcClient): DocumentRepository {
  function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new DocumentUnavailableError();
    return result.data;
  }
  async function call<T>(name: string, parameters: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    try {
      const result = await client.rpc(name, parameters);
      if (!result || result.error !== null) throw new DocumentUnavailableError();
      return parse(schema, result.data);
    } catch { throw new DocumentUnavailableError(); }
  }
  return {
    async findCandidate(tokenId) {
      const id = parse(uuid, tokenId);
      return call("payr_find_invoice_access_candidate_v1", { p_token_id: id }, candidate.refine((v) => v.tokenId === id).nullable());
    },
    async readTarget(tokenId) {
      const id = parse(uuid, tokenId);
      return call("payr_read_invoice_document_v1", { p_token_id: id }, target.refine((v) => v.attempt.link.tokenId === id).nullable());
    },
    async storageState(key) {
      return call("payr_document_storage_state_v1", { p_storage_key: parse(storageKey, key) }, publicationAttemptSchema.shape.state.nullable());
    },
    async admit(scope, keyHash) {
      return call("payr_admit_document_access_v1", { p_scope: parse(z.enum(["ip", "token"]), scope),
        p_key_hash: parse(z.string().regex(/^[0-9a-f]{64}$/), keyHash) }, z.object({ allowed: z.boolean() }).strict());
    },
  };
}
