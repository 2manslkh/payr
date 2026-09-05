import type { DraftRepository, DraftResult, InvoiceActor } from "./contracts";

export function createInvoiceDraftService(_repository: DraftRepository, _now: () => Date = () => new Date()): {
  createDraft(actor: InvoiceActor, input: unknown): Promise<DraftResult>;
} {
  throw new Error("F3 implementation pending");
}
