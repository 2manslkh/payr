import { createInvoiceDeliveryEnv, createPublicationLinkEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createInvoiceOutboxRepository } from "../db/outbox";
import { createPublicationRepository } from "../db/publication";
import { createDocumentRepository } from "../db/documents";
import { createPublicationWorker } from "../invoices/publication-worker";
import { createOutboxWorker } from "./outbox";
import { prepareInvoiceEmail } from "./invoice";
import { createResendReceiptProvider } from "./resend";

export async function drainInvoiceEmails({ publicationAttemptId, limit = 8 }: { publicationAttemptId?: string; limit?: number } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error("INVALID_INPUT");
  const config = createInvoiceDeliveryEnv();
  if (!config) return { outcome: "disabled" as const, processed: 0 };
  const deadline = performance.now() + 240_000;
  const budget = AbortSignal.timeout(240_000);
  const links = createPublicationLinkEnv();
  const database = createSupabaseAdminClient(undefined, (input, init) => fetch(input, { ...init,
    signal: AbortSignal.any([budget, AbortSignal.timeout(10_000), ...(init?.signal ? [init.signal] : [])]),
  }));
  const { createPrivateDocumentStorage, createInvoiceDocumentPort } = await import("../documents/invoice-storage");
  const storage = createPrivateDocumentStorage(database);
  if (publicationAttemptId === undefined) {
    // Cron resumes only explicitly email-approved publications, never the legacy publication queue.
    await createPublicationWorker(createPublicationRepository(database, { invoiceEmailOnly: true }), links,
      createInvoiceDocumentPort(storage, createDocumentRepository(database))).run();
  }
  const repository = createInvoiceOutboxRepository({ rpc: (name, args) => database.rpc(name, args).abortSignal(AbortSignal.timeout(10_000)) }, publicationAttemptId);
  const worker = createOutboxWorker(repository, (work) => prepareInvoiceEmail(work, links, storage), createResendReceiptProvider(config.apiKey));
  let processed = 0;
  // Leave time for claim, storage, marker, provider and completion rather than aborting an accepted send's finish.
  while (processed < limit && performance.now() + 55_000 < deadline) {
    const result = await worker.run();
    if (result.outcome === "idle") break;
    processed++;
  }
  return { outcome: "drained" as const, processed };
}
