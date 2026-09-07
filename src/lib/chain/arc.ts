import { defineChain } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});
