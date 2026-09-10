// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { IdentityError } from "../identity/contracts";
import { DraftError } from "../invoices/errors";
import { PublicationError } from "../invoices/publication-contracts";
import { operationNames, operationScopes, type AgentAccount, type AgentRuntime } from "./contracts";
import { handleAgentRequest } from "./http";

const origin = "https://payr.example";
const ip = "192.0.2.1";
const serviceToken = "pgw_service.private-service-secret";
const accountToken = "pac_account.private-account-secret";
const account: AgentAccount = {
  workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}`,
  credential: { id: "00000000-0000-4000-8000-000000000002", createdAt: "2026-09-09T00:00:00Z",
    expiresAt: "2026-09-10T00:00:00Z", revokedAt: null, lastUsedAt: null, scopes: ["invoice:status"] },
  senderSetupRequired: true,
};
const runtime: AgentRuntime = {
  appOrigin: origin, authenticateService: vi.fn(), authenticateAccount: vi.fn(), execute: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runtime.authenticateService).mockResolvedValue({ serviceId: "bazantic" });
  vi.mocked(runtime.authenticateAccount).mockResolvedValue(account);
  vi.mocked(runtime.execute).mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

function request(body = '{"input":{}}', operation = "get_account", headers: HeadersInit = {}): Request {
  return new Request(`${origin}/api/v1/${operation}`, { method: "POST", body,
    headers: { "content-type": "application/json", "x-payr-service-key": serviceToken, ...headers } });
}
function send(req = request(), op = "get_account") { return handleAgentRequest(req, op, ip, runtime); }
function authorized(body = '{"input":{}}') { return request(body, "get_account", { authorization: `Bearer ${accountToken}` }); }
function privateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
}

it("exposes the invoice operations and read-only wallet discovery, with no void or signing operation", () => {
  expect([...operationNames]).toEqual(["create_account_challenge", "register_account", "get_account", "revoke_current_credential",
    "get_sender_profile", "save_sender_profile", "create_invoice_draft", "list_invoices", "get_invoice", "publish_invoice", "get_invoice_status", "get_account_context"]);
});

it.each(operationNames)("dispatches %s with only its input, exact context and required scope", async (op) => {
  const scope = operationScopes[op];
  const req = request('{"input":{"approval":true}}', op, scope ? { authorization: `Bearer ${accountToken}` } : {});
  const response = await send(req, op);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(runtime.authenticateService).toHaveBeenCalledExactlyOnceWith(serviceToken, op, ip);
  if (scope) expect(runtime.authenticateAccount).toHaveBeenCalledExactlyOnceWith(accountToken, "bazantic", scope, ip);
  else expect(runtime.authenticateAccount).not.toHaveBeenCalled();
  expect(runtime.execute).toHaveBeenCalledExactlyOnceWith(op, { approval: true }, scope
    ? { serviceId: "bazantic", account, accountCredential: accountToken } : { serviceId: "bazantic" }, ip);
  privateHeaders(response);
});

it.each(operationNames.filter((op) => operationScopes[op] !== null))("denies service-only access to %s", async (op) => {
  const response = await send(request(undefined, op), op);
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toBe('Bearer realm="Payr"');
  expect(runtime.authenticateAccount).not.toHaveBeenCalled();
  expect(runtime.execute).not.toHaveBeenCalled();
});

it.each(["void_invoice", "getAccount", "toString", "__proto__", "", "GET_ACCOUNT"])("never invokes unknown operation %s", async (op) => {
  const response = await send(request(undefined, op), op);
  expect(response.status).toBe(404);
  expect(runtime.authenticateService).not.toHaveBeenCalled();
  expect(runtime.execute).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each(["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"])("rejects %s with POST-only Allow", async (method) => {
  const response = await send(new Request(`${origin}/api/v1/get_account`, { method }));
  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("POST");
  expect(runtime.authenticateService).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each(operationNames)("requires service header even with an account credential for %s", async (op) => {
  const req = request(undefined, op, { authorization: `Bearer ${accountToken}`, cookie: `serviceKey=${serviceToken}` });
  req.headers.delete("x-payr-service-key");
  const response = await send(req, op);
  expect(response.status).toBe(401);
  expect(response.headers.has("www-authenticate")).toBe(false);
  expect(req.bodyUsed).toBe(false);
  expect(runtime.execute).not.toHaveBeenCalled();
});

it("authenticates the service before consuming even malformed body bytes", async () => {
  const req = authorized("not json");
  vi.mocked(runtime.authenticateService).mockImplementation(async () => {
    expect(req.bodyUsed).toBe(false);
    throw new IdentityError("UNAUTHORIZED", 401);
  });
  const response = await send(req);
  expect(response.status).toBe(401);
  expect(req.bodyUsed).toBe(false);
  expect(response.headers.has("www-authenticate")).toBe(false);
  expect(runtime.authenticateAccount).not.toHaveBeenCalled();
});

it("awaits service admission before reading, then account admission before execution", async () => {
  const req = authorized();
  let admit!: () => void;
  vi.mocked(runtime.authenticateService).mockImplementation(async () => {
    await new Promise<void>((resolve) => { admit = resolve; });
    return { serviceId: "bazantic" };
  });
  const result = send(req);
  expect(req.bodyUsed).toBe(false);
  expect(runtime.authenticateAccount).not.toHaveBeenCalled();
  admit();
  expect((await result).status).toBe(200);
  expect(vi.mocked(runtime.authenticateService).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runtime.authenticateAccount).mock.invocationCallOrder[0]);
  expect(vi.mocked(runtime.authenticateAccount).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runtime.execute).mock.invocationCallOrder[0]);
});

it.each(["create_account_challenge", "register_account"])("rejects all explicit account credential values on %s", async (op) => {
  for (const authorization of ["", "Basic invalid", `Bearer ${accountToken}`]) {
    expect((await send(request(undefined, op, { authorization }), op)).status).toBe(400);
  }
  for (const accountCredential of [null, "", false, accountToken]) {
    expect((await send(request(JSON.stringify({ input: {}, accountCredential }), op), op)).status).toBe(400);
  }
  expect(runtime.authenticateAccount).not.toHaveBeenCalled();
  expect(runtime.execute).not.toHaveBeenCalled();
});

it("extracts the body credential without passing the auth envelope as operation input", async () => {
  const input = { memo: "invoice facts", items: [{}] };
  const response = await send(request(JSON.stringify({ input, accountCredential: accountToken })));
  expect(response.status).toBe(200);
  expect(runtime.authenticateAccount).toHaveBeenCalledExactlyOnceWith(accountToken, "bazantic", "invoice:status", ip);
  expect(runtime.execute).toHaveBeenCalledExactlyOnceWith("get_account", input, { serviceId: "bazantic", account, accountCredential: accountToken }, ip);
  expect(JSON.stringify(vi.mocked(runtime.execute).mock.calls[0][1])).not.toContain(accountToken);
});

it.each(["", "Basic invalid", `Bearer ${accountToken}`])("rejects two sources without falling back from header %s", async (authorization) => {
  const response = await send(request(JSON.stringify({ input: {}, accountCredential: accountToken }), "get_account", { authorization }));
  expect(response.status).toBe(400);
  expect(runtime.authenticateAccount).not.toHaveBeenCalled();
  expect(runtime.execute).not.toHaveBeenCalled();
});

it.each([undefined, "", "Basic secret", "Bearer a, Bearer b", "Bearer a b", "Bearer"])("never falls back to owner/account cookies for header %s", async (authorization) => {
  const req = request(undefined, "get_account", { cookie: `__Host-payr-session=owner; accountCredential=${accountToken}` });
  if (authorization !== undefined) req.headers.set("authorization", authorization);
  const response = await send(req);
  expect(response.status).toBe(401);
  expect(runtime.execute).not.toHaveBeenCalled();
  expect(runtime.authenticateAccount).not.toHaveBeenCalled();
});

it.each([null, 42, {}, [], "", "two tokens", "a,b", "x".repeat(4097)])("rejects malformed body account credential %#", async (accountCredential) => {
  expect((await send(request(JSON.stringify({ input: {}, accountCredential })))).status).toBe(400);
  expect(runtime.authenticateAccount).not.toHaveBeenCalled();
});

it.each([
  '{"input":{},"input":{}}', '{"input":{},"\\u0069nput":{}}',
  '{"input":{"approval":false,"approval":true}}', '{"input":{"approval":false,"\\u0061pproval":true}}',
  '{"input":{"nested":[{"accountCredential":"one","account\\u0043redential":"two"}]}}',
  '{"input":{},"accountCredential":"one","account\\u0043redential":"two"}',
  '{"input":{"x":{"__proto__":1,"__proto__":2}}}',
  '{"input":{"x":{"a\\\\b":1,"a\\u005cb":2}}}',
])( "rejects decoded duplicate names at every depth: %s", async (body) => {
  expect((await send(authorized(body))).status).toBe(400);
  expect(runtime.authenticateAccount).not.toHaveBeenCalled();
  expect(runtime.execute).not.toHaveBeenCalled();
});

it("allows repeated names in separate objects and punctuation/escaped quotes within strings", async () => {
  const input = { nested: [{ approval: false }, { approval: true }], text: '\\"},[ : "approval":true', "a\"b": 1 };
  expect((await send(authorized(JSON.stringify({ input })))).status).toBe(200);
  expect(vi.mocked(runtime.execute).mock.calls[0][1]).toEqual(input);
});

it("scans deeply nested valid input iteratively and still finds deep duplicates", async () => {
  const wrap = (inner: string) => `{"input":{"deep":${"[".repeat(10_000)}${inner}${"]".repeat(10_000)}}}`;
  expect((await send(authorized(wrap('{"a":1}')))).status).toBe(200);
  vi.mocked(runtime.execute).mockClear();
  expect((await send(authorized(wrap('{"a":1,"\\u0061":2}')))).status).toBe(400);
  expect(runtime.execute).not.toHaveBeenCalled();
});

it.each(["", "null", "[]", "true", '"text"', "{}", '{"input":null}', '{"input":[]}', '{"input":1}',
  '{"input":{},"serviceKey":"secret"}', '{"input":{},"__proto__":{}}', '{"input":{},}', '{"input":{}} trailing',
  '{"input":{"x":"\\uZZZZ"}}', '{"input":{"x":NaN}}', '{"input":{"x":"unterminated}}',
])( "rejects malformed JSON and non-strict envelopes: %s", async (body) => {
  expect((await send(authorized(body))).status).toBe(400);
  expect(runtime.execute).not.toHaveBeenCalled();
});

it.each(["text/plain", "application/json; charset=iso-8859-1", "application/json; charset=utf8", "application/json; charset=utf-8; charset=utf-8",
  "application/json; profile=x", "application/problem+json", ""])("rejects media type %s", async (type) => {
  const req = authorized();
  req.headers.set("content-type", type);
  const response = await send(req);
  expect(response.status).toBe(415);
  expect(req.bodyUsed).toBe(false);
  privateHeaders(response);
});

it.each(["application/json", "application/json; charset=utf-8", 'Application/JSON; Charset="UTF-8"'])("accepts media type %s", async (type) => {
  const req = authorized();
  req.headers.set("content-type", type);
  expect((await send(req)).status).toBe(200);
});

it.each(["gzip", "br", "deflate", "identity", ""])("rejects content encoding %s", async (encoding) => {
  const req = authorized();
  req.headers.set("content-encoding", encoding);
  expect((await send(req)).status).toBe(415);
  expect(req.bodyUsed).toBe(false);
});

function streamed(stream: ReadableStream<Uint8Array>): Request {
  return new Request(`${origin}/api/v1/get_account`, { method: "POST", body: stream, duplex: "half",
    headers: { "content-type": "application/json", "x-payr-service-key": serviceToken, authorization: `Bearer ${accountToken}` },
  } as RequestInit & { duplex: "half" });
}

it("rejects malformed UTF-8, including incomplete final sequences", async () => {
  for (const bytes of [[0xff], [0xc0, 0xaf], [0xe2, 0x82]]) {
    const req = streamed(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"input":{"memo":"'));
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    } }));
    expect((await send(req)).status).toBe(400);
  }
  expect(runtime.execute).not.toHaveBeenCalled();
});

it("decodes UTF-8 characters split between chunks", async () => {
  const bytes = new TextEncoder().encode('{"input":{"memo":"\u20ac"}}');
  const req = streamed(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }));
  expect((await send(req)).status).toBe(200);
});

it("enforces the inclusive 68 KiB total byte limit, not a character limit", async () => {
  const prefix = '{"input":{"memo":"';
  const suffix = '"}}';
  const exact = prefix + "a".repeat(68 * 1024 - prefix.length - suffix.length) + suffix;
  expect((await send(authorized(exact))).status).toBe(200);
  expect((await send(authorized(exact + " "))).status).toBe(413);
  expect((await send(authorized(prefix + "\u20ac".repeat(24 * 1024) + suffix))).status).toBe(413);
});

it("bounds chunked bodies even when content-length understates the payload and cancels without waiting", async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const req = streamed(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(34 * 1024));
    controller.enqueue(new Uint8Array(34 * 1024 + 1));
  }, cancel }));
  req.headers.set("content-length", "2");
  expect((await send(req)).status).toBe(413);
  expect(cancel).toHaveBeenCalledOnce();
  expect(runtime.execute).not.toHaveBeenCalled();
});

it.each([String(68 * 1024 + 1), "-1", "garbage", "2, 2"])("rejects oversized or invalid content-length %s before reading", async (length) => {
  const req = authorized();
  req.headers.set("content-length", length);
  expect((await send(req)).status).toBe(413);
  expect(req.bodyUsed).toBe(false);
});

it("times out a stalled body at five seconds, without waiting for stream cancellation", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const response = send(streamed(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(4999);
  expect(cancel).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const result = await response;
  expect(result.status).toBe(408);
  expect(await result.json()).toEqual({ error: { code: "REQUEST_TIMEOUT" } });
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(runtime.execute).not.toHaveBeenCalled();
  privateHeaders(result);
});

it("uses a total deadline rather than resetting it for each chunk", async () => {
  vi.useFakeTimers();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = send(streamed(new ReadableStream({ start(value) { controller = value; } })));
  await vi.advanceTimersByTimeAsync(3000);
  controller.enqueue(new TextEncoder().encode('{"input":'));
  await vi.advanceTimersByTimeAsync(2000);
  expect((await response).status).toBe(408);
});

it.each([`${origin}/api/v1/get_account?accountCredential=secret`, `${origin}/api/v1/get_account?`,
  `${origin}/api/v1/get_account?search=x`, `${origin}/api/v1/get_account#secret`])("rejects URL credentials/query/fragment %s", async (url) => {
  const response = await send(new Request(url, authorized()));
  expect(response.status).toBe(400);
  expect(runtime.authenticateService).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each(["https://evil.example", "null", `${origin}/`, `${origin}, https://evil.example`, ""])("rejects Origin %s", async (header) => {
  const req = authorized();
  req.headers.set("origin", header);
  expect((await send(req)).status).toBe(403);
  expect(runtime.authenticateService).not.toHaveBeenCalled();
});

