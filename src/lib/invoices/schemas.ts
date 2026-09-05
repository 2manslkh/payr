import { z } from "zod";
import { canonicalJson, type JsonValue } from "../domain/canonical-json";
import { parseUsdcAmount } from "../domain/money";
import { addressSchema } from "../identity/contracts";
import type { CreateInvoiceDraftInput } from "./contracts";
import { DraftError } from "./errors";

export const MAX_DRAFT_BODY_BYTES = 64 * 1024;
export const MAX_DRAFT_AMOUNT_ATOMIC = (1n << 256n) - 1n;

// ISO 3166-1 assigned alpha-2 codes, not reserved or user-assigned codes.
const countries = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" "));

export function isDraftDate(value: string): boolean {
  if (!/^[2-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const date = z.string().refine(isDraftDate);
const billingAddress = addressSchema.extend({ countryCode: z.string().refine((value) => countries.has(value)) }).strict();
const provenance = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user_provided") }).strict(),
  z.object({
    kind: z.literal("web_source"),
    url: z.string().trim().url().refine((value) => {
      try {
        const url = new URL(value);
        return /^https?:\/\//i.test(value) && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !/[\s\\]/.test(value);
      } catch {
        return false;
      }
    }),
  }).strict(),
]);
const confirmed = <T extends z.ZodType>(value: T) => z.object({ value, provenance, confirmed: z.literal(true) }).strict();
const amount = z.string().max(79).transform((value, context) => {
  try {
    const parsed = parseUsdcAmount(value);
    if (parsed.atomic > MAX_DRAFT_AMOUNT_ATOMIC) throw new Error();
    return parsed.decimal;
  } catch {
    context.addIssue({ code: "custom", message: "invalid_amount" });
    return z.NEVER;
  }
});
const schema = z.object({
  draftId: uuid.optional(),
  expectedVersion: z.number().int().positive().optional(),
  client: z.object({
    id: uuid.optional(), alias: text(100).optional(),
    proposed: z.object({
      businessName: confirmed(text(200)).optional(),
      billingAddress: confirmed(billingAddress).optional(),
      contactName: confirmed(text(200)).optional(),
      contactEmail: confirmed(z.string().trim().email().max(254).transform((value) => value.toLowerCase())).optional(),
    }).strict().optional(),
  }).strict().optional(),
  items: z.array(z.object({ description: text(500).optional(), amount: amount.optional() }).strict()).max(100).optional(),
  issueDate: date.optional(), dueDate: date.optional(), useDefaultTerms: z.boolean().optional(),
  memo: z.string().trim().max(2000).optional(),
  idempotencyKey: text(128),
}).strict().superRefine((input, context) => {
  if ((input.draftId === undefined) !== (input.expectedVersion === undefined)) {
    context.addIssue({ code: "custom", path: [input.draftId === undefined ? "draftId" : "expectedVersion"], message: "required_pair" });
  }
  if (input.issueDate && input.dueDate && input.dueDate < input.issueDate) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "invalid_date_order" });
  }
});

export function parseDraftInput(input: unknown): CreateInvoiceDraftInput {
  const invalid = () => new DraftError("INVALID_INPUT", 400, { fieldIssues: [{ path: "$", reason: "invalid_json" }] });
  const ancestors = new Set<object>();
  let nodes = 0;
  function inspect(value: unknown, depth: number): void {
    if (++nodes > MAX_DRAFT_BODY_BYTES || depth > 32) throw invalid();
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || ancestors.has(value)) throw invalid();
    ancestors.add(value);
    for (const key of Object.keys(value)) {
      if (/^(sender|issuer|payout|payee|invoiceprefix)/.test(key.replace(/[_-]/g, "").toLowerCase())) {
        throw new DraftError("PROHIBITED_FIELD", 400);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!("value" in descriptor)) throw invalid();
      inspect(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
  }
  inspect(input, 0);
  try {
    if (Buffer.byteLength(canonicalJson(input as JsonValue), "utf8") > MAX_DRAFT_BODY_BYTES) {
      throw new DraftError("PAYLOAD_TOO_LARGE", 413);
    }
  } catch (error) {
    if (error instanceof DraftError) throw error;
    throw invalid();
  }
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DraftError("INVALID_INPUT", 400, {
      // Zod messages/unknown-key lists can contain input. Only schema paths and fixed codes leave this boundary.
      fieldIssues: result.error.issues.slice(0, 100).map((issue) => ({
        path: issue.path.join(".") || "$", reason: issue.code,
      })),
    });
  }
  const total = (result.data.items ?? []).reduce((sum, item) => sum + (item.amount ? parseUsdcAmount(item.amount).atomic : 0n), 0n);
  const fieldIssues = [];
  if (total > MAX_DRAFT_AMOUNT_ATOMIC) fieldIssues.push({ path: "items", reason: "invalid_value" });
  // The latest due date whose 30-day technical deadline still fits year 9999.
  if (result.data.dueDate && result.data.dueDate > "9999-12-01") fieldIssues.push({ path: "dueDate", reason: "invalid_value" });
  if (fieldIssues.length) throw new DraftError("INVALID_INPUT", 400, { fieldIssues });
  return result.data;
}
