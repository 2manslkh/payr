import { z } from "zod";
import { canonicalJson, type JsonValue } from "../domain/canonical-json";
import { isCountryCode } from "../domain/country";
import type { InvoiceActor } from "../invoices/contracts";
import { DraftError } from "../invoices/errors";
import { PublicationError, type PublicationRepository } from "../invoices/publication-contracts";
import type { RpcClient } from "./repositories";

const uuid = z.string().uuid().refine((value) => value === value.toLowerCase());
const addressHex = z.templateLiteral(["0x", z.string().regex(/^[0-9a-f]{40}$/)]);
const hash = z.templateLiteral(["0x", z.string().regex(/^[0-9a-f]{64}$/)]);
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.number().int().min(1).max(2147483647);
const count = z.number().int().min(0).max(2147483647);
const chain = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
const text = (max: number, min = 1) => z.string().min(min).max(max).refine((value) => value.trim() === value);
const email = text(254).pipe(z.email()).refine((value) => value === value.toLowerCase());
const bigintText = z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine((value) => /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n);
const uint256 = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine((value) => /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < (1n << 256n));
const atomic = uint256.refine((value) => value !== "0");
const decimal = z.string().max(79).regex(/^(0|[1-9][0-9]*)(\.[0-9]{0,17}[1-9])?$/).refine((value) => value !== "0");
const money = z.object({ amountDecimal: decimal, amountAtomic: atomic }).refine((value) => {
  if (!decimal.safeParse(value.amountDecimal).success || !atomic.safeParse(value.amountAtomic).success) return false;
  const [whole, fraction = ""] = value.amountDecimal.split(".");
  return BigInt(whole + fraction.padEnd(18, "0")) === BigInt(value.amountAtomic);
});
const address = z.object({ line1: text(200), line2: text(200, 0).optional(), city: text(100), region: text(100, 0).optional(),
  postalCode: text(32), countryCode: z.string().refine(isCountryCode) }).strict();
const billing = z.object({ businessName: text(200), billingAddress: address, contactName: text(200), contactEmail: email }).strict();
const provenance = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user_provided") }).strict(),
  z.object({ kind: z.literal("web_source"), url: text(65536).refine((value) => {
    try { const url = new URL(value); return /^https?:\/\//i.test(value) && ["http:", "https:"].includes(url.protocol)
      && !url.username && !url.password && !/[\s\\]/.test(value); } catch { return false; }
  }) }).strict(),
]);
const resolved = z.union([provenance, z.object({ kind: z.literal("saved_profile") }).strict()]);
const confirmed = <T extends z.ZodType>(value: T) => z.object({ value, provenance, confirmed: z.literal(true) }).strict();
const date = z.iso.date().refine((value) => value >= "2000-01-01");
const snapshot = z.object({
  schemaVersion: z.literal("payr.draft.v1"),
  sender: billing.extend({ id: uuid, revision, payoutWallet: addressHex, invoicePrefix: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,31}$/),
    defaultPaymentTermsDays: z.number().int().min(0).max(365).nullable() }),
  client: billing, clientReference: z.object({ id: uuid.nullable(), alias: text(100).nullable(), revision: revision.nullable() }).strict(),
  clientProvenance: z.object({ businessName: resolved, billingAddress: resolved, contactName: resolved, contactEmail: resolved }).strict(),
  proposedClientChanges: z.object({ kind: z.enum(["none", "create", "update"]), fields: z.object({
    businessName: confirmed(text(200)).optional(), billingAddress: confirmed(address).optional(),
    contactName: confirmed(text(200)).optional(), contactEmail: confirmed(email).optional(),
  }).strict() }).strict(),
  items: z.array(z.object({ description: text(500), amountDecimal: decimal, amountAtomic: atomic }).strict()
    .refine((value) => money.safeParse(value).success)).min(1).max(100),
  issueDate: date, dueDate: date, payableUntil: timestamp, amountDecimal: decimal, amountAtomic: atomic, memo: text(2000, 0),
  appliedDefaults: z.array(z.object({ field: z.enum(["issueDate", "dueDate", "payableUntil"]), value: z.string(),
    source: z.enum(["workspace_date", "sender_terms", "technical_deadline"]) }).strict()).max(3),
}).strict().refine((value) => {
  if (!money.safeParse(value).success || !value.items.every((item) => money.safeParse(item).success)
    || !date.safeParse(value.dueDate).success || value.dueDate < value.issueDate
    || value.items.reduce((sum, item) => sum + BigInt(item.amountAtomic), 0n) !== BigInt(value.amountAtomic)) return false;
  const deadline = new Date(value.dueDate + "T00:00:00.000Z"); deadline.setUTCDate(deadline.getUTCDate() + 30);
  if (deadline.getUTCFullYear() > 9999 || deadline.toISOString() !== value.payableUntil) return false;
  const ref = value.clientReference, fields = value.proposedClientChanges.fields;
  if ((ref.id === null) !== (ref.revision === null) || (ref.id !== null && ref.alias === null)
    || value.proposedClientChanges.kind !== (ref.id === null ? "create" : Object.keys(fields).length ? "update" : "none")
    || (ref.id === null && Object.keys(fields).length !== 4)) return false;
  for (const key of ["businessName", "billingAddress", "contactName", "contactEmail"] as const) {
    const field = fields[key];
    if (field ? canonicalJson(field.value as JsonValue) !== canonicalJson(value.client[key] as JsonValue)
      || canonicalJson(field.provenance) !== canonicalJson(value.clientProvenance[key]) : value.clientProvenance[key].kind !== "saved_profile") return false;
  }
  const seen = new Set<string>();
  for (const applied of value.appliedDefaults) {
    if (seen.has(applied.field) || applied.value !== value[applied.field]
      || applied.source !== ({ issueDate: "workspace_date", dueDate: "sender_terms", payableUntil: "technical_deadline" })[applied.field]) return false;
    seen.add(applied.field);
  }
  return seen.has("payableUntil");
});
const failure = z.enum(["ARTIFACT_VERIFICATION_FAILED", "PROFILE_CONFLICT", "CLIENT_CONFLICT", "AUTH_REVOKED", "DEADLINE_EXPIRED", "VERSION_CONFLICT"]);
const filename = z.string().max(200).regex(/^[A-Za-z0-9_-]+\.pdf$/);
const artifact = z.object({ pdfFilename: filename, contentType: z.literal("application/pdf"), byteLength: z.number().int().min(1).max(10485760),
  invoiceDataHash: hash, pdfContentHash: hash, documentCommitment: hash, qrVerified: z.literal(true) }).strict();
