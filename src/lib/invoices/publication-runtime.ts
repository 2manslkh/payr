import { createPublicationEnv, createPublicationLinkEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createPublicationRepository } from "../db/publication";
import { PublicationError, type InvoiceDocumentPort } from "./publication-contracts";

export function getPublicationRepository() {
  try { return createPublicationRepository(createSupabaseAdminClient()); }
  catch { throw new PublicationError("CONFIGURATION_ERROR", 503); }
}

export function getPublicationLinkConfig() {
  try { return createPublicationLinkEnv(); } catch { throw new PublicationError("CONFIGURATION_ERROR", 503); }
}

export function getPublicationConfig() {
  try { return createPublicationEnv(); } catch { throw new PublicationError("CONFIGURATION_ERROR", 503); }
}

export function getPublicationDocumentPort(): InvoiceDocumentPort {
  try {
    const client = createSupabaseAdminClient();
    return { async createOrRead(input) {
      // Load native PDF dependencies only when an active attempt needs document I/O.
      const [{ createInvoiceDocumentPort, createPrivateDocumentStorage }, { createDocumentRepository }] = await Promise.all([
        import("../documents/invoice-storage"), import("../db/documents"),
      ]);
      return createInvoiceDocumentPort(createPrivateDocumentStorage(client), createDocumentRepository(client)).createOrRead(input);
    } };
  } catch { throw new PublicationError("CONFIGURATION_ERROR", 503); }
}
