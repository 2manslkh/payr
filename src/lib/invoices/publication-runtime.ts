import { createPublicationEnv, createPublicationLinkEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createPublicationRepository } from "../db/publication";
import { PublicationError, type InvoiceDocumentPort } from "./publication-contracts";

export function getPublicationRepository() {
  return createPublicationRepository(createSupabaseAdminClient());
}

export function getPublicationLinkConfig() {
  try { return createPublicationLinkEnv(); } catch { throw new PublicationError("CONFIGURATION_ERROR", 503); }
}

export function getPublicationConfig() {
  try { return createPublicationEnv(); } catch { throw new PublicationError("CONFIGURATION_ERROR", 503); }
}

export function getPublicationDocumentPort(): InvoiceDocumentPort {
  // R06 installs the real PDF/QR/storage adapter. Never select a deterministic test adapter here.
  throw new PublicationError("DOCUMENTS_NOT_CONFIGURED", 503);
}
