import { createReceiptDeliveryEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createOutboxRepository } from "../db/outbox";
import { createReceiptRuntime } from "../receipts/runtime";
import { createOutboxWorker } from "./outbox";
import { prepareReceiptEmail } from "./receipt";
import { createResendReceiptProvider } from "./resend";
import { createReceiptWorker } from "../receipts/worker";
import { createReceiptDocumentPort } from "../documents/receipt-storage";
import { z } from "zod";

export function createOutboxRuntime(receiptDocumentId?: string, deadline = Infinity) {
  const config = createReceiptDeliveryEnv();
  if (!config) return null;
  const receipt = createReceiptRuntime();
  const database = createSupabaseAdminClient();
  const repository = createOutboxRepository({ rpc: (name, args) => database.rpc(name, args).abortSignal(AbortSignal.timeout(10_000)) }, { receiptDocumentId });
  const provider = createResendReceiptProvider(config.apiKey);
  return createOutboxWorker(repository, (work) => prepareReceiptEmail(work, receipt.config, receipt.storage, config.from), {
    send: (payload, key, leaseDeadline) => provider.send(payload, key, Math.min(leaseDeadline, deadline - 15_000)),
  });
}

export async function processReceipt(receiptDocumentId: string, deadline = performance.now() + 240_000) {
  z.string().uuid().parse(receiptDocumentId);
  // Reserve storage, PDF inspection, provider I/O and fenced persistence, not just the send.
  if (performance.now() + 120_000 >= deadline) return;
  const receipt = createReceiptRuntime();
  await createReceiptWorker(receipt.repository, createReceiptDocumentPort(receipt.storage), receipt.config).run(receiptDocumentId);
  if (performance.now() + 120_000 >= deadline) return;
  const outbox = createOutboxRuntime(receiptDocumentId, deadline);
  if (!outbox) return;
  for (let sent = 0; sent < 2 && performance.now() + 120_000 < deadline; sent++) {
    if ((await outbox.run()).outcome === "idle") break;
  }
}
