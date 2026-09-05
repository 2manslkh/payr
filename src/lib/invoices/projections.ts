import { apiError, privateJson } from "../auth/runtime";
import { COMMERCIAL_STATES } from "../domain/invoice";
import { formatNativeAtomicAmount } from "../domain/money";
import { IdentityError, type IdentitySession } from "../identity/contracts";
import type { InvoiceActor, InvoiceQuery } from "./contracts";
import { DraftError } from "./errors";

export const INVOICE_PAGE_SIZE = 50;
export const MAX_INVOICE_OFFSET = 10_000;
export type InvoiceSearchParams = Record<string, string | string[] | undefined>;

export function invoiceQuery(params: InvoiceSearchParams | URLSearchParams): InvoiceQuery {
  const entries = params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params);
  const values: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!["search", "state", "offset"].includes(key) || Object.hasOwn(values, key)
      || typeof value !== "string") throw new DraftError("INVALID_INPUT", 400);
    values[key] = value;
  }
  const search = values.search ?? "";
  const state = values.state || null;
  const offset = values.offset ?? "0";
  if (search.length > 200 || /[\u0000-\u001f\u007f]/.test(search)
    || (state !== null && !COMMERCIAL_STATES.some((value) => value === state))
    || !/^(0|[1-9][0-9]{0,4})$/.test(offset) || Number(offset) > MAX_INVOICE_OFFSET) {
    throw new DraftError("INVALID_INPUT", 400);
  }
  return { search: search.trim(), commercialState: state as InvoiceQuery["commercialState"], limit: INVOICE_PAGE_SIZE, offset: Number(offset) };
}

export function ownerActor(session: IdentitySession): InvoiceActor {
  return { workspaceId: session.workspaceId, ownerWallet: session.ownerWallet, connectorId: null };
}

export function invoiceId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new DraftError("NOT_FOUND", 404);
  }
  return value.toLowerCase();
}

export function receivablesDecimal(atomic: string): string {
  return atomic === "0" ? "0" : formatNativeAtomicAmount(BigInt(atomic));
}

// Read endpoints expose only these codes. Provider messages, details and status values are never reflected.
export function safeDraftError(error: unknown): Response {
  if (error instanceof IdentityError) return apiError(error);
  const statuses: Readonly<Record<string, number>> = { INVALID_INPUT: 400, NOT_FOUND: 404, FORBIDDEN: 403 };
  const code = error instanceof DraftError && Object.hasOwn(statuses, error.code) ? error.code : "INTERNAL_ERROR";
  return privateJson({ code }, statuses[code] ?? 500);
}
