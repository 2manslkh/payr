// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { createIdentityEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createIdentityRepository } from "../db/identity";
import { IdentityError, SESSION_COOKIE } from "../identity/contracts";
import { apiError, getDashboardSession, getIdentityRuntime, privateJson, readRequestSession, requireRequestSession } from "./runtime";
import { createSessionCodec } from "./session";
import { config, createAuthRepository, identity } from "./test-support";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../../config/env", () => ({ createIdentityEnv: vi.fn() }));
vi.mock("../db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("../db/identity", () => ({ createIdentityRepository: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("loads safely without configuration and short-circuits missing browser cookies", async () => {
  vi.mocked(createIdentityEnv).mockImplementation(() => { throw new Error("missing config"); });
  vi.mocked(cookies).mockResolvedValue({ getAll: () => [] } as unknown as Awaited<ReturnType<typeof cookies>>);
  expect(createIdentityEnv).not.toHaveBeenCalled();
  expect(await readRequestSession(new Request(config.appOrigin))).toBeNull();
  expect(await getDashboardSession()).toBeNull();
  await expect(requireRequestSession(new Request(config.appOrigin), false)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  expect(createIdentityEnv).not.toHaveBeenCalled();
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  expect(createIdentityRepository).not.toHaveBeenCalled();
});

it("reads request and async dashboard cookies with no database initialization", async () => {
  vi.mocked(createIdentityEnv).mockReturnValue(config);
  const token = await createSessionCodec(config).seal(identity);
  vi.mocked(cookies).mockResolvedValue({ getAll: () => [{ name: SESSION_COOKIE, value: token }] } as unknown as Awaited<ReturnType<typeof cookies>>);
  expect(await readRequestSession(new Request(config.appOrigin, { headers: { cookie: `other=x; ${SESSION_COOKIE}=${token}` } }))).toEqual(identity);
  expect(await getDashboardSession()).toEqual(identity);
  expect(await readRequestSession(new Request(config.appOrigin, { headers: { cookie: `${SESSION_COOKIE}=tampered` } }))).toBeNull();
  expect(await readRequestSession(new Request(config.appOrigin, { headers: { cookie: `${SESSION_COOKIE}=${token}; ${SESSION_COOKIE}=other` } }))).toBeNull();
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  expect(createIdentityRepository).not.toHaveBeenCalled();
});

it("allows session-authorized reads without Origin and checks CSRF for explicit mutations", async () => {
  vi.mocked(createIdentityEnv).mockReturnValue(config);
  const token = await createSessionCodec(config).seal(identity);
  await expect(requireRequestSession(new Request(config.appOrigin, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }))).resolves.toEqual(identity);
  await expect(requireRequestSession(new Request(config.appOrigin), true)).rejects.toMatchObject({ code: "ORIGIN_NOT_ALLOWED" });
  await expect(requireRequestSession(new Request(config.appOrigin, { headers: { origin: config.appOrigin, host: "payrlink.xyz" } }), true))
    .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  expect(createSupabaseAdminClient).not.toHaveBeenCalled();
});

it("creates the frozen runtime via factories only when explicitly requested", () => {
  const { repository } = createAuthRepository();
  vi.mocked(createIdentityEnv).mockReturnValue(config);
  vi.mocked(createIdentityRepository).mockReturnValue(repository);
  const runtime = getIdentityRuntime();
  expect(runtime.repository).toBe(repository);
  expect(runtime.config).toEqual(config);
  expect(Object.isFrozen(runtime)).toBe(true);
  expect(Object.isFrozen(runtime.config)).toBe(true);
  expect(Object.isFrozen(runtime.repository)).toBe(true);
  expect(createSupabaseAdminClient).toHaveBeenCalledOnce();
  expect(createIdentityRepository).toHaveBeenCalledOnce();
});

it("returns private JSON and sanitizes arbitrary errors and IdentityError codes", async () => {
  for (const response of [privateJson({ ok: true }), apiError(new Error("provider secret")), apiError(new IdentityError("provider secret", 502))]) {
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain("provider secret");
  }
  expect(await apiError(new IdentityError("NONCE_INVALID_OR_USED")).json()).toEqual({ error: { code: "NONCE_INVALID_OR_USED" } });
});
