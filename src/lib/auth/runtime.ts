import { cookies } from "next/headers";
import { ZodError } from "zod";
import { createIdentityEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createIdentityRepository } from "../db/identity";
import { IdentityError, SESSION_COOKIE, type IdentityConfig, type IdentityRepository, type IdentitySession } from "../identity/contracts";
import { requireTrustedOrigin } from "./origin";
import { createSessionCodec } from "./session";

export function getIdentityConfig(): IdentityConfig {
  try {
    return Object.freeze(createIdentityEnv());
  } catch {
    throw new IdentityError("CONFIGURATION_ERROR", 503);
  }
}

export function getIdentityRuntime(): { config: IdentityConfig; repository: IdentityRepository } {
  const config = getIdentityConfig();
  const repository = Object.freeze(createIdentityRepository(createSupabaseAdminClient()));
  return Object.freeze({ config, repository });
}

export async function readRequestSession(request: Request): Promise<IdentitySession | null> {
  const values = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  return createSessionCodec(getIdentityConfig()).open(token);
}

export async function requireRequestSession(request: Request, mutation = true): Promise<IdentitySession> {
  if (mutation) requireTrustedOrigin(request, getIdentityConfig().appOrigin);
  const identity = await readRequestSession(request);
  if (!identity) throw new IdentityError("AUTH_REQUIRED", 401);
  return identity;
}

export async function getDashboardSession(): Promise<IdentitySession | null> {
  const values = (await cookies()).getAll(SESSION_COOKIE);
  if (values.length !== 1 || !values[0].value) return null;
  return createSessionCodec(getIdentityConfig()).open(values[0].value);
}

export function privateJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

const errorStatuses: Readonly<Record<string, number>> = Object.freeze({
  INVALID_INPUT: 400, NONCE_INVALID_OR_USED: 400, AUTH_REQUIRED: 401, SIGNATURE_INVALID: 401,
  ORIGIN_NOT_ALLOWED: 403, FORBIDDEN: 403, NOT_FOUND: 404, REVISION_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, RATE_LIMITED: 429,
  CONFIGURATION_ERROR: 503, INTERNAL_ERROR: 500,
});

export function apiError(error: unknown): Response {
  const code = error instanceof ZodError ? "INVALID_INPUT"
    : error instanceof IdentityError && Object.hasOwn(errorStatuses, error.code) ? error.code : "INTERNAL_ERROR";
  const response = privateJson({ error: { code } }, errorStatuses[code]);
  if (code === "RATE_LIMITED" && error instanceof IdentityError && Number.isSafeInteger(error.retryAfterSeconds)
    && error.retryAfterSeconds! > 0) response.headers.set("Retry-After", String(error.retryAfterSeconds));
  return response;
}