const link = z.object({ tokenId: uuid, keyVersion: revision, verifierHash: fingerprint, expiresAt: timestamp,
  activatedAt: timestamp.nullable(), revokedAt: timestamp.nullable() }).strict();
const attempt = z.object({ id: uuid, workspaceId: uuid, invoiceId: uuid, invoiceVersionId: uuid, invoiceVersion: revision,
  invoiceNumber: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,31}-[2-9][0-9]{3}-[0-9]{6,19}$/), state: z.enum(["reserved", "rendering", "stored", "finalized", "failed"]),
  snapshot, chainId: chain, contractAddress: addressHex.refine((value) => value !== `0x${"0".repeat(40)}`), invoiceKey: hash,
  publicationSalt: hash, storageKey: z.string(), link, leaseOwner: uuid.nullable(), leaseUntil: timestamp.nullable(), fence: bigintText,
  artifact: artifact.nullable(), failureCode: failure.nullable(), finalizedAt: timestamp.nullable(),
}).strict().refine((value) => value.storageKey === `workspace/${value.workspaceId}/invoice/${value.invoiceId}/${value.invoiceVersion}/attempt/${value.id}.pdf`
  && value.invoiceNumber.startsWith(`${value.snapshot.sender.invoicePrefix}-`)
  && (value.state === "failed") === (value.failureCode !== null) && (value.state === "finalized") === (value.finalizedAt !== null)
  && (!["stored", "finalized"].includes(value.state) || value.artifact !== null)
  && (!["reserved", "rendering"].includes(value.state) || value.artifact === null)
  && (value.state !== "reserved" || value.fence === "0" && value.leaseOwner === null)
  && (!["rendering", "stored", "finalized"].includes(value.state) || value.leaseOwner !== null && value.leaseUntil !== null && value.fence !== "0")
  && (value.state !== "finalized" || value.link.activatedAt !== null)
  && (value.state === "finalized" || value.link.activatedAt === null)
  && (value.state !== "failed" || value.link.revokedAt !== null));
const actorSchema = z.object({ workspaceId: uuid, ownerWallet: addressHex.nullable(), connectorId: uuid.nullable() }).strict()
  .refine((value) => (value.ownerWallet === null) !== (value.connectorId === null));
const write = z.object({ draftId: uuid, expectedVersion: revision, approval: z.literal(true), idempotencyKey: text(128),
  requestFingerprint: fingerprint, attemptId: uuid, invoiceKey: hash, publicationSalt: hash, tokenId: uuid, keyVersion: revision,
  verifierHash: fingerprint, chainId: chain, contractAddress: addressHex }).strict();