it("requires both URL origin and any supplied Origin to match, without trusting forwarded host", async () => {
  const req = new Request("https://evil.example/api/v1/get_account", authorized());
  req.headers.set("origin", origin);
  req.headers.set("x-forwarded-host", "payr.example");
  expect((await send(req)).status).toBe(403);
  expect(runtime.authenticateService).not.toHaveBeenCalled();
  const sameOrigin = authorized();
  sameOrigin.headers.set("origin", origin);
  expect((await send(sameOrigin)).status).toBe(200);
});

it("rejects noncanonical paths even for a known operation", async () => {
  expect((await send(new Request(`${origin}/api/v1/getAccount`, authorized()))).status).toBe(404);
  expect(runtime.authenticateService).not.toHaveBeenCalled();
});

it.each([
  [new IdentityError("UNAUTHORIZED", 401), 401, "UNAUTHORIZED"],
  [new IdentityError("FORBIDDEN", 403), 403, "FORBIDDEN"],
  [new DraftError("NOT_FOUND", 418), 404, "NOT_FOUND"],
  [new PublicationError("PUBLICATION_IN_PROGRESS"), 409, "PUBLICATION_IN_PROGRESS"],
  [new PublicationError("PUBLICATION_RETRYABLE", 503), 503, "PUBLICATION_RETRYABLE"],
  [new IdentityError("DATABASE_ERROR", 500), 503, "INTERNAL_ERROR"],
  [new Error(`provider ${accountToken}`), 503, "INTERNAL_ERROR"],
  [new IdentityError(accountToken, 401), 503, "INTERNAL_ERROR"],
  [new DraftError(accountToken, 400), 503, "INTERNAL_ERROR"],
  [new PublicationError(accountToken, 409), 503, "INTERNAL_ERROR"],
  [{ code: "NOT_FOUND", status: 404, message: accountToken }, 503, "INTERNAL_ERROR"],
  [z.object({ secret: z.literal("expected") }).safeParse({ secret: accountToken }).error!, 400, "INVALID_INPUT"],
])( "sanitizes typed/untyped errors %#", async (error, status, code) => {
  vi.mocked(runtime.execute).mockRejectedValue(error);
  const response = await send(authorized());
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code } });
  expect(response.headers.has("www-authenticate")).toBe(false);
  privateHeaders(response);
});

