import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arcTestnet } from "./arc";
import type { WalletSettings } from "../payments/payment-contracts";
import { createSilentWalletLogger } from "./wallet-logger";

export function createPaymentWalletConfig(settings: WalletSettings) {
  if (new URL(settings.appOrigin).origin !== settings.appOrigin) throw new Error("Wallet metadata requires a public origin");
  return createConfig({
    chains: [arcTestnet], ssr: true, multiInjectedProviderDiscovery: true,
    connectors: [injected(), walletConnect({ projectId: settings.projectId, showQrModal: false, telemetryEnabled: false,
      logger: createSilentWalletLogger(), relayUrl: "wss://relay.walletconnect.org",
      metadata: { name: "Payr", description: "Client-approved USDC invoice payments on Arc Testnet",
        url: settings.appOrigin, icons: [`${settings.appOrigin}/brand/payr-mark-v2.png`] },
    })],
    transports: { [arcTestnet.id]: http(settings.rpcUrl) },
  });
}
