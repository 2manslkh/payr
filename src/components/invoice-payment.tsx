"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { formatUnits, type Hex } from "viem";
import { useAccount, useConfig, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { PaymentError, validatePaymentStatus, type PaymentSetup, type PaymentStatusView } from "../lib/payments/payment-contracts";
import { payInvoice } from "../lib/payments/pay";
import { createBrowserPaymentAdapter, watchPaymentReplacement } from "../lib/payments/browser-payment";
import styles from "./invoice-payment.module.css";

const PaymentWalletProvider = dynamic(() => import("./payment-wallet-provider").then((module) => module.PaymentWalletProvider), {
  ssr: false, loading: () => <p role="status">Loading secure wallet controls...</p>,
});
type Props = { setup: PaymentSetup; invoiceUrl: string; initialStatus: PaymentStatusView };
function subscribeStorage(changed: () => void) {
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
}
function storedTransaction(key: string): Hex | null {
  try { const hash = sessionStorage.getItem(key); return hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash as Hex : null; }
  catch { return null; }
}
export function InvoicePayment(props: Props) {
  return <PaymentWalletProvider settings={props.setup}><PaymentControls {...props} /></PaymentWalletProvider>;
}

function PaymentControls({ setup, invoiceUrl, initialStatus }: Props) {
  const account = useAccount(), config = useConfig();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState(initialStatus);
  const observedSettlement = useRef(initialStatus.settlement !== null);
  const [phase, setPhase] = useState<"idle" | "authorizing" | "submitted" | "syncing">("idle");
  const [submittedHash, setTransactionHash] = useState<Hex | null>(null);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectionDismissed, setConnectionDismissed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cancelledHash, setCancelledHash] = useState<Hex | null>(null);
  const [review, setReview] = useState<{ validUntil: number; gasReserve: bigint } | null>(null);
  const [qr, setQr] = useState<{ uri: string; image: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [pollingStopped, setPollingStopped] = useState(false);
  const busy = useRef(false), connectorAttempt = useRef(0);
  const activeConnection = useRef<Connector | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const storageKey = `payr:payment:${setup.invoiceKey}`;
  const restoredHash = useSyncExternalStore(subscribeStorage, () => storedTransaction(storageKey), () => null);
  const transactionHash = submittedHash ?? restoredHash;
  const storedCancellation = useSyncExternalStore(subscribeStorage, () => storedTransaction(`${storageKey}:cancelled`), () => null);
  const knownCancellation = cancelledHash ?? storedCancellation;
  const paid = status.paymentStatus === "paid" && status.settlement !== null;
  const canPay = !paid && status.commercialState === "published";

  useEffect(() => {
    if (qr) dialog.current?.showModal();
    else dialog.current?.close();
  }, [qr]);

  useEffect(() => {
    if (!transactionHash || paid) return;
    let active = true;
    const controller = new AbortController();
    void watchPaymentReplacement(setup, transactionHash, controller.signal, (hash, cancelled) => {
      if (!active) return;
      try {
        sessionStorage.setItem(storageKey, hash);
        if (cancelled) sessionStorage.setItem(`${storageKey}:cancelled`, hash);
      } catch { /* Server recovery remains available. */ }
      if (cancelled) setCancelledHash(hash);
      setTransactionHash(hash);
    }, () => { if (active) setPhase("syncing"); }).catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [transactionHash, setup, storageKey, retry, paid]);

  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined, attempts = 0;
    const controller = new AbortController();
    async function poll() {
      try {
        if (transactionHash && !observedSettlement.current) {
          try {
            const response = await fetch("/api/reconcile/transaction", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transactionHash }), cache: "no-store", referrerPolicy: "no-referrer",
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
            if (response.ok) {
              const result = await response.json();
              if (!cancelled && result.outcome === "verified") setPhase("syncing");
              if (!cancelled && result.outcome === "invalid" && (result.reason === "reverted" || knownCancellation === transactionHash)) {
                setFailed(true);
                setError(result.reason === "reverted" ? "The transaction reverted and did not pay this invoice. Gas may have been spent."
                  : "Your wallet replacement was confirmed. This transaction did not pay the invoice.");
              }
            }
          } catch { /* Backfill may already have settled the invoice; status remains independent. */ }
        }
        if (cancelled) return;
        const response = await fetch(`${invoiceUrl}/status`, { cache: "no-store", referrerPolicy: "no-referrer",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
        if (!response.ok) throw new Error();
        const next = validatePaymentStatus(await response.json(), setup);
        if (cancelled) return;
        // A stale read must not erase already observed immutable settlement.
        if (observedSettlement.current && !next.settlement) throw new Error();
        setStatus(next);
        if (next.settlement) {
          observedSettlement.current = true;
          setError("");
          try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(`${storageKey}:cancelled`); } catch { /* Optional recovery storage. */ }
          if (["ready", "failed"].includes(next.receipt.state) && ["sent", "failed", "manual_review"].includes(next.receiptEmailState)) return;
        }
      } catch {
        if (!cancelled) setError("Status is temporarily unavailable. Do not send again; check payment status or inspect your wallet activity.");
      }
      if (!cancelled && ++attempts < 12) timer = setTimeout(poll, Math.min(3000 * 2 ** attempts, 30000));
      else if (!cancelled) setPollingStopped(true);
    }
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [invoiceUrl, setup, transactionHash, retry, storageKey, knownCancellation, initialStatus]);

  async function connect(connector: Connector | undefined) {
    if (activeConnection.current || !connector) { if (!connector) setError("No browser wallet detected. Use WalletConnect or install a compatible wallet."); return; }
    activeConnection.current = connector;
    const attempt = ++connectorAttempt.current;
    setConnecting(true); setConnectionDismissed(false); setError("");
    const onMessage = async (message: { type: string; data?: unknown }) => {
      if (connectorAttempt.current !== attempt || message.type !== "display_uri" || typeof message.data !== "string" || !message.data.startsWith("wc:") || message.data.length > 4096) return;
      const uri = message.data;
      try {
        const image = await (await import("qrcode")).toDataURL(uri, { width: 256, margin: 2, errorCorrectionLevel: "M" });
        if (connectorAttempt.current === attempt) setQr({ uri, image });
      } catch { if (connectorAttempt.current === attempt) setError("Could not display the wallet connection QR. Close the wallet request and try again."); }
    };
    connector.emitter.on("message", onMessage);
    try {
      await connectAsync({ connector });
      if (connectorAttempt.current !== attempt) {
        await disconnectAsync({ connector });
        setConnectionDismissed(false);
      }
    } catch {
      if (connectorAttempt.current === attempt) setError("Wallet connection was not completed. You can try again or choose another wallet.");
      else setError("A dismissed wallet request may still be connected. Disconnect the wallet before paying.");
    } finally {
      connector.emitter.off("message", onMessage);
      if (connectorAttempt.current === attempt) connectorAttempt.current++;
      activeConnection.current = null;
      setQr(null); setConnecting(false);
    }
  }

  function cancelConnection() {
    connectorAttempt.current++;
    setQr(null); setConnectionDismissed(true);
    // SDK abortPairingAttempt is a no-op: lock until it settles and disconnect late approval.
    setError("Connection dismissed. Reject or close the pending request in your wallet before trying again.");
  }

  async function pay() {
    if (busy.current || activeConnection.current || connectionDismissed || !canPay || !account.isConnected || account.chainId !== 5042002 || transactionHash) return;
    if (Date.now() >= Date.parse(setup.payableUntil)) { setError("The invoice payment deadline has passed. Refresh its status."); return; }
    busy.current = true; setError(""); setPhase("authorizing"); setReview(null);
    try {
      const hash = await payInvoice(setup, createBrowserPaymentAdapter(config, setup, invoiceUrl), setReview);
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error();
      try { sessionStorage.setItem(storageKey, hash); } catch { /* Backfill also recovers a lost browser callback. */ }
      setTransactionHash(hash); setPhase("submitted");
    } catch (cause) {
      const errors: Record<string, string> = {
        WRONG_NETWORK: "Switch your wallet to Arc Testnet before paying.", INSUFFICIENT_BALANCE: "Add enough Arc testnet USDC for this invoice plus gas.",
        AUTHORIZATION_INVALID: "Payment authorization was unavailable or invalid. Refresh the invoice before trying again.",
        AUTHORIZATION_EXPIRED: "Payment authorization expired. No transaction was requested; try again for a fresh authorization.",
        WALLET_CHANGED: "Your wallet or network changed. Review the selected account and try again.",
      };
      setError(cause instanceof PaymentError && errors[cause.code] ? errors[cause.code]
        : "No payment has been verified. If you approved a transaction, check your wallet activity before trying again.");
      setPhase("idle");
    } finally { busy.current = false; }
  }

  return <div className={styles.payment}>
    <dl className={styles.states}><div><dt>Commercial state</dt><dd>{status.commercialState[0].toUpperCase() + status.commercialState.slice(1)}</dd></div>
      <div><dt>Payment status</dt><dd className={paid ? styles.paid : undefined}>{paid ? "Paid" : "Unpaid"}</dd></div></dl>
    {paid ? <div className={styles.proof} role="status"><h3>Payment verified</h3><p>Your invoice payment is recorded on Arc Testnet.</p>
      <a href={`https://testnet.arcscan.app/tx/${status.settlement!.transactionHash}`} target="_blank" rel="noopener noreferrer">View settlement on Arcscan</a>
      {status.settledAfterVoid && <p>This payment settled after the invoice was voided.</p>}
      <h3>Receipt progress</h3>
      <p>{({ not_applicable: "Receipt not available.", pending: "Receipt queued.", rendering: "Receipt is being generated.", retry_wait: "Receipt generation will retry.", failed: "Receipt generation needs attention.", ready: "Verified receipt available." })[status.receipt.state]}</p>
      {status.receipt.state === "ready" && status.receipt.pageUrl && <a href={status.receipt.pageUrl} referrerPolicy="no-referrer">View receipt</a>}
      <p>Email status: {status.receiptEmailState === "sent" ? "Accepted by email provider, not confirmation of inbox delivery" : status.receiptEmailState.replaceAll("_", " ")}</p>
    </div> : <>
      <p className={styles.explanation}>Pay exact native USDC through Payr on <strong>Arc Testnet</strong>. Your wallet controls the transaction. Gas is separate.</p>
      {!canPay && <p role="status">This invoice is not currently payable.</p>}
      {canPay && !account.isConnected && <div className={styles.connections}>
        <button type="button" disabled={connecting || !connectors.some((c) => c.id !== "walletConnect")} onClick={() => void connect(connectors.find((c) => c.id !== "walletConnect"))}>Connect browser wallet</button>
        <button type="button" disabled={connecting || !connectors.some((c) => c.id === "walletConnect")} onClick={() => void connect(connectors.find((c) => c.id === "walletConnect"))}>WalletConnect</button>
        {connecting && <p role="status">Waiting for wallet connection...</p>}
      </div>}
      {account.isConnected && <div className={styles.account}><span>Connected wallet</span><code>{account.address}</code>
        <button type="button" disabled={phase === "authorizing"} onClick={() => void disconnectAsync().then(() => setConnectionDismissed(false)).catch(() => setError("Could not disconnect. Try again."))}>Disconnect</button></div>}
      {canPay && account.isConnected && account.chainId !== 5042002 && <button className={styles.secondary} type="button"
        onClick={() => void switchChainAsync({ chainId: 5042002 }).catch(() => setError("Network switch was not completed. Select Arc Testnet in your wallet."))}>Switch to Arc Testnet</button>}
      {review && <dl className={styles.cost}><div><dt>Authorization expires</dt><dd><time dateTime={new Date(review.validUntil * 1000).toISOString()}>{new Date(review.validUntil * 1000).toLocaleTimeString()}</time></dd></div>
        <div><dt>Estimated gas reserve</dt><dd>{formatUnits(review.gasReserve, 18)} USDC</dd></div></dl>}
      {canPay && !transactionHash && <button className={styles.pay} type="button" onClick={() => void pay()}
        disabled={connecting || connectionDismissed || !account.isConnected || account.chainId !== 5042002 || phase === "authorizing"}>
        {phase === "authorizing" ? "Review payment in your wallet..." : `Pay Invoice (${setup.amountDecimal} USDC)`}</button>}
      {transactionHash && <div className={styles.pending} role="status"><p>{failed ? "Transaction did not settle this invoice." : phase === "syncing" ? "Payment final; syncing receipt" : "Transaction submitted. Verifying payment..."}</p>
        <a href={`https://testnet.arcscan.app/tx/${transactionHash}`} target="_blank" rel="noopener noreferrer">View transaction on Arcscan</a>
        {failed && <button type="button" onClick={() => {
          try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(`${storageKey}:cancelled`); } catch { /* Optional storage. */ }
          setTransactionHash(null); setCancelledHash(null); setFailed(false); setError(""); setPhase("idle");
        }}>Review and retry payment</button>}</div>}
    </>}
    {pollingStopped && <p role="status">Automatic status checks paused. Check again for settlement, receipt, and email progress.</p>}
    <button type="button" className={styles.check} onClick={() => { setError(""); setPollingStopped(false); setRetry((n) => n + 1); }}>Check payment status</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="walletconnect-heading" onCancel={(event) => { event.preventDefault(); cancelConnection(); }}>
      <h3 id="walletconnect-heading">Connect your wallet</h3><p>Scan with a WalletConnect-compatible wallet, then approve the connection.</p>
      {/* Pairing credentials never leave this locally generated QR for an image service. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr.image} width={256} height={256} alt="WalletConnect pairing QR code" />}
      {qr && <a href={`https://metamask.app.link/wc?uri=${encodeURIComponent(qr.uri)}`} rel="noreferrer">Open in MetaMask mobile</a>}
      <p>Connection alone does not authorize payment.</p><button type="button" onClick={cancelConnection}>Cancel connection</button>
    </dialog>
  </div>;
}
