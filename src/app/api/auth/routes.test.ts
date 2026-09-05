// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSupabaseAdminClient } from "../../../lib/db/admin";
import { createIdentityRepository } from "../../../lib/db/identity";
import { config, createAuthRepository, identity, newPayee, owner } from "../../../lib/auth/test-support";
import { SESSION_COOKIE } from "../../../lib/identity/contracts";
import { createSessionCodec } from "../../../lib/auth/session";
import { POST as nonce } from "./nonce/route";
import { POST as verify } from "./verify/route";
import { POST as logout } from "./logout/route";
import { GET as session } from "./session/route";

vi.mock("../../../lib/db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("../../../lib/db/identity", () => ({ createIdentityRepository: vi.fn() }));

let fixture: ReturnType<typeof createAuthRepository>;
beforeEach(() => {
  fixture = createAuthRepository();
  fixture.state.now = new Date();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", config.appOrigin);
  vi.stubEnv("ARC_CHAIN_ID", String(config.chainId));
  vi.stubEnv("SESSION_ENCRYPTION_KEY", Buffer.from(config.sessionKey).toString("base64url"));
  vi.stubEnv("CONNECTOR_TOKEN_PEPPER", Buffer.from(config.connectorPepper).toString("base64url"));
  vi.mocked(createIdentityRepository).mockImplementation(() => fixture.repository);
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${config.appOrigin}/api/auth/${path}`, {
    method: "POST", headers: { origin: config.appOrigin, host: "payrlink.xyz", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

it("logs in with a real signature, reads a private session, changes payout, and clears only this browser cookie", async () => {
  const issued = await (await nonce(request("nonce", { purpose: "payr-login-v1", wallet: owner.address }))).json();
  const response = await verify(request("verify", { nonceId: issued.nonceId, signature: await owner.signMessage({ message: issued.message }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ session: identity });
  expectPrivate(response);
  const setCookie = response.headers.get("set-cookie")!;
  expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
  for (const attribute of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=28800"]) expect(setCookie).toContain(attribute);
  expect(setCookie).not.toMatch(/domain=/i);
  const cookie = setCookie.split(";")[0];
  const read = await session(new Request(`${config.appOrigin}/api/auth/session`, { headers: { cookie } }));
  expectPrivate(read);
  expect(await read.json()).toEqual({ session: identity });
  const payout = await (await nonce(request("nonce", { purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 1 }, { cookie }))).json();
  const changed = await verify(request("verify", { nonceId: payout.nonceId, signature: await owner.signMessage({ message: payout.message }) }, { cookie }));
  expect(changed.status).toBe(200);
  expectPrivate(changed);
  expect(await changed.json()).toEqual({ session: identity, profile: { ...fixture.state.profile, revision: 2, payoutWallet: newPayee.address.toLowerCase() } });
  expect(changed.headers.get("set-cookie")).toBeNull();
  const cleared = await logout(request("logout", undefined, { cookie }));
  expect(await cleared.json()).toEqual({ ok: true });
  expectPrivate(cleared);
  expect(cleared.headers.get("set-cookie")).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  expect((await session(new Request(`${config.appOrigin}/api/auth/session`))).status).toBe(401);
  // Logout does not claim global token revocation.
  expect((await session(new Request(`${config.appOrigin}/api/auth/session`, { headers: { cookie } }))).status).toBe(200);
});

it("issues a private login challenge without setting a cookie", async () => {
  const response = await nonce(request("nonce", { purpose: "payr-login-v1", wallet: owner.address }));
  expect(response.status).toBe(200);
  expectPrivate(response);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.json()).toMatchObject({ nonceId: expect.any(String), message: expect.stringContaining(owner.address), expiresAt: expect.any(String) });
});

it.each([
  ["nonce", nonce, { purpose: "payr-login-v1", wallet: owner.address, workspaceId: identity.workspaceId }],
  ["nonce", nonce, { purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 1, wallet: owner.address }],
  ["verify", verify, { nonceId: identity.workspaceId, signature: `0x${"1".repeat(130)}`, message: "client-controlled" }],
  ["verify", verify, { nonceId: identity.workspaceId, signature: `0x${"1".repeat(130)}`, wallet: owner.address }],
  ["verify", verify, { nonceId: identity.workspaceId, signature: `0x${"1".repeat(130)}`, purpose: "payr-login-v1" }],
  ["logout", logout, { allBrowsers: true }],
] as const)("denies unknown fields at %s before accessing the repository", async (path, handler, body) => {
  const response = await handler(request(path, body));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: { code: "INVALID_INPUT" } });
  expectPrivate(response);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
});

it.each([["nonce", nonce], ["verify", verify], ["logout", logout]] as const)("denies missing/foreign origin and Host at %s without touching the database", async (path, handler) => {
  for (const headers of [
    {}, { origin: config.appOrigin }, { host: "payrlink.xyz" },
    { origin: "https://evil.test", host: "payrlink.xyz" },
    { origin: config.appOrigin, host: "evil.test", "x-forwarded-host": "payrlink.xyz" },
  ]) {
    const response = await handler(new Request(`${config.appOrigin}/api/auth/${path}`, { method: "POST", headers: headers as HeadersInit }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    expectPrivate(response);
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
});

it.each([["nonce", nonce], ["verify", verify], ["logout", logout]] as const)("bounds and validates JSON at %s even without a trustworthy Content-Length", async (path, handler) => {
  for (const [body, contentType, expectedStatus, extraHeaders] of [
    ["{}", "text/plain", 415, {}], ["{}", "application/x-www-form-urlencoded", 415, {}],
    ["{}", "application/json; charset=iso-8859-1", 415, {}],
    ["{}", "application/json", 415, { "content-encoding": "gzip" }],
    ["{", "application/json", 400, {}], ["null", "application/json", 400, {}],
    ["[]", "application/json", 400, {}], ["{}", "application/json", 413, { "content-length": "16385" }],
    [" ".repeat(16385), "application/json", 413, { "content-length": "1" }],
    [JSON.stringify({ text: "\u00e9".repeat(8192) }), "application/json", 413, {}],
  ] as const) {
    const response = await handler(new Request(`${config.appOrigin}/api/auth/${path}`, {
      method: "POST", headers: { origin: config.appOrigin, host: "payrlink.xyz", "content-type": contentType, ...extraHeaders }, body,
    }));
    expect(response.status).toBe(expectedStatus);
    expectPrivate(response);
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
});

it("accepts a JSON request exactly at 16 KiB and rejects invalid UTF-8", async () => {
  const body = JSON.stringify({ purpose: "payr-login-v1", wallet: owner.address }).padEnd(16384, " ");
  const headers = { origin: config.appOrigin, host: "payrlink.xyz", "content-type": "application/json; charset=utf-8" };
  expect((await nonce(new Request(`${config.appOrigin}/api/auth/nonce`, { method: "POST", headers, body }))).status).toBe(200);
  const response = await nonce(new Request(`${config.appOrigin}/api/auth/nonce`, { method: "POST", headers, body: new Uint8Array([0xff]) }));
  expect(response.status).toBe(400);
  expectPrivate(response);
});

it("never sets a login cookie when the atomic repository completion fails and never exposes provider text", async () => {
  fixture.repository = { ...fixture.repository, completeLogin: async () => { throw new Error("provider secret signature token body"); } };
  const issued = await (await nonce(request("nonce", { purpose: "payr-login-v1", wallet: owner.address }))).json();
  const response = await verify(request("verify", { nonceId: issued.nonceId, signature: await owner.signMessage({ message: issued.message }) }));
  expect(response.status).toBe(500);
  expect(response.headers.get("set-cookie")).toBeNull();
  expectPrivate(response);
  expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
});

it("returns exactly one login cookie for concurrent verification, denies replay, and rotates on a fresh login", async () => {
  const issued = await (await nonce(request("nonce", { purpose: "payr-login-v1", wallet: owner.address }))).json();
  const input = { nonceId: issued.nonceId, signature: await owner.signMessage({ message: issued.message }) };
  const responses = await Promise.all([verify(request("verify", input)), verify(request("verify", input))]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  expect(responses.filter((response) => response.headers.has("set-cookie"))).toHaveLength(1);
  const replay = await verify(request("verify", input));
  expect(await replay.json()).toEqual({ error: { code: "NONCE_INVALID_OR_USED" } });
  expect(replay.headers.get("set-cookie")).toBeNull();
  const fresh = await (await nonce(request("nonce", { purpose: "payr-login-v1", wallet: owner.address }))).json();
  const loggedIn = await verify(request("verify", { nonceId: fresh.nonceId, signature: await owner.signMessage({ message: fresh.message }) }));
  expect(loggedIn.headers.get("set-cookie")).not.toBe(responses.find((response) => response.status === 200)!.headers.get("set-cookie"));
});

it("requires a still-matching session when verifying a payout challenge", async () => {
  const codec = createSessionCodec(config);
  const cookie = `${SESSION_COOKIE}=${await codec.seal(identity)}`;
  const issued = await (await nonce(request("nonce", { purpose: "payr-payout-change-v1", newPayoutWallet: newPayee.address, expectedRevision: 1 }, { cookie }))).json();
  const input = { nonceId: issued.nonceId, signature: await owner.signMessage({ message: issued.message }) };
  for (const [token, status] of [
    [undefined, 401], ["tampered", 401], [await codec.seal(identity, new Date(Date.now() - 8 * 60 * 60 * 1000)), 401],
    [await codec.seal({ ...identity, workspaceId: "00000000-0000-4000-8000-000000000099" }), 400],
  ] as const) {
    const response = await verify(request("verify", input, token === undefined ? {} : { cookie: `${SESSION_COOKIE}=${token}` }));
    expect(response.status).toBe(status);
    expectPrivate(response);
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect(fixture.state.profile.revision).toBe(1);
  expect((await verify(request("verify", input, { cookie }))).status).toBe(200);
});

it("has no no-cookie configuration dependency or authentication test bypass", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
  vi.stubEnv("ARC_CHAIN_ID", undefined);
  vi.stubEnv("SESSION_ENCRYPTION_KEY", undefined);
  vi.stubEnv("CONNECTOR_TOKEN_PEPPER", undefined);
  vi.stubEnv("PAYR_TEST_AUTH", "true");
  const response = await session(new Request(`${config.appOrigin}/api/auth/session`));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { code: "AUTH_REQUIRED" } });
  expectPrivate(response);
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
});

it("keeps session reads and bodyless logout independent of the database", async () => {
  const cookie = `${SESSION_COOKIE}=${await createSessionCodec(config).seal(identity)}`;
  expect((await session(new Request(`${config.appOrigin}/api/auth/session`, { headers: { cookie } }))).status).toBe(200);
  const response = await logout(new Request(`${config.appOrigin}/api/auth/logout`, { method: "POST", headers: { origin: config.appOrigin, host: "payrlink.xyz" } }));
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
});

it("keeps host-cookie protections on an explicitly configured HTTP development origin", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  const headers = { origin: "http://localhost:3000", host: "localhost:3000" };
  const issued = await (await nonce(request("nonce", { purpose: "payr-login-v1", wallet: owner.address }, headers))).json();
  const response = await verify(request("verify", { nonceId: issued.nonceId, signature: await owner.signMessage({ message: issued.message }) }, headers));
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("Secure; SameSite=Lax");
  expect(response.headers.get("set-cookie")).not.toMatch(/domain=/i);
});

it("returns a sanitized private configuration failure rather than leaking invalid environment values", async () => {
  vi.stubEnv("SESSION_ENCRYPTION_KEY", "provider-secret-not-a-key");
  const response = await nonce(request("nonce", { purpose: "payr-login-v1", wallet: owner.address }));
  expect(response.status).toBe(503);
  expectPrivate(response);
  expect(await response.json()).toEqual({ error: { code: "CONFIGURATION_ERROR" } });
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
});
