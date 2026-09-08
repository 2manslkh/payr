import { createDocumentAccessEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createDocumentRepository } from "../db/documents";
import { createReceiptRepository } from "../db/receipts";
import { createPrivateDocumentStorage } from "../documents/invoice-storage";
import { createReceiptAccessService } from "./access";

export function createReceiptRuntime() {
  const config = createDocumentAccessEnv();
  const database = createSupabaseAdminClient(undefined, (input, init) => {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return fetch(input, { ...init, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
  });
  const repository = createReceiptRepository(database);
  const storage = createPrivateDocumentStorage(database);
  const access = createReceiptAccessService(createDocumentRepository(database), repository, config);
  return { config, repository, storage, access };
}
