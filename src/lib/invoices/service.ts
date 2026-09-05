import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../domain/canonical-json";
import { formatNativeAtomicAmount, parseUsdcAmount } from "../domain/money";
import { isCountryCode } from "../domain/country";
import { IdentityError, walletSchema } from "../identity/contracts";
import type {
  AppliedDefault, ClientBilling, CreateInvoiceDraftInput, DraftContext, DraftRepository, DraftResult, DraftSnapshot, DraftVersion, InvoiceActor, ProposedClientFields,
} from "./contracts";
import { DraftError, type MissingField } from "./errors";
import { isDraftDate, MAX_DRAFT_AMOUNT_ATOMIC, parseDraftInput } from "./schemas";

const actorSchema = z.object({
  workspaceId: z.string().uuid().transform((value) => value.toLowerCase()),
  ownerWallet: walletSchema.nullable(),
  connectorId: z.string().uuid().transform((value) => value.toLowerCase()).nullable(),
}).strict().refine((actor) => (actor.ownerWallet === null) !== (actor.connectorId === null));
const clientFields = ["businessName", "billingAddress", "contactName", "contactEmail"] as const;

function invalidField(path: string): never {
  throw new DraftError("INVALID_INPUT", 400, { fieldIssues: [{ path, reason: "invalid_value" }] });
}

function addDays(value: string, days: number, path: string): string {
  if (!isDraftDate(value) || !Number.isSafeInteger(days) || days < 0) invalidField(path);
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) invalidField(path);
  return date.toISOString().slice(0, 10);
}

function buildCompleteDraftSnapshot(input: CreateInvoiceDraftInput, context: DraftContext, now: () => Date): DraftSnapshot {
  const missingFields: MissingField[] = [];
  const missing = (path: string, reason: MissingField["reason"] = "required") => missingFields.push({ path, reason });
  const { sender } = context;
  const previous = input.draftId ? context.previous?.snapshot : undefined;
  for (const field of [...clientFields, "payoutWallet", "invoicePrefix"] as const) {
    if (!sender?.[field]) missing(`sender.${field}`);
  }
  if (sender?.billingAddress && !isCountryCode(sender.billingAddress.countryCode)) missing("sender.billingAddress.countryCode", "confirmation_required");
  const selected = Boolean(input.client?.id || input.client?.alias);
  const previousClient = selected ? undefined : previous;
  const client = selected ? context.client : null;
  if (input.client?.id && client?.id !== input.client.id) throw new DraftError("NOT_FOUND", 404);
  if (input.client?.alias && client && client.alias !== input.client.alias) invalidField("client");
  const billing: Partial<ClientBilling> = previousClient ? { ...previousClient.client } : client ? {
    businessName: client.businessName, billingAddress: client.billingAddress, contactName: client.contactName, contactEmail: client.contactEmail,
  } : {};
  const clientReference = previousClient?.clientReference ?? {
    id: client?.id ?? null, alias: client?.alias ?? input.client?.alias ?? null, revision: client?.revision ?? null,
  };
  const clientProvenance: DraftSnapshot["clientProvenance"] = previousClient ? { ...previousClient.clientProvenance } : {
    businessName: { kind: "saved_profile" }, billingAddress: { kind: "saved_profile" }, contactName: { kind: "saved_profile" }, contactEmail: { kind: "saved_profile" },
  };
  const changes: ProposedClientFields = { ...previousClient?.proposedClientChanges.fields };
  const baseline = client ?? (previousClient?.clientReference.id === context.client?.id
    && previousClient?.clientReference.revision === context.client?.revision ? context.client : null);
  for (const field of clientFields) {
    const proposal = input.client?.proposed?.[field];
    if (proposal) {
      if (baseline && canonicalJson(baseline[field]) === canonicalJson(proposal.value)) {
        delete changes[field];
        clientProvenance[field] = { kind: "saved_profile" };
      } else {
        Object.assign(changes, { [field]: proposal });
        clientProvenance[field] = proposal.provenance;
      }
      Object.assign(billing, { [field]: proposal.value });
    }
    if (!billing[field]) missing(`client.${field}`);
  }
  if (billing.billingAddress && !isCountryCode(billing.billingAddress.countryCode)) missing("client.billingAddress.countryCode", "confirmation_required");

  const appliedDefaults: AppliedDefault[] = (previous?.appliedDefaults ?? []).filter((entry) =>
    (entry.field === "issueDate" && input.issueDate === undefined) ||
    (entry.field === "dueDate" && input.dueDate === undefined && !input.useDefaultTerms));
  const issueDate = input.issueDate ?? previous?.issueDate ?? now().toISOString().slice(0, 10);
  if (!isDraftDate(issueDate)) invalidField("issueDate");
  if (!input.issueDate && !previous) appliedDefaults.push({ field: "issueDate", value: issueDate, source: "workspace_date" });
  let dueDate = input.dueDate ?? (input.useDefaultTerms ? undefined : previous?.dueDate);
  if (!dueDate && input.useDefaultTerms) {
    if (sender?.defaultPaymentTermsDays === null || sender?.defaultPaymentTermsDays === undefined) {
      missing("dueDate", "default_unavailable");
    } else {
      dueDate = addDays(issueDate, sender.defaultPaymentTermsDays, "dueDate");
      appliedDefaults.push({ field: "dueDate", value: dueDate, source: "sender_terms" });
    }
  } else if (!dueDate) missing("dueDate");
  if (dueDate && dueDate < issueDate) invalidField("dueDate");
  const payableUntil = dueDate ? `${addDays(dueDate, 30, "dueDate")}T00:00:00.000Z` : "";

  let total = 0n;
  const resolvedItems = input.items ?? previous?.items.map((item) => ({ description: item.description, amount: item.amountDecimal }));
  if (!resolvedItems?.length) missing("items");
  const items = (resolvedItems ?? []).map((item, index) => {
    if (!item.description) missing(`items.${index}.description`);
    if (!item.amount) missing(`items.${index}.amount`);
    const amount = item.amount ? parseUsdcAmount(item.amount) : null;
    total += amount?.atomic ?? 0n;
    if (total > MAX_DRAFT_AMOUNT_ATOMIC) invalidField("items");
    return { description: item.description!, amountDecimal: amount?.decimal ?? "", amountAtomic: amount?.atomic.toString() ?? "" };
  });
  if (missingFields.length) throw new DraftError("MISSING_FIELDS", 422, { missingFields });
  appliedDefaults.push({ field: "payableUntil", value: payableUntil, source: "technical_deadline" });
  return {
    schemaVersion: "payr.draft.v1", sender: sender!,
    client: billing as ClientBilling,
    clientReference,
    clientProvenance,
    proposedClientChanges: { kind: clientReference.id ? (Object.keys(changes).length ? "update" : "none") : "create", fields: changes },
    items, issueDate, dueDate: dueDate!, payableUntil,
    amountDecimal: formatNativeAtomicAmount(total), amountAtomic: total.toString(), memo: input.memo ?? previous?.memo ?? "", appliedDefaults,
  };
}

