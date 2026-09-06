import { ZodError } from "zod";
import { apiError, privateJson } from "../auth/runtime";
import { DraftError } from "./errors";
import { PublicationError } from "./publication-contracts";

const statuses: Readonly<Record<string, number>> = {
  INVALID_INPUT: 400, NOT_FOUND: 404, VERSION_CONFLICT: 409, PROFILE_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409, PUBLICATION_IN_PROGRESS: 409, PUBLICATION_FAILED: 409,
  PUBLICATION_RETRYABLE: 503, LEASE_LOST: 409, INVOICE_NOT_VOIDABLE: 409, LINK_UNAVAILABLE: 503,
  DOCUMENTS_NOT_CONFIGURED: 503, CONFIGURATION_ERROR: 503, CRON_UNAUTHORIZED: 401,
  PAYLOAD_TOO_LARGE: 413, DRAFT_NOT_EDITABLE: 409,
};

export function publicationErrorResponse(error: unknown): Response {
  if (error instanceof ZodError) return privateJson({ code: "INVALID_INPUT" }, 400);
  if (error instanceof PublicationError || error instanceof DraftError) {
    if (!Object.hasOwn(statuses, error.code)) return privateJson({ code: "INTERNAL_ERROR" }, 500);
    const body: Record<string, unknown> = { code: error.code };
    if (error instanceof DraftError && error.code === "VERSION_CONFLICT"
      && typeof error.details.draftId === "string" && /^[0-9a-f-]{36}$/.test(error.details.draftId)
      && Number.isSafeInteger(error.details.currentVersion) && error.details.currentVersion! > 0) {
      body.draftId = error.details.draftId;
      body.currentVersion = error.details.currentVersion;
    }
    if (error instanceof PublicationError && error.failureCode && ["ARTIFACT_VERIFICATION_FAILED", "PROFILE_CONFLICT", "CLIENT_CONFLICT", "AUTH_REVOKED", "DEADLINE_EXPIRED", "VERSION_CONFLICT"].includes(error.failureCode)) {
      body.failureCode = error.failureCode;
    }
    return privateJson(body, statuses[error.code]);
  }
  return apiError(error);
}
