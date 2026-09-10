import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { config } from "../../../../lib/auth/test-support";
import { createSessionCodec } from "../../../../lib/auth/session";
import { IdentityError } from "../../../../lib/identity/contracts";

const mocks = vi.hoisted(() => ({ provider: vi.fn(), verifyToken: vi.fn(), ensureWallet: vi.fn(), saveWallet: vi.fn(), account: vi.fn(),
  createWorkspace: vi.fn(), issueLink: vi.fn(), findLink: vi.fn(), completeLink: vi.fn(), admitNonceIssuance: vi.fn() }));
vi.mock("../../../../lib/auth/runtime", async (original) => ({ ...await original<object>(),
  getIdentityRuntime: () => ({ config, repository: { admitNonceIssuance: mocks.admitNonceIssuance } }),
}));
vi.mock("../../../../lib/db/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("../../../../lib/db/privy", () => ({ createPrivyRepository: () => mocks }));
vi.mock("../../../../lib/privy/provider", () => ({ createPrivyProvider: mocks.provider }));
const userId = "did:privy:owner";
const wallet = { id: "wallet", address: `0x${"1".repeat(40)}` };
const session = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: wallet.address, privyUserId: userId };
const request = (input: unknown = { action: "signin" }, headers: Record<string, string> = {}) => new Request(`${config.appOrigin}/api/auth/privy`, {
  method: "POST", headers: { Origin: config.appOrigin, Host: new URL(config.appOrigin).host, "Content-Type": "application/json", Authorization: "Bearer token", ...headers }, body: JSON.stringify(input),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL", "0");
  mocks.provider.mockReturnValue(mocks);
  mocks.verifyToken.mockResolvedValue(userId); mocks.ensureWallet.mockResolvedValue(wallet);
  mocks.saveWallet.mockResolvedValue({ wallet, session });
  mocks.admitNonceIssuance.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});
afterEach(() => vi.unstubAllEnvs());

it("exchanges verified Privy identity for a private PAYR session", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly; Secure; SameSite=Lax");
  expect(await createSessionCodec(config).open(cookie.split(";")[0].split("=")[1])).toEqual(session);
  expect(mocks.ensureWallet).toHaveBeenCalledWith(userId);
});
it("clears a previous workspace session while the new identity needs linking", async () => {
  mocks.saveWallet.mockResolvedValue({ wallet, session: null });
  const response = await POST(request());
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});
it("rejects cross-origin requests and agent credentials before provisioning", async () => {
  expect((await POST(request({}, { Origin: "https://evil.test" }))).status).toBe(403);
  mocks.verifyToken.mockRejectedValueOnce(new Error("invalid token"));
  const response = await POST(request({ action: "signin" }, { Authorization: "Bearer pac_test.invalid" }));
  expect(response.status).not.toBe(200);
  expect(mocks.ensureWallet).not.toHaveBeenCalled();
});
it("denies the IP before creating the provider or verifying a token", async () => {
  mocks.admitNonceIssuance.mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
  const response = await POST(request());
  expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("20");
  expect(mocks.provider).not.toHaveBeenCalled();
  expect(mocks.verifyToken).not.toHaveBeenCalled();
  expect(mocks.ensureWallet).not.toHaveBeenCalled();
});

it("retains verified-subject admission between token verification and wallet provisioning", async () => {
  mocks.admitNonceIssuance.mockImplementationOnce(async () => {
    expect(mocks.verifyToken).not.toHaveBeenCalled();
    return { allowed: true, retryAfterSeconds: 0 };
  }).mockImplementationOnce(async () => {
    expect(mocks.verifyToken).toHaveBeenCalledExactlyOnceWith("token");
    expect(mocks.ensureWallet).not.toHaveBeenCalled();
    return { allowed: false, retryAfterSeconds: 17 };
  });
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("17");
  expect(mocks.admitNonceIssuance.mock.calls[1][0].walletHash)
    .toBe(createHmac("sha256", config.connectorPepper).update(`privy:${userId}`).digest("hex"));
  expect(mocks.ensureWallet).not.toHaveBeenCalled();
  expect(mocks.saveWallet).not.toHaveBeenCalled();
});