function draftResult(version: DraftVersion): DraftResult {
  const snapshot = version.snapshot;
  const canonicalInvoiceJson = canonicalJson(snapshot);
  // Quoted JSON data stays plain text, including embedded markup and control characters.
  const previewText = [
    `Draft ${version.draftId}, version ${version.version}. Not published.`,
    ...Object.keys(snapshot).sort().map((field) => `${field}: ${canonicalJson(snapshot[field as keyof DraftSnapshot])}`),
  ].join("\n");
  return {
    code: "DRAFT_READY", draftCreated: true, draftId: version.draftId, version: version.version,
    preview: snapshot, previewText, canonicalInvoiceJson,
    approvalInstruction: `Before publication, explicitly approve draft ${version.draftId} version ${version.version}, all resolved facts and defaults, and the pending client-profile diff: ${canonicalJson(snapshot.proposedClientChanges)}. No invoice number, artifact, access link, or client-profile save has been created.`,
  };
}

export function createInvoiceDraftService(repository: DraftRepository, now: () => Date = () => new Date()): {
  createDraft(actor: InvoiceActor, input: unknown): Promise<DraftResult>;
} {
  return {
    async createDraft(actor, rawInput) {
      const input = parseDraftInput(rawInput);
      const parsedActor = actorSchema.safeParse(actor);
      if (!parsedActor.success) throw new IdentityError("FORBIDDEN", 403);
      actor = parsedActor.data;
      const { idempotencyKey, ...normalizedInput } = input;
      const requestFingerprint = createHash("sha256").update(canonicalJson({
        operation: "create_invoice_draft", workspaceId: actor.workspaceId, input: normalizedInput,
      })).digest("hex");
      // Repository admission authorizes the actor even on replay; it must not load fresh resolution facts here.
      const replay = await repository.findReplay(actor, idempotencyKey, requestFingerprint);
      if (replay) return draftResult(replay);
      try {
        const context = await repository.getContext(actor, {
          draftId: input.draftId ?? null, clientId: input.client?.id ?? null, clientAlias: input.client?.alias ?? null,
        });
        if (input.draftId) {
          if (!context.previous || context.previous.draftId !== input.draftId) throw new DraftError("NOT_FOUND", 404);
          if (context.commercialState !== "draft") throw new DraftError("DRAFT_NOT_EDITABLE", 409);
          if (context.previous.version !== input.expectedVersion) {
            throw new DraftError("VERSION_CONFLICT", 409, { draftId: input.draftId, currentVersion: context.previous.version });
          }
        }
        const snapshot = buildCompleteDraftSnapshot(input, context, now);
        return draftResult(await repository.saveDraft(actor, {
          draftId: input.draftId ?? null, expectedVersion: input.expectedVersion ?? null,
          idempotencyKey, requestFingerprint, snapshot,
        }));
      } catch (error) {
        // An identical request may commit after the first replay lookup but before resolution.
        if (error instanceof DraftError && ["VERSION_CONFLICT", "PROFILE_CONFLICT", "MISSING_FIELDS", "INVALID_INPUT", "DRAFT_NOT_EDITABLE", "NOT_FOUND"].includes(error.code)) {
          const completed = await repository.findReplay(actor, idempotencyKey, requestFingerprint);
          if (completed) return draftResult(completed);
        }
        throw error;
      }
    },
  };
}