it("adds a Bearer challenge only for account authentication failure", async () => {
  vi.mocked(runtime.authenticateAccount).mockRejectedValue(new IdentityError("UNAUTHORIZED", 401));
  const response = await send(authorized());
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toBe('Bearer realm="Payr"');
  expect(runtime.execute).not.toHaveBeenCalled();
});

it("preserves only bounded canonical missing-field metadata and no raw issues", async () => {
  const missingFields = [
    { path: "sender.billingAddress.countryCode", reason: "confirmation_required" as const },
    { path: "client.contactEmail", reason: "required" as const },
    { path: "dueDate", reason: "default_unavailable" as const },
    { path: "items.99.amount", reason: "required" as const },
  ];
  vi.mocked(runtime.execute).mockRejectedValue(new DraftError("MISSING_FIELDS", 422, {
    missingFields: [...missingFields, { path: accountToken, reason: "required" }, { path: "items.100.amount", reason: "required" }],
    fieldIssues: [{ path: accountToken, reason: serviceToken }],
  }));
  const response = await send(authorized());
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: { code: "MISSING_FIELDS", draftCreated: false, missingFields } });
  vi.mocked(runtime.execute).mockRejectedValue(new DraftError("MISSING_FIELDS", 422, { missingFields: Array(1000).fill(missingFields[0]) }));
  expect((await (await send(authorized())).json()).error.missingFields).toHaveLength(256);
});