const fence = z.object({ attemptId: uuid, leaseOwner: uuid, fence: bigintText }).strict();
const voidWrite = z.object({ invoiceId: uuid, expectedVersion: revision, approval: z.literal(true), idempotencyKey: text(128), requestFingerprint: fingerprint }).strict();
const voidResult = z.object({ invoiceId: uuid, invoiceVersion: revision, commercialState: z.literal("voided"), voidedAt: timestamp }).strict();
const settlement = z.object({ chainId: chain, contractAddress: addressHex, invoiceVersion: revision, transactionHash: hash,
  logIndex: count, blockNumber: uint256, blockTime: timestamp, payer: addressHex, payee: addressHex,
  amountDecimal: decimal, amountAtomic: atomic, documentCommitment: hash }).strict().refine((value) => money.safeParse(value).success);
const delivery = z.object({ roles: z.array(z.enum(["issuer", "client"])).refine((value) =>
  ["issuer", "client", "issuer,client"].includes(value.join(","))), normalizedRecipient: email,
  state: z.enum(["pending", "sending", "retry_wait", "sent", "manual_review", "failed"]), providerMessageId: text(1000).nullable(),
  attemptCount: count, nextAttemptAt: timestamp.nullable() }).strict();
const statusData = z.object({ invoiceId: uuid, invoiceVersion: revision, invoiceNumber: text(100).nullable(),
  commercialState: z.enum(["draft", "published", "voided", "expired"]), payableUntil: timestamp.nullable(), voidedAt: timestamp.nullable(),
  snapshot: snapshot.nullable(), attempt: attempt.nullable(), settlement: settlement.nullable(),
  receipt: z.object({ state: z.enum(["pending", "rendering", "retry_wait", "ready", "failed"]), link,
    artifact: z.object({ pdfFilename: filename, pdfContentHash: hash }).strict().nullable() }).strict()
    .refine((value) => value.state !== "ready" || value.artifact !== null).nullable(), deliveries: z.array(delivery),
}).strict().refine((value) => (!value.attempt || value.attempt.invoiceId === value.invoiceId)
  && (value.commercialState === "draft" ? value.invoiceNumber === null && value.payableUntil === null
    : value.invoiceNumber !== null && value.payableUntil !== null)
  && (value.commercialState === "voided") === (value.voidedAt !== null)
  && (value.settlement !== null || value.receipt === null && value.deliveries.length === 0));
const errorStatuses: Readonly<Record<string, number>> = {
  INVALID_INPUT: 400, NOT_FOUND: 404, VERSION_CONFLICT: 409, PROFILE_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409, DRAFT_NOT_EDITABLE: 409, PUBLICATION_IN_PROGRESS: 409, PUBLICATION_RETRYABLE: 503,
  CONFIGURATION_ERROR: 503, PUBLICATION_ARTIFACT_CONFLICT: 409, PUBLICATION_NOT_STORED: 409, INVOICE_NOT_VOIDABLE: 409,
};
// Admission failures use the frozen HTTP vocabulary; terminal worker failures travel in the DTO.
const errorCodes: Readonly<Record<string, string>> = {
  CLIENT_CONFLICT: "PROFILE_CONFLICT", DEADLINE_EXPIRED: "DRAFT_NOT_EDITABLE", INVOICE_ALREADY_SETTLED: "INVOICE_NOT_VOIDABLE",
  PUBLICATION_CONFIGURATION_REQUIRED: "CONFIGURATION_ERROR", PUBLICATION_CONFLICT: "PUBLICATION_RETRYABLE",
};

