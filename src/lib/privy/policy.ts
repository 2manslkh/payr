import type { PrivyClient } from "@privy-io/node";

// A receiving-only testnet wallet: the owner may sign PAYR payout-setting messages,
// but transaction signing, typed data and export have no ALLOW rule (default DENY).
export function receivingWalletPolicy(origin: string): Parameters<ReturnType<PrivyClient["policies"]>["create"]>[0] {
  const url = new URL(origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid PAYR origin");
  return { version: "1.0", name: "PAYR receiving wallet v1", chain_type: "ethereum", rules: [{
    name: "Owner confirms PAYR payout settings", method: "personal_sign", action: "ALLOW", conditions: [
      { field_source: "message", field: "content", operator: "starts_with", value: `${url.host} wants you to authorize a Payr payout change with your Ethereum account:\n` },
      { field_source: "message", field: "content", operator: "contains", value: `\nURI: ${origin}\n` },
      { field_source: "message", field: "content", operator: "contains", value: "\nChain ID: 5042002\n" },
      { field_source: "message", field: "content", operator: "contains", value: "\nPurpose: payr-payout-change-v1\n" },
    ],
  }] };
}
