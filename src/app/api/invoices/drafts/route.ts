import { apiError, privateJson, requireRequestSession } from "../../../../lib/auth/runtime";
import { DraftError } from "../../../../lib/invoices/errors";
import { getDraftRepository } from "../../../../lib/invoices/runtime";
import { MAX_DRAFT_BODY_BYTES, parseDraftInput } from "../../../../lib/invoices/schemas";
import { createInvoiceDraftService } from "../../../../lib/invoices/service";

async function readDraftJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") ||
    (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity")) {
    throw new DraftError("UNSUPPORTED_MEDIA_TYPE", 415);
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > MAX_DRAFT_BODY_BYTES)) {
    throw new DraftError("PAYLOAD_TOO_LARGE", 413);
  }
  const invalid = () => new DraftError("INVALID_INPUT", 400, { fieldIssues: [{ path: "$", reason: "invalid_json" }] });
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  let size = 0;
  let text = "";
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DRAFT_BODY_BYTES) throw new DraftError("PAYLOAD_TOO_LARGE", 413);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const parsed: unknown = JSON.parse(text);
    // Native parsing validates grammar but silently overwrites duplicate keys. Scan the validated tokens to reject ambiguity.
    const containers: Array<Set<string> | null> = [];
    let lastString = "";
    for (const [token] of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}[\]:]/g)) {
      if (token === "{" || token === "[") containers.push(token === "{" ? new Set() : null);
      else if (token === "}" || token === "]") containers.pop();
      else if (token === ":") {
        const key: string = JSON.parse(lastString);
        const keys = containers.at(-1)!;
        if (keys!.has(key)) throw invalid();
        keys!.add(key);
      } else lastString = token;
      if (containers.length > 32) throw invalid();
    }
    return parsed;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof DraftError) throw error;
    throw invalid();
  } finally {
    reader.releaseLock();
  }
}

const draftStatuses: Readonly<Record<string, number>> = {
  INVALID_INPUT: 400, PROHIBITED_FIELD: 400, NOT_FOUND: 404,
  VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, PROFILE_CONFLICT: 409, DRAFT_NOT_EDITABLE: 409, PUBLICATION_IN_PROGRESS: 409,
  PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, MISSING_FIELDS: 422,
};

export async function POST(request: Request) {
  try {
    const identity = await requireRequestSession(request, true);
    const input = parseDraftInput(await readDraftJson(request));
    const service = createInvoiceDraftService(getDraftRepository());
    return privateJson(await service.createDraft({
      workspaceId: identity.workspaceId, ownerWallet: identity.ownerWallet, connectorId: null,
    }, input));
  } catch (error) {
    if (!(error instanceof DraftError) || !Object.hasOwn(draftStatuses, error.code)) return apiError(error);
    const { code, details } = error;
    if (code === "MISSING_FIELDS") {
      return privateJson({ code, draftCreated: false, missingFields: details.missingFields?.map(({ path, reason }) => ({ path, reason })) ?? [] }, 422);
    }
    if (code === "VERSION_CONFLICT") {
      if (!details.draftId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(details.draftId) ||
        !Number.isSafeInteger(details.currentVersion) || details.currentVersion! < 1) return apiError(error);
      return privateJson({ code, draftId: details.draftId, currentVersion: details.currentVersion }, 409);
    }
    if (code === "INVALID_INPUT") {
      return privateJson({ code, fieldIssues: details.fieldIssues?.slice(0, 100).map(({ path, reason }) => ({ path, reason })) ?? [] }, 400);
    }
    return privateJson({ code }, draftStatuses[code]);
  }
}
