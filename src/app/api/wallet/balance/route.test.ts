import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPublicClient } from "viem";
import { getIdentityConfig, requireRequestSession } from "../../../../lib/auth/runtime";
import { createSupabaseAdminClient } from "../../../../lib/db/admin";
import { IdentityError } from "../../../../lib/identity/contracts";
import { GET } from "./route";

vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: vi.fn() }));
vi.mock("../../../../lib/auth/runtime", async (original) => ({
  ...await original<typeof import("../../../../lib/auth/runtime")>(), requireRequestSession: vi.fn(), getIdentityConfig: vi.fn(),
}));
vi.mock("../../../../lib/db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
const admit = vi.fn();
const rpc = vi.fn(() => ({ abortSignal: admit }));
const address = `0x${"a".repeat(40)}`;
const client = { getChainId: vi.fn(), getBalance: vi.fn() };
const request = (query = `address=${address}`) => new Request(`https://payr.test/api/wallet/balance?${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ARC_CHAIN_ID", "5042002");
  vi.stubEnv("ARC_RPC_URL", "https://rpc.example.test/private-provider-key");
  vi.stubEnv("VERCEL", "0");
  vi.mocked(getIdentityConfig).mockReturnValue({ appOrigin: "https://payr.test", chainId: 5042002,
    sessionKey: new Uint8Array(32).fill(1), connectorPepper: new TextEncoder().encode("test-pepper") });
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createSupabaseAdminClient>);
  rpc.mockImplementation(() => ({ abortSignal: admit }));
  admit.mockResolvedValue({ data: { allowed: true }, error: null });
  vi.mocked(requireRequestSession).mockResolvedValue({ workspaceId: "workspace", ownerWallet: `0x${"1".repeat(40)}` });
  vi.mocked(createPublicClient).mockReturnValue(client as unknown as ReturnType<typeof createPublicClient>);
  client.getChainId.mockResolvedValue(5042002);
  client.getBalance.mockResolvedValue(9007199254740993000000000000000001n);
});
it("denies exhausted distributed admission without any chain reads", async () => {
  admit.mockResolvedValue({ data: { allowed: false }, error: null });
  const response = await GET(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ code: "RATE_LIMITED" });
  expect(createPublicClient).not.toHaveBeenCalled();
  expect(client.getChainId).not.toHaveBeenCalled();
  expect(client.getBalance).not.toHaveBeenCalled();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("waits for admission to succeed before creating any provider client", async () => {
  let release!: (result: { data: { allowed: boolean }; error: null }) => void;
  const waiting = new Promise<{ data: { allowed: boolean }; error: null }>((resolve) => { release = resolve; });
  admit.mockReturnValue(waiting);
  const response = GET(request());
  await vi.waitFor(() => expect(admit).toHaveBeenCalledTimes(1));
  expect(createPublicClient).not.toHaveBeenCalled();
  release({ data: { allowed: true }, error: null });
  expect((await response).status).toBe(200);
  expect(client.getChainId).toHaveBeenCalledTimes(1);
  expect(client.getBalance).toHaveBeenCalledTimes(1);
});

it.each([
  { data: { allowed: true }, error: { message: "PRIVATE_DATABASE_DETAIL" } },
  ...[null, {}, { allowed: "true" }, { allowed: true, extra: 1 }].map((data) => ({ data, error: null })),
])("fails closed on an unsuccessful or malformed admission reply %j", async (result) => {
  admit.mockResolvedValue(result);
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "BALANCE_UNAVAILABLE" });
  expect(createPublicClient).not.toHaveBeenCalled();
});
it("bounds the admission deadline and redacts transport failures before any chain reads", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  admit.mockRejectedValue(new Error("PRIVATE_DATABASE_DETAIL"));
  const response = await GET(request());
  expect(timeout).toHaveBeenCalledExactlyOnceWith(2_000);
  expect(admit).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "BALANCE_UNAVAILABLE" });
  expect(createPublicClient).not.toHaveBeenCalled();
});
it("uses the authenticated owner for admission across selected addresses and ignores untrusted forwarding headers", async () => {
  for (const selected of [address, `0x${"b".repeat(40)}`]) {
    await GET(new Request(`https://payr.test/api/wallet/balance?address=${selected}`, {
      headers: { "x-forwarded-for": selected, "x-vercel-forwarded-for": selected },
    }));
  }
  expect(rpc).toHaveBeenCalledTimes(2);
  const args = { p_workspace_id: "workspace", p_owner_wallet: `0x${"1".repeat(40)}`,
    p_ip_hash: createHmac("sha256", "test-pepper").update("payr:wallet-balance:ip:v1:127.0.0.1").digest("hex") };
  for (const call of rpc.mock.calls) expect(call).toEqual(["payr_admit_wallet_balance_v1", args]);
});
it("normalizes only the trusted Vercel IP before hashing", async () => {
  vi.stubEnv("VERCEL", "1");
  await GET(new Request(request().url, { headers: { "x-vercel-forwarded-for": "::ffff:192.0.2.1", "x-forwarded-for": "198.51.100.1" } }));
  expect(rpc).toHaveBeenCalledWith("payr_admit_wallet_balance_v1", expect.objectContaining({
    p_ip_hash: createHmac("sha256", "test-pepper").update("payr:wallet-balance:ip:v1:192.0.2.1").digest("hex"),
  }));
});
it.each(["", "unknown", "192.0.2.1, 192.0.2.2"])("fails closed for invalid trusted IP %s", async (ip) => {
  vi.stubEnv("VERCEL", "1");
  expect((await GET(new Request(request().url, { headers: { "x-vercel-forwarded-for": ip } }))).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
  expect(createPublicClient).not.toHaveBeenCalled();
});
it.each([true, false])("spends at most two actual provider requests without retries (success=%s)", async (success) => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  vi.mocked(createPublicClient).mockImplementation(actual.createPublicClient);
  const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    return success ? Response.json({ jsonrpc: "2.0", id: body.id, result: body.method === "eth_chainId" ? "0x4cef52" : "0x0" })
      : new Response("PRIVATE_PROVIDER_DETAIL", { status: 503 });
  });
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(request());
  expect(response.status).toBe(success ? 200 : 503);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("aborts both stalled provider reads within eight seconds without retrying", async () => {
  vi.useFakeTimers();
  const actual = await vi.importActual<typeof import("viem")>("viem");
  vi.mocked(createPublicClient).mockImplementation(actual.createPublicClient);
  const fetcher = vi.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  vi.stubGlobal("fetch", fetcher);
  const pending = GET(request());
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await vi.advanceTimersByTimeAsync(8_000);
  expect((await pending).status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [, init] of fetcher.mock.calls) expect(init.signal!.aborted).toBe(true);
});

