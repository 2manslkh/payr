import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { config } from "../../../../lib/auth/test-support";
import { createSessionCodec } from "../../../../lib/auth/session";

const mocks = vi.hoisted(() => ({ verifyToken: vi.fn(), ensureWallet: vi.fn(), saveWallet: vi.fn(), account: vi.fn(),
  createWorkspace: vi.fn(), issueLink: vi.fn(), findLink: vi.fn(), completeLink: vi.fn(), admitNonceIssuance: vi.fn() }));
vi.mock("../../../../lib/auth/runtime", async (original) => ({ ...await original<object>(),
  getIdentityRuntime: () => ({ config, repository: { admitNonceIssuance: mocks.admitNonceIssuance } }),
}));
vi.mock("../../../../lib/db/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("../../../../lib/db/privy", () => ({ createPrivyRepository: () => mocks }));
vi.mock("../../../../lib/privy/provider", () => ({ createPrivyProvider: () => mocks }));
const userId = "did:privy:owner";
const wallet = { id: "wallet", address: `0x${"1".repeat(40)}` };
const session = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: wallet.address, privyUserId: userId };
const request = (input: unknown = { action: "signin" }, headers: Record<string, string> = {}) => new Request(`${config.appOrigin}/api/auth/privy`, {
  method: "POST", headers: { Origin: config.appOrigin, Host: new URL(config.appOrigin).host, "Content-Type": "application/json", Authorization: "Bearer token", ...headers }, body: JSON.stringify(input),
});
beforeEach(() => {
  vi.resetAllMocks();
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
it("limits provisioning before external wallet creation", async () => {
  mocks.admitNonceIssuance.mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
  const response = await POST(request());
  expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("20");
  expect(mocks.ensureWallet).not.toHaveBeenCalled();
});
it("does not leak provider errors, tokens or secrets", async () => {
  mocks.ensureWallet.mockRejectedValue(new Error("SECRET and token"));
  const response = await POST(request());
  expect(await response.text()).toBe('{"error":{"code":"INTERNAL_ERROR"}}');
});
