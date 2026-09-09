"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { ARC_TESTNET_CHAIN_ID } from "../lib/chain/arc";
import { AnimatedNumber, Skeleton } from "./console-motion";
import { ConsoleError, consoleApi } from "./console-api";
import type { EthereumProvider } from "./wallet";
import styles from "./overview.module.css";

type Connection = { address: string | null; state: "checking" | "missing" | "disconnected" | "connected" | "error" };
type Balance = { address: string; chainId: number; balanceAtomic: string; updatedAt: string };
const selectedAddress = (accounts: unknown) => Array.isArray(accounts) && typeof accounts[0] === "string"
  && /^0x[0-9a-fA-F]{40}$/.test(accounts[0]) ? accounts[0].toLowerCase() : null;

export function WalletBalance({ ownerWallet }: { ownerWallet: string }) {
  const [connection, setConnection] = useState<Connection>({ address: null, state: "checking" });
  const [connecting, setConnecting] = useState(false);
  const [networkRevision, setNetworkRevision] = useState(0);
  const version = useRef({ request: 0 });
  useEffect(() => {
    const requests = version.current;
    const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    let disposed = false;
    const accountsChanged = (accounts: unknown) => {
      requests.request++;
      const address = selectedAddress(accounts);
      setConnection({ address, state: address ? "connected" : "disconnected" });
    };
    const disconnect = () => accountsChanged([]);
    const read = () => {
      const request = ++requests.request;
      Promise.resolve().then(async () => {
        if (!provider?.request) {
          if (!disposed) setConnection({ address: null, state: "missing" });
          return;
        }
        try {
          const accounts = await provider.request({ method: "eth_accounts" });
          if (!disposed && request === requests.request) accountsChanged(accounts);
        } catch {
          if (!disposed && request === requests.request) setConnection({ address: null, state: "error" });
        }
      });
    };
    const chainChanged = () => { read(); setNetworkRevision((value) => value + 1); };
    const visible = () => { if (!document.hidden) read(); };
    provider?.on?.("accountsChanged", accountsChanged);
    provider?.on?.("chainChanged", chainChanged);
    provider?.on?.("disconnect", disconnect);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    read();
    return () => {
      disposed = true;
      requests.request++;
      provider?.removeListener?.("accountsChanged", accountsChanged);
      provider?.removeListener?.("chainChanged", chainChanged);
      provider?.removeListener?.("disconnect", disconnect);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  async function connect() {
    const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    const request = ++version.current.request;
    setConnecting(true);
    try {
      const accounts = await provider?.request({ method: "eth_requestAccounts" });
      if (request !== version.current.request) return;
      const address = selectedAddress(accounts);
      setConnection({ address, state: address ? "connected" : provider ? "disconnected" : "missing" });
    } catch {
      if (request === version.current.request) setConnection({ address: null, state: "error" });
    } finally { setConnecting(false); }
  }
  return <section className={styles.wallet} aria-labelledby="wallet-balance-heading">
    <div className={styles.metricHeading}><h2 id="wallet-balance-heading">Connected wallet balance</h2><span>Arc Testnet</span></div>
    {connection.state === "checking" ? <div className={styles.walletPlaceholder} role="status">
      <span className="sr-only">Checking wallet connection...</span><Skeleton className={styles.balanceSkeleton} />
      <p>Browser-wallet reads require JavaScript. No balance has been assumed.</p>
    </div> : connection.address ? <WalletBalanceRead key={connection.address} address={connection.address} revision={networkRevision} /> : <div className={styles.walletPlaceholder}>
      <p className={styles.connectionTitle}>{connection.state === "missing" ? "No browser wallet found" : connection.state === "error" ? "Wallet connection unavailable" : "Connect to see your balance"}</p>
      <p className="muted">{connection.state === "missing" ? "Enable an Ethereum wallet extension or open Payr in your wallet's browser, then reload." : "Read-only access. No signature or transaction required."}</p>
      {connection.state !== "missing" && <button className="button secondary" disabled={connecting} onClick={connect}>{connecting ? "Connecting..." : "Connect wallet"}</button>}
    </div>}
    {connection.address && <div className={styles.walletIdentity}>
      <code>{connection.address}</code>
      {connection.address !== ownerWallet.toLowerCase() && <p className="attention">This wallet differs from your workspace owner. Invoices still belong to your signed-in workspace.</p>}
    </div>}
  </section>;
}

function WalletBalanceRead({ address, revision }: { address: string; revision: number }) {
  const [state, setState] = useState<{ data: Balance | null; loading: boolean; error: unknown }>({ data: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const data = await consoleApi<Balance>(`/api/wallet/balance?address=${address}`, undefined, controller.signal);
        if (data.address !== address || data.chainId !== ARC_TESTNET_CHAIN_ID || typeof data.balanceAtomic !== "string"
          || !/^(0|[1-9]\d{0,77})$/.test(data.balanceAtomic) || typeof data.updatedAt !== "string"
          || !Number.isFinite(Date.parse(data.updatedAt))) throw new ConsoleError("INVALID_RESPONSE");
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ data: null, loading: false, error });
      }
    });
    return () => controller.abort();
  }, [address, attempt, revision]);
  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      if (!document.hidden && Date.now() - lastRefresh > 1_000) {
        lastRefresh = Date.now();
        setAttempt((value) => value + 1);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const expired = state.error instanceof ConsoleError && state.error.status === 401;
  return <div className={styles.balanceRead}>
    {state.data ? <p className={styles.balanceAmount} data-testid="wallet-balance"><AnimatedNumber value={formatUnits(BigInt(state.data.balanceAtomic), 18)} /> <span className={styles.unit}>USDC</span></p>
      : state.loading ? <div role="status" aria-label="Loading wallet balance..."><Skeleton className={styles.balanceSkeleton} /></div>
        : <div className={styles.balanceError} role="alert"><p>{expired ? "Sign in again to read your balance." : "Balance unavailable"}</p><p className="muted">{expired ? "Your workspace session has ended." : "The Arc network could not be reached. Your invoice records are unaffected."}</p></div>}
    <div className={styles.balanceActions}>
      <span className="muted" role="status">{state.loading ? "Reading Arc balance..." : state.data ? <>Updated <time dateTime={state.data.updatedAt}>{new Date(state.data.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</time></> : "No balance has been assumed."}</span>
      {expired ? <Link className="text-link" href="/login">Sign in again</Link> : <button className={styles.refresh} disabled={state.loading} onClick={() => setAttempt((value) => value + 1)} aria-label="Refresh wallet balance">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.7-.9L20 9M4 15l2.2 2.9A7 7 0 0 0 17.9 17" /></svg>
        Refresh
      </button>}
    </div>
  </div>;
}