it("reads the selected address, not the session owner, and returns exact private native USDC", async () => {
  const response = await GET(request(`address=0x${"A".repeat(40)}`));
  expect(response.status).toBe(200);
  expect(client.getBalance).toHaveBeenCalledExactlyOnceWith({ address });
  expect(await response.json()).toEqual({ address, chainId: 5042002, balanceAtomic: "9007199254740993000000000000000001", updatedAt: expect.any(String) });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
it("returns a genuine zero without payment or signer configuration", async () => {
  client.getBalance.mockResolvedValue(0n);
  expect(await (await GET(request())).json()).toMatchObject({ balanceAtomic: "0" });
});
it("authenticates before validating inputs or contacting RPC", async () => {
  vi.mocked(requireRequestSession).mockRejectedValue(new IdentityError("AUTH_REQUIRED", 401));
  const response = await GET(request("address=bad"));
  expect(response.status).toBe(401);
  expect(createPublicClient).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
it.each(["", "address=bad", `address=${address}&address=${address}`, `address=${address}&rpc=https://other.test`, `wallet=${address}`])("rejects query %s", async (query) => {
  expect((await GET(request(query))).status).toBe(400);
  expect(createPublicClient).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
it.each(["rpc", "network", "configuration"])("fails safely on %s errors without exposing provider details", async (failure) => {
  if (failure === "rpc") client.getBalance.mockRejectedValue(new Error("PRIVATE_PROVIDER_KEY"));
  if (failure === "network") client.getChainId.mockResolvedValue(1);
  if (failure === "configuration") vi.stubEnv("ARC_RPC_URL", "http://untrusted.test");
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "BALANCE_UNAVAILABLE" });
});
