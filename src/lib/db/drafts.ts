import { z } from "zod";
import { COMMERCIAL_STATES, deriveDisplayStatus } from "../domain/invoice";
import { isCountryCode } from "../domain/country";
import { savedClientProvenanceSchema } from "../identity/contracts";
import type { DraftRepository, DraftSnapshot, InvoiceActor } from "../invoices/contracts";
import { DraftError } from "../invoices/errors";
import type { RpcClient } from "./repositories";

const uuid = z.string().uuid().refine((value) => value === value.toLowerCase());
const wallet = z.string().regex(/^0x[0-9a-f]{40}$/);
const revision = z.number().int().min(1).max(2147483647);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
const text = (max: number, min = 1) => z.string().min(min).max(max).refine((value) => value.trim() === value);
const email = text(254).pipe(z.email()).refine((value) => value === value.toLowerCase());
const address = z.object({ line1: text(200), line2: text(200, 0).optional(), city: text(100),
  region: text(100, 0).optional(), postalCode: text(32), countryCode: z.string().refine(isCountryCode),
}).strict();
const billing = z.object({ businessName: text(200), billingAddress: address, contactName: text(200), contactEmail: email }).strict();
const sender = z.object({ id: uuid, revision, businessName: text(200).nullable(), billingAddress: address.nullable(),
  contactName: text(200).nullable(), contactEmail: email.nullable(), payoutWallet: wallet,
  invoicePrefix: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,31}$/).nullable(),
  defaultPaymentTermsDays: z.number().int().min(0).max(365).nullable(),
}).strict();
const provenance = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user_provided") }).strict(),
  z.object({ kind: z.literal("web_source"), url: text(65536).refine((value) => {
    try { const url = new URL(value); return /^https?:\/\//i.test(value) && ["http:", "https:"].includes(url.protocol)
      && !url.username && !url.password && !/[\s\\]/.test(value); } catch { return false; }
  }) }).strict(),
]);
const resolvedProvenance = z.union([provenance, z.object({ kind: z.literal("saved_profile") }).strict()]);
const confirmed = <T extends z.ZodType>(value: T) => z.object({ value, provenance, confirmed: z.literal(true) }).strict();
const proposed = z.object({ businessName: confirmed(text(200)).optional(), billingAddress: confirmed(address).optional(),
  contactName: confirmed(text(200)).optional(), contactEmail: confirmed(email).optional(),
}).strict();
const uint256 = (1n << 256n) - 1n;
const atomic = z.string().regex(/^[1-9][0-9]{0,77}$/).refine((value) => /^[1-9][0-9]{0,77}$/.test(value) && BigInt(value) <= uint256);
const decimal = z.string().max(79).regex(/^(0|[1-9][0-9]*)(\.[0-9]{0,17}[1-9])?$/).refine((value) => value !== "0");
const toAtomic = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole + fraction.padEnd(18, "0")); };
const money = z.object({ amountDecimal: decimal, amountAtomic: atomic }).refine((value) => decimal.safeParse(value.amountDecimal).success
  && atomic.safeParse(value.amountAtomic).success && toAtomic(value.amountDecimal) === BigInt(value.amountAtomic));
