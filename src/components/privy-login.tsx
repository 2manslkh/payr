"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import type { NonceResponse } from "../lib/identity/contracts";
import type { PrivyAccount } from "../lib/privy/contracts";
import { ConsoleError, consoleApi } from "./console-api";
import { RequestError } from "./console-ui";
import { connectWallet, signWalletMessage } from "./wallet";
import { PayrPrivyProvider } from "./privy-provider";

async function request<T>(token: string | null, input: unknown): Promise<T> {
  if (!token) throw new ConsoleError("AUTH_REQUIRED", 401);
  const response = await fetch("/api/auth/privy", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
  const data = await response.json();
  if (!response.ok) throw new ConsoleError(data?.error?.code ?? "REQUEST_FAILED", response.status);
  return data as T;
}

export function PrivyLoginButton() {
  const { ready, authenticated, login } = usePrivy();
  return <button className="button" disabled={!ready || authenticated} onClick={() => login()}>Login</button>;
}

function openWorkspace() {
  const path = window.location.pathname;
  const isInvoice = /^\/app\/invoices\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path);
  window.location.replace(isInvoice ? path : "/app");
}

function Login() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const userId = user?.id;
  const [account, setAccount] = useState<PrivyAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState("");
  const [newBusiness, setNewBusiness] = useState(false);
  const [initializationTimedOut, setInitializationTimedOut] = useState(false);
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setInitializationTimedOut(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const accept = (result: PrivyAccount) => {
    if (result.session && new URLSearchParams(window.location.search).get("link") !== "1") openWorkspace();
    else setAccount(result);
  };
  useEffect(() => {
    if (!ready || !authenticated || !userId || attempted.current === userId) return;
    attempted.current = userId;
    let active = true;
    void (async () => {
      setBusy(true);
      setStatus("Preparing your owner-controlled wallet...");
      try {
        const result = await request<PrivyAccount>(await getAccessToken(), { action: "signin" });
        if (active) accept(result);
      } catch (failure) { if (active) setError(failure); }
      finally { if (active) { setBusy(false); setStatus(""); } }
    })();
    return () => { active = false; attempted.current = null; };
  }, [ready, authenticated, userId, getAccessToken]);

  async function act(action: "signin" | "create_workspace" | "link_workspace") {
    setBusy(true); setError(null);
    try {
      const token = await getAccessToken();
      if (action === "link_workspace") {
        setStatus("Select the original workspace owner wallet.");
        const connection = await connectWallet();
        const nonce = await request<NonceResponse>(token, { action: "link_challenge", wallet: connection.wallet });
        setStatus("Review the identity-linking message. No funds or payout addresses will change.");
        const signature = await signWalletMessage(connection, nonce.message);
        const result = await request<PrivyAccount>(token, { action, nonceId: nonce.nonceId, signature });
        if (result.session) openWorkspace();
      } else accept(await request<PrivyAccount>(token, { action }));
    } catch (failure) { setError(failure); }
    finally { setBusy(false); setStatus(""); }
  }
  return <div className="login-action">
    {!authenticated && <button className="button" disabled={!ready} onClick={() => login()}>{ready ? "Login" : "Loading secure sign-in..."}</button>}
    {!ready && initializationTimedOut && <div role="alert">
      <p>Privy could not finish loading. Check your connection or content blocker, then reload to try again. No workspace has been changed.</p>
      <button className="button secondary" onClick={() => window.location.reload()}>Reload sign-in</button>
    </div>}
    {authenticated && !account && <button className="button" disabled={busy} onClick={() => act("signin")}>
      {busy ? "Preparing your wallet..." : "Retry wallet setup"}</button>}
    {authenticated && account && <>
      <h2>Your receiving wallet is ready</h2>
      <code className="wallet-address">{account.wallet.address}</code>
      <p>You control this wallet. Your agent can discover the address, but cannot sign or spend.</p>
      {!account.session && <label className="check-field"><input type="checkbox" checked={newBusiness} disabled={busy}
        onChange={(event) => setNewBusiness(event.target.checked)} /><span>I am setting up a new business, not recovering an existing PAYR workspace.</span></label>}
      <div className="actions">
        {!account.session && <button className="button" disabled={busy || !newBusiness} onClick={() => act("create_workspace")}>Create new workspace</button>}
        <button className="button secondary" disabled={busy} onClick={() => act("link_workspace")}>Link existing workspace</button>
      </div>
      <p>Already have invoices in PAYR? Choose Link existing workspace, not Create new workspace. A new workspace starts empty and uses this wallet for payouts. Linking preserves your existing invoices, payout address, and agent connections. Linking requires your original Ethereum owner wallet; smart-account signatures are not supported.</p>
      <p>Each Privy account links to one workspace. Changing that link later requires operator-assisted recovery; PAYR never merges or replaces your workspace automatically.</p>
    </>}
    {authenticated && <button className="button secondary" disabled={busy} onClick={async () => {
      try { await consoleApi("/api/auth/logout", {}); await logout(); window.location.replace("/app"); } catch (failure) { setError(failure); }
    }}>Use a different account</button>}
    <p role="status" aria-live="polite">{status}</p>
    <RequestError error={error} />
  </div>;
}

export function PrivyLoginContent({ configured }: { configured: boolean }) {
  if (!configured) return <><button className="button" disabled>Login</button><p role="status">Sign-in is not configured. Contact the PAYR operator to enable Privy.</p></>;
  return <Login />;
}

export function PrivyLogin({ appId }: { appId?: string }) {
  if (!appId) return <PrivyLoginContent configured={false} />;
  return <PayrPrivyProvider appId={appId}><Login /></PayrPrivyProvider>;
}
