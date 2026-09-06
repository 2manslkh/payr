import { createDocumentAccessEnv, createDocumentRpcOrigins } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createDocumentRepository } from "../db/documents";
import { createInvoiceAccessService } from "./access";
import { DocumentUnavailableError } from "./contracts";
import { createPrivateDocumentStorage } from "./invoice-storage";

export function createDocumentRuntime() {
  try {
    const config = createDocumentAccessEnv();
    const rpcOrigins = createDocumentRpcOrigins();
    const client = createSupabaseAdminClient();
    const repository = createDocumentRepository(client);
    return { config, rpcOrigins, access: createInvoiceAccessService(repository, config), storage: createPrivateDocumentStorage(client) };
  } catch { throw new DocumentUnavailableError(); }
}