it("preserves only safe version-conflict identifiers and publication failure enums", async () => {
  const details = { draftId: account.workspaceId, currentVersion: 3 };
  vi.mocked(runtime.execute).mockRejectedValue(new DraftError("VERSION_CONFLICT", 409, details));
  expect(await (await send(authorized())).json()).toEqual({ error: { code: "VERSION_CONFLICT", ...details } });
  vi.mocked(runtime.execute).mockRejectedValue(new DraftError("VERSION_CONFLICT", 409, { draftId: accountToken, currentVersion: Infinity }));
  expect(await (await send(authorized())).json()).toEqual({ error: { code: "VERSION_CONFLICT" } });
  vi.mocked(runtime.execute).mockRejectedValue(new PublicationError("PUBLICATION_FAILED", 409, "PROFILE_CONFLICT"));
  expect(await (await send(authorized())).json()).toEqual({ error: { code: "PUBLICATION_FAILED", failureCode: "PROFILE_CONFLICT" } });
});

it.each([[12, "12"], [999_999, "3600"], [0, null], [-1, null], [Infinity, null], [NaN, null], [1.5, null]])("bounds Retry-After for %s", async (retry, expected) => {
  vi.mocked(runtime.authenticateService).mockRejectedValue(new IdentityError("RATE_LIMITED", 429, retry));
  const response = await send(authorized());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe(expected);
  expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED" } });
  privateHeaders(response);
});
