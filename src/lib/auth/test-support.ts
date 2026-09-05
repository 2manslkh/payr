import { privateKeyToAccount } from "viem/accounts";
import { IdentityError, type AuthNonce, type IdentityConfig, type IdentityRepository, type SenderProfile } from "../identity/contracts";

export const owner = privateKeyToAccount(`0x${"1".repeat(64)}`);
export const payee = privateKeyToAccount(`0x${"2".repeat(64)}`);
export const newPayee = privateKeyToAccount(`0x${"3".repeat(64)}`);
export const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: owner.address.toLowerCase() };
export const config: IdentityConfig = {
  appOrigin: "https://payrlink.xyz", chainId: 5042002,
  sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8),
};

// This seam models atomic consumption only; the database lane tests SQL locking.
export function createAuthRepository() {
  const state = {
    now: new Date("2026-09-05T00:00:00.000Z"),
    nonces: new Map<string, AuthNonce>(),
    profile: {
      id: "00000000-0000-4000-8000-000000000002", revision: 1,
      businessName: null, billingAddress: null, contactName: null, contactEmail: null,
      payoutWallet: owner.address.toLowerCase(), invoicePrefix: null, defaultPaymentTermsDays: null,
    } as SenderProfile,
  };
  const unused = async (): Promise<never> => { throw new Error("Unexpected repository operation"); };
  const consume = (id: string) => {
    const nonce = state.nonces.get(id);
    if (!nonce || nonce.consumedAt || state.now.getTime() >= Date.parse(nonce.expiresAt)) {
      throw new IdentityError("NONCE_INVALID_OR_USED");
    }
    state.nonces.set(id, { ...nonce, consumedAt: state.now.toISOString() });
    return nonce;
  };
  const repository: IdentityRepository = {
    async issueNonce(nonce) { state.nonces.set(nonce.id, nonce); return nonce; },
    async findNonce(id) { return state.nonces.get(id) ?? null; },
    async completeLogin(id, wallet) {
      const nonce = state.nonces.get(id);
      if (nonce?.purpose !== "payr-login-v1" || nonce.wallet !== wallet) throw new IdentityError("NONCE_INVALID_OR_USED");
      consume(id);
      return { ...identity, ownerWallet: wallet };
    },
    async applyPayoutChange(session, id) {
      const nonce = state.nonces.get(id);
      if (nonce?.purpose !== "payr-payout-change-v1" || nonce.workspaceId !== session.workspaceId
        || nonce.wallet !== session.ownerWallet || nonce.profileRevision !== state.profile.revision
        || nonce.payoutFrom !== state.profile.payoutWallet) throw new IdentityError("NONCE_INVALID_OR_USED");
      consume(id);
      state.profile = { ...state.profile, payoutWallet: nonce.payoutTo!, revision: state.profile.revision + 1 };
      return state.profile;
    },
    async getProfile(session) {
      if (session.workspaceId !== identity.workspaceId || session.ownerWallet !== identity.ownerWallet) throw new IdentityError("NOT_FOUND", 404);
      return state.profile;
    },
    saveProfile: unused, listClients: unused, saveClient: unused, listConnectors: unused,
    createConnector: unused, revokeConnector: unused, findConnector: unused, admitConnector: unused, listActivity: unused,
  };
  return { state, repository };
}
