"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { createContext, use } from "react";
import { ConsoleError } from "./console-api";
import { arcTestnet } from "../lib/chain/arc";
import { stringToHex } from "viem";

type WalletActions = { logout(): Promise<void>; signOwner(address: string, message: string): Promise<string> };
const WalletActionsContext = createContext<WalletActions | null>(null);
export const usePrivyWalletActions = () => use(WalletActionsContext);

function OwnerActions({ children }: { children: React.ReactNode }) {
  const { logout } = usePrivy();
  const { wallets, ready } = useWallets();
  return <WalletActionsContext value={{ logout, async signOwner(address, message) {
    if (!ready) throw new ConsoleError("WALLET_UNAVAILABLE");
    const wallet = wallets.find((item) => ["privy", "privy-v2"].includes(item.walletClientType) && item.address.toLowerCase() === address.toLowerCase());
    if (!wallet) throw new ConsoleError("WRONG_OWNER");
    const provider = await wallet.getEthereumProvider();
    const signature: unknown = await provider.request({ method: "personal_sign", params: [stringToHex(message), wallet.address] });
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new ConsoleError("INVALID_SIGNATURE");
    return signature;
  } }}>{children}</WalletActionsContext>;
}

export function PayrPrivyProvider({ children, appId }: { children: React.ReactNode; appId?: string }) {
  if (!appId) return children;
  return <PrivyProvider appId={appId} config={{ loginMethods: ["email", "google", "wallet"],
    appearance: { theme: "light", accentColor: "#071b3b" },
    defaultChain: arcTestnet, supportedChains: [arcTestnet],
    // Provision only on our server so ownership, policy and external ID are fixed.
    embeddedWallets: { ethereum: { createOnLogin: "off" } },
  }}><OwnerActions>{children}</OwnerActions></PrivyProvider>;
}
