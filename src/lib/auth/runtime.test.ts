// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { createIdentityEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createIdentityRepository } from "../db/identity";
import { createPrivyRepository } from "../db/privy";
import { IdentityError, SESSION_COOKIE } from "../identity/contracts";
import { apiError, getDashboardSession, getIdentityRuntime, privateJson, readRequestSession, requireRequestSession } from "./runtime";
import { createSessionCodec } from "./session";
import { config, createAuthRepository, identity } from "./test-support";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../../config/env", () => ({ createIdentityEnv: vi.fn() }));
vi.mock("../db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("../db/identity", () => ({ createIdentityRepository: vi.fn() }));
vi.mock("../db/privy", () => ({ createPrivyRepository: vi.fn() }));
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

it.each(["request", "dashboard"])("revalidates the Privy subject and workspace link on every %s read", async (surface) => {
  vi.mocked(createIdentityEnv).mockReturnValue(config);
  const session = { ...identity, privyUserId: "did:privy:owner" };
  const token = await createSessionCodec(config).seal(session);
  vi.mocked(cookies).mockResolvedValue({ getAll: () => [{ name: SESSION_COOKIE, value: token }] } as unknown as Awaited<ReturnType<typeof cookies>>);
  const linked = { wallet: { id: "business-wallet", address: `0x${"3".repeat(40)}` }, session };
  const account = vi.fn<ReturnType<typeof createPrivyRepository>["account"]>().mockResolvedValue(linked);
  vi.mocked(createPrivyRepository).mockReturnValue({ account, saveWallet: vi.fn(), createWorkspace: vi.fn(),
    issueLink: vi.fn(), findLink: vi.fn(), completeLink: vi.fn() });
  const read = () => surface === "dashboard" ? getDashboardSession()
    : readRequestSession(new Request(config.appOrigin, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }));
  expect(await read()).toEqual(session);
  for (const current of [null, { ...linked, session: null },
    { ...linked, session: { ...session, workspaceId: "00000000-0000-4000-8000-000000000099" } },
    { ...linked, session: { ...session, ownerWallet: `0x${"4".repeat(40)}` } },
    { ...linked, session: { ...session, privyUserId: "did:privy:other" } },
  ]) {
    account.mockResolvedValueOnce(current);
    expect(await read()).toBeNull();
  }
  expect(account).toHaveBeenCalledTimes(6);
  expect(account.mock.calls.every(([subject]) => subject === session.privyUserId)).toBe(true);
  account.mockRejectedValueOnce(new IdentityError("DATABASE_ERROR", 500));
  await expect(read()).rejects.toMatchObject({ code: "DATABASE_ERROR" });
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