export function createPublicationRepository(client: RpcClient): PublicationRepository {
  function parse<T>(schema: z.ZodType<T>, value: unknown, output = false): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new PublicationError(output ? "INVALID_DATABASE_RESPONSE" : "INVALID_INPUT", output ? 500 : 400);
    return result.data;
  }
  function scope(actor: InvoiceActor) {
    const value = parse(actorSchema, actor);
    return { p_workspace_id: value.workspaceId, p_owner_wallet: value.ownerWallet, p_connector_id: value.connectorId };
  }
  function fenced(value: z.infer<typeof fence>) {
    return { p_attempt_id: value.attemptId, p_lease_owner: value.leaseOwner, p_fence: value.fence };
  }
  async function call<T>(name: string, parameters: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let result;
    try { result = await client.rpc(name, parameters); } catch { throw new PublicationError("DATABASE_ERROR", 500); }
    if (!result || typeof result !== "object") throw new PublicationError("INVALID_DATABASE_RESPONSE", 500);
    if (result.error !== null) {
      if (!result.error || typeof result.error !== "object") throw new PublicationError("INVALID_DATABASE_RESPONSE", 500);
      const code = Object.hasOwn(errorCodes, result.error.message) ? errorCodes[result.error.message] : result.error.message;
      const status = Object.hasOwn(errorStatuses, code) ? errorStatuses[code] : undefined;
      if (status && ["P0001", "22023"].includes(result.error.code ?? "")) {
        if (result.error.message === "VERSION_CONFLICT") {
          let details: unknown;
          try { details = JSON.parse(result.error.details ?? ""); } catch { throw new PublicationError("DATABASE_ERROR", 500); }
          const parsed = z.object({ draftId: uuid, currentVersion: revision }).strict().safeParse(details);
          if (!parsed.success) throw new PublicationError("DATABASE_ERROR", 500);
          throw new DraftError("VERSION_CONFLICT", status, parsed.data);
        }
        throw new PublicationError(code, status);
      }
      throw new PublicationError("DATABASE_ERROR", 500);
    }
    return parse(schema, result.data, true);
  }
  return {
    async findReplay(actor, idempotencyKey, requestFingerprint) {
      const parameters = scope(actor);
      const key = parse(z.string().trim().min(1).max(128), idempotencyKey);
      const fingerprint = parse(z.string().regex(/^[0-9a-f]{64}$/), requestFingerprint);
      return call("payr_find_publication_replay_v1", { ...parameters, p_idempotency_key: key, p_request_fingerprint: fingerprint },
        attempt.refine((value) => value.workspaceId === actor.workspaceId).nullable());
    },
    async reserve(actor, input) {
      const parameters = scope(actor), value = parse(write, input);
      return call("payr_reserve_publication_v1", { ...parameters, p_input: value }, attempt.refine((a) =>
        a.workspaceId === actor.workspaceId && a.invoiceId === value.draftId && a.invoiceVersion === value.expectedVersion));
    },
    async claim(attemptId, leaseOwner) {
      const id = parse(uuid.nullable(), attemptId), owner = parse(uuid, leaseOwner);
      return call("payr_claim_publication_v1", { p_attempt_id: id, p_lease_owner: owner }, attempt.refine((a) =>
        (id === null || a.id === id) && a.leaseOwner === owner && ["rendering", "stored"].includes(a.state)).nullable());
    },
    async store(input) {
      const value = parse(fence.extend({ artifact }), input);
      return call("payr_store_publication_v1", { ...fenced(value), p_artifact: value.artifact }, attempt.refine((a) =>
        a.id === value.attemptId && a.fence === value.fence && a.leaseOwner === value.leaseOwner && a.state === "stored"
        && canonicalJson(a.artifact) === canonicalJson(value.artifact)).nullable());
    },
    async finalize(input) {
      const value = parse(fence, input);
      return call("payr_finalize_publication_v1", fenced(value), attempt.refine((a) => a.id === value.attemptId
        && a.fence === value.fence && a.leaseOwner === value.leaseOwner && ["finalized", "failed"].includes(a.state)).nullable());
    },
    async fail(input) {
      const value = parse(fence.extend({ failureCode: failure }), input);
      return call("payr_fail_publication_v1", { ...fenced(value), p_failure_code: value.failureCode }, attempt.refine((a) =>
        a.id === value.attemptId && a.fence === value.fence && a.leaseOwner === value.leaseOwner
        && a.state === "failed" && a.failureCode === value.failureCode).nullable());
    },
    async statusData(actor, invoiceId) {
      const parameters = scope(actor), id = parse(uuid, invoiceId);
      return call("payr_publication_status_v1", { ...parameters, p_invoice_id: id }, statusData.refine((s) =>
        s.invoiceId === id && (!s.attempt || s.attempt.workspaceId === actor.workspaceId)).nullable());
    },
    async voidInvoice(actor, input) {
      const parameters = scope(actor), value = parse(voidWrite, input);
      return call("payr_void_invoice_v1", { ...parameters, p_input: value }, voidResult.refine((v) =>
        v.invoiceId === value.invoiceId && v.invoiceVersion === value.expectedVersion));
    },
    async expire(limit) {
      const value = parse(z.number().int().min(1).max(100), limit);
      return call("payr_expire_invoices_v1", { p_limit: value }, z.object({ expired: z.number().int().min(0).max(value) }).strict());
    },
  };
}