it("keeps one normalized IP bucket across invalid tokens without charging unverified subjects", async () => {
  vi.stubEnv("VERCEL", "1");
  mocks.verifyToken.mockRejectedValue(new IdentityError("AUTH_REQUIRED", 401));
  for (const [ip, token] of [["192.0.2.1", "first.invalid.token"], ["::ffff:c000:201", "other.claimed.subject"]]) {
    expect((await POST(request(undefined, { "x-vercel-forwarded-for": ip, Authorization: `Bearer ${token}` }))).status).toBe(401);
  }
  expect(mocks.admitNonceIssuance).toHaveBeenCalledTimes(2);
  expect(mocks.admitNonceIssuance.mock.calls[0]).toEqual(mocks.admitNonceIssuance.mock.calls[1]);
  expect(mocks.ensureWallet).not.toHaveBeenCalled();
});

it.each([undefined, "", "invalid", "192.0.2.1, 192.0.2.2", "fe80::1%eth0"])("fails closed on untrusted Vercel IP input %s", async (ip) => {
  vi.stubEnv("VERCEL", "1");
  const headers: Record<string, string> = { "x-forwarded-for": "192.0.2.1" };
  if (ip !== undefined) headers["x-vercel-forwarded-for"] = ip;
  expect((await POST(request(undefined, headers))).status).toBe(400);
  expect(mocks.admitNonceIssuance).not.toHaveBeenCalled();
  expect(mocks.provider).not.toHaveBeenCalled();
});

it("shares the conservative local bucket outside Vercel regardless of forwarded headers", async () => {
  for (const ip of ["192.0.2.1", "192.0.2.2"]) {
    expect((await POST(request(undefined, { "x-vercel-forwarded-for": ip, "x-forwarded-for": ip }))).status).toBe(200);
  }
  expect(mocks.admitNonceIssuance).toHaveBeenCalledTimes(4);
  expect(mocks.admitNonceIssuance.mock.calls[0]).toEqual(mocks.admitNonceIssuance.mock.calls[2]);
  expect(mocks.admitNonceIssuance.mock.calls[1]).toEqual(mocks.admitNonceIssuance.mock.calls[3]);
});

it("admits five verified requests without charging either phase's bucket twice", async () => {
  // Offline reproduction of the existing RPC's per-minute 300/global, 30/IP, 5/wallet quotas.
  const counts = new Map<string, number>();
  let globalCount = 0;
  mocks.admitNonceIssuance.mockImplementation(async ({ walletHash, ipHash }) => {
    const wallet = `wallet:${walletHash}`, ip = `ip:${ipHash}`;
    if (globalCount >= 300 || (counts.get(ip) ?? 0) >= 30 || (counts.get(wallet) ?? 0) >= 5) {
      return { allowed: false, retryAfterSeconds: 60 };
    }
    globalCount++;
    for (const key of [wallet, ip]) counts.set(key, (counts.get(key) ?? 0) + 1);
    return { allowed: true, retryAfterSeconds: 0 };
  });
  for (let index = 0; index < 5; index++) expect((await POST(request())).status).toBe(200);
  expect((await POST(request())).status).toBe(429);
  expect(mocks.verifyToken).toHaveBeenCalledTimes(5);
  expect(mocks.ensureWallet).toHaveBeenCalledTimes(5);
  expect([...counts.values()]).toEqual([5, 5, 5, 5]);
  expect(globalCount).toBe(10);
});
it("does not leak provider errors, tokens or secrets", async () => {
  mocks.ensureWallet.mockRejectedValue(new Error("SECRET and token"));
  const response = await POST(request());
  expect(await response.text()).toBe('{"error":{"code":"INTERNAL_ERROR"}}');
});
