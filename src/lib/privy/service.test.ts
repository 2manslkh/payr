import { beforeEach, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createPrivyLoginService } from "./service";
import type { PrivyRepository } from "./contracts";

const owner = privateKeyToAccount(`0x${"1".repeat(64)}`);
const userId = "did:privy:owner";
const wallet = { id: "privy-wallet", address: `0x${"2".repeat(40)}` };
const session = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: owner.address.toLowerCase(), privyUserId: userId };
const nonceId = "00000000-0000-4000-8000-000000000002";
const challenge = { id: nonceId, userId, workspaceId: session.workspaceId, ownerWallet: session.ownerWallet,
  message: `Link ${session.workspaceId} to ${userId} at https://payr.test, nonce ${nonceId}`,
  expiresAt: "2026-09-10T00:05:00Z", consumed: false };
let repository: PrivyRepository;
const verifyToken = vi.fn(async () => userId);
const ensureWallet = vi.fn(async () => wallet);
const login = () => createPrivyLoginService({ repository, verifyToken, ensureWallet, appOrigin: "https://payr.test", chainId: 5042002,
  now: () => Date.parse("2026-09-10T00:00:00Z") });
beforeEach(() => {
  vi.clearAllMocks();
  repository = { account: vi.fn(async () => ({ wallet, session: null })), saveWallet: vi.fn(async () => ({ wallet, session: null })),
    createWorkspace: vi.fn(async () => ({ wallet, session })), issueLink: vi.fn(async () => challenge),
    findLink: vi.fn(async () => challenge), completeLink: vi.fn(async () => ({ wallet, session })) };
});

it("provisions only for the verified user, without creating or claiming a workspace", async () => {
  expect(await login()("token", { action: "signin" })).toEqual({ wallet, session: null });
  expect(ensureWallet).toHaveBeenCalledWith(userId);
  expect(repository.saveWallet).toHaveBeenCalledWith(userId, wallet);
  expect(repository.createWorkspace).not.toHaveBeenCalled();
});
it("rejects caller-selected owner, wallet, policy, scope and workspace overrides", async () => {
  for (const key of ["userId", "owner", "wallet", "policyId", "scopes", "workspaceId"]) {
    await expect(login()("token", { action: "signin", [key]: "attacker" })).rejects.toThrow();
  }
  expect(ensureWallet).not.toHaveBeenCalled();
});
it("never provisions for an invalid token", async () => {
  verifyToken.mockRejectedValueOnce(new Error("invalid token"));
  await expect(login()("invalid", { action: "signin" })).rejects.toThrow();
  expect(ensureWallet).not.toHaveBeenCalled();
});
it("creates a workspace only after explicit selection and completed provisioning", async () => {
  await expect(login()("token", { action: "create_workspace" })).resolves.toEqual({ wallet, session });
  expect(repository.createWorkspace).toHaveBeenCalledWith(userId);
  vi.mocked(repository.account).mockResolvedValueOnce(null);
  await expect(login()("token", { action: "create_workspace" })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
});
it("links an existing workspace using its original owner's fresh signature", async () => {
  const signature = await owner.signMessage({ message: challenge.message });
  await expect(login()("token", { action: "link_workspace", nonceId, signature })).resolves.toEqual({ wallet, session });
  expect(repository.completeLink).toHaveBeenCalledWith(userId, nonceId);
  expect(repository.createWorkspace).not.toHaveBeenCalled();
});
it("rejects linking proofs for another identity, expired/consumed challenges and altered messages", async () => {
  const signature = await owner.signMessage({ message: challenge.message });
  for (const change of [{ userId: "did:privy:other" }, { consumed: true }, { expiresAt: "2026-09-10T00:00:00Z" }, { message: "changed" }]) {
    vi.mocked(repository.findLink).mockResolvedValueOnce({ ...challenge, ...change });
    await expect(login()("token", { action: "link_workspace", nonceId, signature })).rejects.toThrow();
  }
  expect(repository.completeLink).not.toHaveBeenCalled();
});
it("rejects agent signing and wallet administration commands", async () => {
  for (const action of ["sign", "pay", "export", "create_wallet", "change_owner"]) await expect(login()("token", { action })).rejects.toThrow();
});
