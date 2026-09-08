import { createReceiptDeliveryEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createOutboxRepository } from "../db/outbox";
import { createReceiptRuntime } from "../receipts/runtime";
import { createOutboxWorker } from "./outbox";
import { prepareReceiptEmail } from "./receipt";
import { createResendReceiptProvider } from "./resend";

export function createOutboxRuntime() {
  const config = createReceiptDeliveryEnv();
  if (!config) return null;
  const receipt = createReceiptRuntime();
  const database = createSupabaseAdminClient();
  const repository = createOutboxRepository({ rpc: (name, args) => database.rpc(name, args).abortSignal(AbortSignal.timeout(10_000)) });
  return createOutboxWorker(repository, (work) => prepareReceiptEmail(work, receipt.config, receipt.storage, config.from), createResendReceiptProvider(config.apiKey));
}
