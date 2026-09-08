"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createPaymentWalletConfig } from "../lib/chain/wagmi";
import type { WalletSettings } from "../lib/payments/payment-contracts";

export function PaymentWalletProvider({ settings, children }: { settings: WalletSettings; children: ReactNode }) {
  const [config] = useState(() => createPaymentWalletConfig(settings));
  const [query] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return <WagmiProvider config={config} reconnectOnMount={false}><QueryClientProvider client={query}>{children}</QueryClientProvider></WagmiProvider>;
}
