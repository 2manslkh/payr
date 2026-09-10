import { ZodError } from "zod";
import { parseJson } from "../domain/parse-json";
import { IdentityError } from "../identity/contracts";
import { DraftError } from "../invoices/errors";
import { PublicationError } from "../invoices/publication-contracts";
import { operationNames, operationScopes, type AgentOperation, type AgentRuntime } from "./contracts";

const bodyLimit = 68 * 1024;
const readDeadlineMs = 5_000;
const tokenPattern = /^[A-Za-z0-9._~+/-]+=*$/;
const statuses: Readonly<Record<string, number>> = {
  INVALID_INPUT: 400, PROHIBITED_FIELD: 400, NONCE_INVALID_OR_USED: 400,
  DELIVERY_APPROVAL_REQUIRED: 400, INVOICE_EMAIL_DISABLED: 503,
  AUTH_REQUIRED: 401, UNAUTHORIZED: 401, SIGNATURE_INVALID: 401, CONNECTOR_INVALID: 401,
  FORBIDDEN: 403, ORIGIN_NOT_ALLOWED: 403, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405,
  REQUEST_TIMEOUT: 408, VERSION_CONFLICT: 409, REVISION_CONFLICT: 409, PROFILE_CONFLICT: 409,
  CLIENT_CONFLICT: 409, CLIENT_ALIAS_CONFLICT: 409, CONNECTOR_CONFLICT: 409, GATEWAY_KEY_CONFLICT: 409,
  PROFILE_CHANGED: 409, IDEMPOTENCY_CONFLICT: 409, DRAFT_NOT_EDITABLE: 409,
  PUBLICATION_IN_PROGRESS: 409, PUBLICATION_FAILED: 409, LEASE_LOST: 409,
  PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, MISSING_FIELDS: 422, RATE_LIMITED: 429,
  CONFIGURATION_ERROR: 503, PUBLICATION_RETRYABLE: 503, LINK_UNAVAILABLE: 503,
  DOCUMENTS_NOT_CONFIGURED: 503, CONNECTOR_UNAVAILABLE: 503, INTERNAL_ERROR: 503,
};

