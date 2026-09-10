import { verifyMessage } from "viem";
import { IdentityError } from "../identity/contracts";
import { privyLoginInput, privyUserIdSchema, type BusinessWallet, type PrivyRepository } from "./contracts";

export function createPrivyLoginService(deps: {
  repository: PrivyRepository;
  verifyToken(token: string): Promise<string>;
  ensureWallet(userId: string): Promise<BusinessWallet>;
  appOrigin: string;
  chainId: number;
  now?: () => number;
}) {
  return async (token: string, input: unknown) => {
    const command = privyLoginInput.parse(input);
    const userId = privyUserIdSchema.parse(await deps.verifyToken(token));
    if (command.action === "signin") {
      const wallet = await deps.ensureWallet(userId);
      return deps.repository.saveWallet(userId, wallet);
    }
    const account = await deps.repository.account(userId);
    if (!account) throw new IdentityError("AUTH_REQUIRED", 401);
    if (command.action === "create_workspace") return deps.repository.createWorkspace(userId);
    if (command.action === "link_challenge") {
      const challenge = await deps.repository.issueLink(userId, command.wallet, deps.appOrigin, deps.chainId);
      return { nonceId: challenge.id, message: challenge.message, expiresAt: challenge.expiresAt };
    }
    const challenge = await deps.repository.findLink(userId, command.nonceId);
    if (!challenge || challenge.userId !== userId || challenge.consumed
      || Date.parse(challenge.expiresAt) <= (deps.now ?? Date.now)()) throw new IdentityError("NONCE_INVALID_OR_USED");
    let valid = false;
    try { valid = await verifyMessage({ address: challenge.ownerWallet as `0x${string}`,
      message: challenge.message, signature: command.signature as `0x${string}` }); } catch { /* EOA proof only. */ }
    if (!valid) throw new IdentityError("SIGNATURE_INVALID", 401);
    return deps.repository.completeLink(userId, command.nonceId);
  };
}
