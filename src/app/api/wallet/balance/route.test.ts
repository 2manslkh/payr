import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPublicClient } from "viem";
import { requireRequestSession } from "../../../../lib/auth/runtime";
import { IdentityError } from "../../../../lib/identity/contracts";
import { GET } from "./route";

vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: vi.fn() }));
vi.mock("../../../../lib/auth/runtime", async (original) => ({
  ...await original<typeof import("../../../../lib/auth/runtime")>(), requireRequestSession: vi.fn(),
}));
const address = `0x${"a".repeat(40)}`;
const client = { getChainId: vi.fn(), getBalance: vi.fn() };
const request = (query = `address=${address}`) => new Request(`https://payr.test/api/wallet/balance?${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ARC_CHAIN_ID", "5042002");
  vi.stubEnv("ARC_RPC_URL", "https://rpc.example.test/private-provider-key");
  vi.mocked(requireRequestSession).mockResolvedValue({ workspaceId: "workspace", ownerWallet: `0x${"1".repeat(40)}` });
  vi.mocked(createPublicClient).mockReturnValue(client as unknown as ReturnType<typeof createPublicClient>);
  client.getChainId.mockResolvedValue(5042002);
  client.getBalance.mockResolvedValue(9007199254740993000000000000000001n);
});
afterEach(() => vi.unstubAllEnvs());

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
});
it.each(["", "address=bad", `address=${address}&address=${address}`, `address=${address}&rpc=https://other.test`, `wallet=${address}`])("rejects query %s", async (query) => {
  expect((await GET(request(query))).status).toBe(400);
  expect(createPublicClient).not.toHaveBeenCalled();
});
it.each(["rpc", "network", "configuration"])("fails safely on %s errors without exposing provider details", async (failure) => {
  if (failure === "rpc") client.getBalance.mockRejectedValue(new Error("PRIVATE_PROVIDER_KEY"));
  if (failure === "network") client.getChainId.mockResolvedValue(1);
  if (failure === "configuration") vi.stubEnv("ARC_RPC_URL", "http://untrusted.test");
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "BALANCE_UNAVAILABLE" });
});
