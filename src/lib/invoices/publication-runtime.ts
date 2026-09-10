import { after } from "next/server";
import { createInvoiceDeliveryEnv, createPublicationEnv, createPublicationLinkEnv } from "../../config/env";
import type { InvoiceEmailConfig } from "../email/outbox-contracts";
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

export function getPublicationEmailConfig(): InvoiceEmailConfig {
  try {
    const config = createInvoiceDeliveryEnv();
    if (!config) throw new PublicationError("INVOICE_EMAIL_DISABLED", 503);
    return { from: config.from, appOrigin: getPublicationLinkConfig().appOrigin, templateVersion: "invoice-issued-v1", network: "Arc Testnet" };
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("CONFIGURATION_ERROR", 503);
  }
}

export function afterPublication(attemptId: string) {
  after(async () => {
    const { drainInvoiceEmails } = await import("../email/invoice-runtime");
    await drainInvoiceEmails({ publicationAttemptId: attemptId, limit: 2 });
  });
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