const date = z.iso.date().refine((value) => value >= "2000-01-01");
const snapshot = z.object({
  schemaVersion: z.literal("payr.draft.v1"), sender: sender.refine((value) => value.businessName !== null
    && value.billingAddress !== null && value.contactName !== null && value.contactEmail !== null && value.invoicePrefix !== null),
  client: billing,
  clientReference: z.object({ id: uuid.nullable(), alias: text(100).nullable(), revision: revision.nullable() }).strict()
    .refine((value) => (value.id === null) === (value.revision === null) && (value.id === null || value.alias !== null)),
  clientProvenance: z.object({ businessName: resolvedProvenance, billingAddress: resolvedProvenance,
    contactName: resolvedProvenance, contactEmail: resolvedProvenance }).strict(),
  proposedClientChanges: z.object({ kind: z.enum(["none", "create", "update"]), fields: proposed }).strict(),
  items: z.array(z.object({ description: text(500), amountDecimal: decimal, amountAtomic: atomic }).strict()
    .refine((value) => money.safeParse(value).success)).min(1).max(100),
  issueDate: date, dueDate: date, payableUntil: timestamp, amountDecimal: decimal, amountAtomic: atomic,
  memo: text(2000, 0), appliedDefaults: z.array(z.object({ field: z.enum(["issueDate", "dueDate", "payableUntil"]),
    value: z.string(), source: z.enum(["workspace_date", "sender_terms", "technical_deadline"]) }).strict()).max(3),
}).strict().refine((value) => {
  if (!money.safeParse(value).success || !value.items.every((item) => money.safeParse(item).success)
    || !date.safeParse(value.issueDate).success || !date.safeParse(value.dueDate).success || value.dueDate < value.issueDate
    || value.items.reduce((sum, item) => sum + BigInt(item.amountAtomic), 0n) !== BigInt(value.amountAtomic)) return false;
  const deadline = new Date(value.dueDate + "T00:00:00.000Z");
  deadline.setUTCDate(deadline.getUTCDate() + 30);
  if (deadline.getUTCFullYear() > 9999 || deadline.toISOString() !== value.payableUntil) return false;
  const fields = value.proposedClientChanges.fields;
  const keys = ["businessName", "billingAddress", "contactName", "contactEmail"] as const;
  if (value.clientReference.id === null ? value.proposedClientChanges.kind !== "create" || Object.keys(fields).length !== 4
    : value.proposedClientChanges.kind !== (Object.keys(fields).length ? "update" : "none")) return false;
  for (const key of keys) {
    const field = fields[key];
    if (field ? !equalJson(field.value, value.client[key]) || !equalJson(field.provenance, value.clientProvenance[key])
      : value.clientProvenance[key].kind !== "saved_profile") return false;
  }
  const seen = new Set<string>();
  for (const applied of value.appliedDefaults) {
    if (seen.has(applied.field) || applied.value !== value[applied.field]) return false;
    seen.add(applied.field);
    if (applied.source !== ({ issueDate: "workspace_date", dueDate: "sender_terms", payableUntil: "technical_deadline" })[applied.field]) return false;
  }
  return seen.has("payableUntil");
});
function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || !left || typeof right !== "object" || !right) return false;
  const a = Object.entries(left), b = Object.entries(right);
  return a.length === b.length && a.every(([key, value]) => Object.hasOwn(right, key) && equalJson(value, Reflect.get(right, key)));
}
function initialDefaults(value: DraftSnapshot): boolean {
  return !value.appliedDefaults.some((entry) => entry.field === "dueDate") || (value.sender.defaultPaymentTermsDays !== null
    && Date.parse(value.dueDate) === Date.parse(value.issueDate) + value.sender.defaultPaymentTermsDays * 86400000);
}
const version = z.object({ id: uuid, draftId: uuid, version: revision, snapshot, createdAt: timestamp }).strict()
  .refine((value) => value.version !== 1 || initialDefaults(value.snapshot));
const commercial = z.enum(COMMERCIAL_STATES);
const summary = z.object({ id: uuid, invoiceNumber: text(100).nullable(), version: revision, clientName: text(200).nullable(),
  amountDecimal: decimal.nullable(), amountAtomic: atomic.nullable(), issueDate: date.nullable(), dueDate: date.nullable(),
  payableUntil: timestamp.nullable(), commercialState: commercial, paymentStatus: z.enum(["unpaid", "paid"]),
  displayStatus: z.enum(["Draft", "Published", "Voided", "Expired", "Paid"]), updatedAt: timestamp,
}).strict().refine((value) => (value.amountDecimal === null ? value.amountAtomic === null : money.safeParse(value).success)
  && value.displayStatus === deriveDisplayStatus(value.commercialState, value.paymentStatus === "paid" ? { blockTime: new Date(0) } : null));
const history = z.array(z.object({ id: uuid, version: revision, createdAt: timestamp }).strict());
// F2 admitted any uppercase pair. Surface those stored values as actionable draft omissions, not provider failures.
const storedAddress = address.extend({ countryCode: z.string().regex(/^[A-Z]{2}$/) });
const context = z.object({ sender: sender.extend({ billingAddress: storedAddress.nullable() }).nullable(), client: billing.extend({ billingAddress: storedAddress, id: uuid, revision, alias: text(100),
  provenance: z.record(z.string().regex(/^(alias|businessName|billingAddress|contactName|contactEmail)$/),
    savedClientProvenanceSchema),
}).nullable(), previous: version.nullable(), commercialState: commercial.nullable() }).strict();
const write = z.object({ draftId: uuid.nullable(), expectedVersion: revision.nullable(), idempotencyKey: text(128),
  requestFingerprint: z.string().regex(/^[0-9a-f]{64}$/), snapshot }).strict()
  .refine((value) => (value.draftId === null) === (value.expectedVersion === null)
    && (value.draftId !== null || initialDefaults(value.snapshot)));