function privateJson(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: {
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
}

export function agentErrorResponse(error: unknown, accountBearer = false): Response {
  const code = error instanceof ZodError ? "INVALID_INPUT"
    : (error instanceof IdentityError || error instanceof DraftError || error instanceof PublicationError)
      && Object.hasOwn(statuses, error.code) ? error.code : "INTERNAL_ERROR";
  const safe: Record<string, unknown> = { code };
  if (error instanceof DraftError && code === "MISSING_FIELDS") {
    safe.draftCreated = false;
    const fields = error.details.missingFields;
    // Only canonical paths, never arbitrary provider/user strings, can leave this boundary.
    safe.missingFields = Array.isArray(fields) ? fields.slice(0, 256).filter((field) => field
      && typeof field.path === "string"
      && /^(?:(?:sender|client)\.(?:businessName|billingAddress(?:\.countryCode)?|contactName|contactEmail)|sender\.(?:payoutWallet|invoicePrefix)|dueDate|items(?:\.(?:0|[1-9][0-9]?)\.(?:description|amount))?)$/.test(field.path)
      && ["required", "default_unavailable", "confirmation_required"].includes(field.reason))
      .map(({ path, reason }) => ({ path, reason })) : [];
  }
  if (error instanceof DraftError && code === "VERSION_CONFLICT"
    && typeof error.details.draftId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(error.details.draftId)
    && Number.isSafeInteger(error.details.currentVersion) && error.details.currentVersion! > 0) {
    safe.draftId = error.details.draftId;
    safe.currentVersion = error.details.currentVersion;
  }
  if (error instanceof PublicationError && error.failureCode
    && ["ARTIFACT_VERIFICATION_FAILED", "PROFILE_CONFLICT", "CLIENT_CONFLICT", "AUTH_REVOKED", "DEADLINE_EXPIRED", "VERSION_CONFLICT"].includes(error.failureCode)) {
    safe.failureCode = error.failureCode;
  }
  const response = privateJson({ error: safe }, statuses[code]);
  if (code === "METHOD_NOT_ALLOWED") response.headers.set("Allow", "POST");
  if (response.status === 401 && accountBearer) response.headers.set("WWW-Authenticate", 'Bearer realm="Payr"');
  if (code === "RATE_LIMITED" && error instanceof IdentityError
    && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds! > 0) {
    response.headers.set("Retry-After", String(Math.min(error.retryAfterSeconds!, 3600)));
  }
  return response;
}

async function readEnvelope(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.has("content-encoding")
    || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get("content-type") ?? "")) {
    throw new IdentityError("UNSUPPORTED_MEDIA_TYPE", 415);
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > bodyLimit)) {
    throw new IdentityError("PAYLOAD_TOO_LARGE", 413);
  }
  if (!request.body) throw new IdentityError("INVALID_INPUT");
  const reader = request.body.getReader();
  const expires = Date.now() + readDeadlineMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let complete = false;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IdentityError("REQUEST_TIMEOUT", 408)), readDeadlineMs);
  });
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    let size = 0;
    let text = "";
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (Date.now() >= expires) throw new IdentityError("REQUEST_TIMEOUT", 408);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > bodyLimit) throw new IdentityError("PAYLOAD_TOO_LARGE", 413);
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    complete = true;
    const envelope = parseJson(text);
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new IdentityError("INVALID_INPUT");
    const body = envelope as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== "input" && key !== "accountCredential")
      || !Object.hasOwn(body, "input") || !body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
      throw new IdentityError("INVALID_INPUT");
    }
    return body;
  } catch (error) {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError("INVALID_INPUT");
  } finally {
    clearTimeout(timer);
    // A hostile stream's cancel promise must not extend the read deadline.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function handleAgentRequest(request: Request, operation: string, ip: string, runtime: AgentRuntime): Promise<Response> {
  let accountBearer = false;
  try {
    if (!operationNames.includes(operation as AgentOperation)) throw new IdentityError("NOT_FOUND", 404);
    if (request.method !== "POST") throw new IdentityError("METHOD_NOT_ALLOWED", 405);
    const op = operation as AgentOperation;
    const url = new URL(request.url);
    if (url.origin !== runtime.appOrigin
      || (request.headers.has("origin") && request.headers.get("origin") !== runtime.appOrigin)) {
      throw new IdentityError("ORIGIN_NOT_ALLOWED", 403);
    }
    if (url.href.includes("?") || url.hash || url.username || url.password) throw new IdentityError("INVALID_INPUT");
    if (url.pathname !== `/api/v1/${op}`) throw new IdentityError("NOT_FOUND", 404);
    const serviceToken = request.headers.get("x-payr-service-key");
    if (!serviceToken || serviceToken.length > 4096 || !tokenPattern.test(serviceToken)) throw new IdentityError("AUTH_REQUIRED", 401);
    const { serviceId } = await runtime.authenticateService(serviceToken, op, ip);
    const scope = operationScopes[op];
    const hasHeader = request.headers.has("authorization");
    if (scope === null && hasHeader) throw new IdentityError("INVALID_INPUT");
    const body = await readEnvelope(request);
    const hasBody = Object.hasOwn(body, "accountCredential");
    if (scope === null) {
      if (hasBody) throw new IdentityError("INVALID_INPUT");
      return privateJson(await runtime.execute(op, body.input, { serviceId }, ip));
    }
    if (hasHeader && hasBody) throw new IdentityError("INVALID_INPUT");
    if (hasBody && (typeof body.accountCredential !== "string" || !body.accountCredential
      || body.accountCredential.length > 4096 || !tokenPattern.test(body.accountCredential))) throw new IdentityError("INVALID_INPUT");
    accountBearer = true;
    const token = hasHeader ? /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(request.headers.get("authorization") ?? "")?.[1]
      : body.accountCredential as string | undefined;
    if (!token || token.length > 4096) throw new IdentityError("AUTH_REQUIRED", 401);
    const account = await runtime.authenticateAccount(token, serviceId, scope, ip);
    accountBearer = false;
    return privateJson(await runtime.execute(op, body.input, { serviceId, account, accountCredential: token }, ip));
  } catch (error) {
    return agentErrorResponse(error, accountBearer);
  }
}
