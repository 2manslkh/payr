import { getAddress } from "viem";
import { IdentityError, type AuthNonce } from "../identity/contracts";

export function buildAuthMessage(nonce: AuthNonce): string {
  const payout = nonce.purpose === "payr-payout-change-v1";
  if ((!payout && nonce.purpose !== "payr-login-v1") || (payout && (!nonce.workspaceId || !nonce.payoutFrom || !nonce.payoutTo))) {
    throw new IdentityError("NONCE_INVALID_OR_USED");
  }
  return [
    `${nonce.domain} wants you to ${payout ? "authorize a Payr payout change" : "sign in to Payr"} with your Ethereum account:`,
    getAddress(nonce.wallet),
    "",
    `URI: ${nonce.uri}`,
    "Version: 1",
    `Chain ID: ${nonce.chainId}`,
    `Nonce: ${nonce.challenge}`,
    `Issued At: ${new Date(nonce.issuedAt).toISOString()}`,
    `Expiration Time: ${new Date(nonce.expiresAt).toISOString()}`,
    `Request ID: ${nonce.id}`,
    `Purpose: ${nonce.purpose}`,
    ...(payout ? [
      `Workspace ID: ${nonce.workspaceId}`,
      `Current Payout: ${getAddress(nonce.payoutFrom!)}`,
      `New Payout: ${getAddress(nonce.payoutTo!)}`,
    ] : []),
  ].join("\n");
}