const actorSchema = z.object({ workspaceId: uuid, ownerWallet: wallet.nullable(), connectorId: uuid.nullable() }).strict()
  .refine((value) => (value.ownerWallet === null) !== (value.connectorId === null));
const errorStatuses: Readonly<Record<string, number>> = {
  INVALID_INPUT: 400, NOT_FOUND: 404, VERSION_CONFLICT: 409, PROFILE_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409, DRAFT_NOT_EDITABLE: 409, PUBLICATION_IN_PROGRESS: 409,
};

export function createDraftRepository(client: RpcClient): DraftRepository {
  function input<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new DraftError("INVALID_INPUT", 400);
    return parsed.data;
  }
  function scope(actor: InvoiceActor) {
    const value = input(actorSchema, actor);
    return { p_workspace_id: value.workspaceId, p_owner_wallet: value.ownerWallet, p_connector_id: value.connectorId };
  }
  async function call<T>(name: string, parameters: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let result;
    try { result = await client.rpc(name, parameters); } catch { throw new DraftError("DATABASE_ERROR", 500); }
    if (result.error) {
      const status = Object.hasOwn(errorStatuses, result.error.message) ? errorStatuses[result.error.message] : undefined;
      if (status && ["P0001", "22023"].includes(result.error.code ?? "")) {
        if (result.error.message === "VERSION_CONFLICT") {
          let detail: unknown;
          try { detail = JSON.parse(result.error.details ?? ""); } catch { throw new DraftError("DATABASE_ERROR", 500); }
          const parsed = z.object({ draftId: uuid, currentVersion: revision }).strict().safeParse(detail);
          if (!parsed.success) throw new DraftError("DATABASE_ERROR", 500);
          throw new DraftError("VERSION_CONFLICT", status, parsed.data);
        }
        throw new DraftError(result.error.message, status);
      }
      throw new DraftError("DATABASE_ERROR", 500);
    }
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) throw new DraftError("INVALID_DATABASE_RESPONSE", 500);
    return parsed.data;
  }
  return {
    async findReplay(actor, key, fingerprint) { return call("payr_find_draft_replay_v1", { ...scope(actor),
      p_idempotency_key: input(text(128), key), p_request_fingerprint: input(write.shape.requestFingerprint, fingerprint),
    }, version.nullable()); },
    async getContext(actor, value) {
      const scoped = scope(actor);
      const parsed = input(z.object({ draftId: uuid.nullable(), clientId: uuid.nullable(), clientAlias: text(100).nullable() }).strict(), value);
      return call("payr_get_draft_context_v1", { ...scoped, p_draft_id: parsed.draftId,
        p_client_id: parsed.clientId, p_client_alias: parsed.clientAlias }, context);
    },
    async saveDraft(actor, value) { return call("payr_save_invoice_draft_v1", { ...scope(actor), p_input: input(write, value) }, version); },
    async listInvoices(actor, value) {
      const scoped = scope(actor);
      const query = input(z.object({ search: text(200, 0), commercialState: commercial.nullable(),
        limit: z.number().int().min(1).max(50), offset: z.number().int().min(0).max(2147483647) }).strict(), value);
      return call("payr_list_invoices_v1", { ...scoped, p_search: query.search, p_commercial_state: query.commercialState,
        p_limit: query.limit, p_offset: query.offset }, z.object({ items: z.array(summary).max(query.limit), hasMore: z.boolean() }).strict());
    },
    async getInvoiceDetail(actor, id) { return call("payr_get_invoice_detail_v1", { ...scope(actor), p_invoice_id: input(uuid, id) },
      z.object({ invoice: summary, version: version.nullable(), history }).strict().refine((value) => value.version === null
        || (value.invoice.id === value.version.draftId && value.invoice.version === value.version.version)).nullable()); },
    async getOverview(actor) { return call("payr_get_invoice_overview_v1", scope(actor), z.object({
      senderComplete: z.boolean(), clientCount: count, activeConnectorCount: count, invoiceCount: count, draftCount: count,
      receivablesAtomic: z.string().regex(/^(0|[1-9][0-9]*)$/), attention: z.array(summary).max(50),
      latestSettlement: z.object({ invoiceId: uuid, invoiceNumber: text(100), transactionHash: z.string().regex(/^0x[0-9a-f]{64}$/),
        blockTime: timestamp, amountDecimal: decimal }).strict().nullable(),
    }).strict()); },
  };
}
