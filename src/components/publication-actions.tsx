"use client";

import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import type { PublicationFailure, PublicationState, PublicationView, SharedInvoiceLinks } from "../lib/invoices/publication-contracts";
import { ConsoleError, consoleApi } from "./console-api";

const stateLabels: Record<PublicationState, string> = {
  reserved: "Publication queued", rendering: "Preparing document", stored: "Document stored; finalization pending",
  finalized: "Publication finalized", failed: "Publication failed",
};
const failureMessages: Record<PublicationFailure, string> = {
  ARTIFACT_VERIFICATION_FAILED: "Document verification failed. No shareable publication was created.",
  PROFILE_CONFLICT: "The sender profile changed before publication completed.",
  CLIENT_CONFLICT: "The client profile changed before publication completed.",
  AUTH_REVOKED: "The initiating authorization was revoked before publication completed.",
  DEADLINE_EXPIRED: "The technical payable deadline passed before publication completed.",
  VERSION_CONFLICT: "The invoice version changed before publication completed.",
};
type Props = PublicationView & { invoiceId: string; version: number };
type Action = "share" | "void" | "copy";
type VoidRequest = { invoiceId: string; version: number; key: string };

function actionError(error: unknown, action: Action): string {
  if (action === "copy") return "Copy was blocked. Select and copy the link manually, then hide the links.";
  const code = error instanceof ConsoleError ? error.code : null;
  const status = error instanceof ConsoleError ? error.status : 0;
  if (status === 401) return "Your session ended. Sign in again, then review the saved record before retrying.";
  if (status === 403) return "This session cannot perform that action. Reopen Payr at its configured address and sign in again.";
  if (code === "VERSION_CONFLICT") return "The invoice version changed. Refresh the record and review the exact version before approving again.";
  if (code === "INVOICE_NOT_VOIDABLE") return "This invoice is no longer voidable. Refresh the record to check its commercial and payment states.";
  if (status === 409 || status === 404) return "The saved record no longer permits this request. Refresh the record before trying again.";
  if (status === 429) return "Too many requests. Wait a minute, then retry the same request.";
  if (action === "share") return "Links are unavailable right now. Refresh the record or retry sharing shortly.";
  return "Payr could not confirm whether the void completed. Retry here with the same request, or refresh to check the authoritative record.";
}

export function PublicationActions(props: Props) {
  const voidRequestRef = useRef<VoidRequest | null>(null);
  // Reset private UI state when authoritative permissions/version change.
  return <PublicationControls key={`${props.invoiceId}:${props.version}:${props.state}:${props.failureCode}:${props.canShare}:${props.canVoid}`} {...props} voidRequestRef={voidRequestRef} />;
}

function PublicationControls({ invoiceId, version, state, failureCode, canShare, canVoid, voidRequestRef }: Props & { voidRequestRef: RefObject<VoidRequest | null> }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [links, setLinks] = useState<Pick<SharedInvoiceLinks, "invoiceUrl" | "invoicePdfUrl"> | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<{ action: Action; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [approved, setApproved] = useState(false);
  const [voidAttempted, setVoidAttempted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const request = useRef<AbortController | null>(null);
  const shareButton = useRef<HTMLButtonElement>(null);
  const voidButton = useRef<HTMLButtonElement>(null);
  const approvalInput = useRef<HTMLInputElement>(null);
  const blocked = busy !== null || refreshing;

  useEffect(() => {
    function clear() {
      request.current?.abort();
      request.current = null;
      // Clear the DOM before the browser can preserve it in the back/forward cache.
      flushSync(() => { setLinks(null); setBusy(null); setNotice(""); setError(null); });
    }
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("pagehide", clear);
      request.current?.abort();
      request.current = null;
      setLinks(null);
    };
  }, []);

  function refresh() {
    setLinks(null);
    setError(null);
    setNotice("Checking the authoritative record...");
    startTransition(() => router.refresh());
  }

  async function perform(action: Action, copyUrl?: string) {
    if (request.current || refreshing || (action === "void" && (!approved || !canVoid)) || (action === "share" && !canShare)) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(action);
    setError(null);
    setNotice("");
    if (action !== "copy") setLinks(null);
    if (action === "void") setVoidAttempted(true);
    const timeout = window.setTimeout(() => {
      controller.abort();
      request.current = null;
      setBusy(null);
      setError({ action, message: actionError(null, action) });
    }, 20_000);
    controller.signal.addEventListener("abort", () => window.clearTimeout(timeout), { once: true });
    try {
      if (action === "share") {
        const data = await consoleApi<SharedInvoiceLinks>(`/api/invoices/${invoiceId}/share`, {}, controller.signal);
        if (typeof data.invoiceUrl !== "string" || typeof data.invoicePdfUrl !== "string" || !data.invoiceUrl || !data.invoicePdfUrl) throw new ConsoleError("INVALID_RESPONSE");
        if (!controller.signal.aborted) setLinks({ invoiceUrl: data.invoiceUrl, invoicePdfUrl: data.invoicePdfUrl });
      } else if (action === "copy") {
        await navigator.clipboard.writeText(copyUrl!);
        if (!controller.signal.aborted) {
          flushSync(() => {
            setLinks(null);
            setBusy(null);
            setNotice("Copied to your clipboard. Links are hidden here; your clipboard still contains the copied link.");
          });
          shareButton.current?.focus();
        }
      } else {
        if (voidRequestRef.current?.invoiceId !== invoiceId || voidRequestRef.current.version !== version) {
          voidRequestRef.current = { invoiceId, version, key: crypto.randomUUID() };
        }
        await consoleApi(`/api/invoices/${invoiceId}/void`, { expectedVersion: version, approval: true, idempotencyKey: voidRequestRef.current.key }, controller.signal);
        if (!controller.signal.aborted) {
          setCompleted(true);
          setConfirming(false);
          refresh();
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError({ action, message: actionError(cause, action) });
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setBusy(null); }
    }
  }

  return (
    <section className="invoice-rail-section publication-actions" aria-labelledby="publication-heading">
      <h2 id="publication-heading">Publication</h2>
      <p className={state === "failed" ? "publication-error" : undefined}>{state ? stateLabels[state] : "Not published"}</p>
      {state === "failed" && <p className="publication-error">{failureCode ? failureMessages[failureCode] : "Publication did not complete."} Review the saved version before a new publication approval.</p>}
      {state && state !== "finalized" && state !== "failed" && <p>No links are available while publication is in progress. Refresh to check for an update.</p>}
      {canShare && <p className="muted">Protected payment pages and PDF downloads are not yet available in this release. A shared link is not evidence of document delivery.</p>}
      {canShare && !completed && !voidAttempted && <div className="actions">
        <button ref={shareButton} className="button" type="button" disabled={blocked || confirming} onClick={() => perform("share")}>{busy === "share" ? "Getting links..." : error?.action === "share" ? "Retry share" : "Share links"}</button>
      </div>}
      {links && <div className="publication-links">
        <p>These links grant access to invoice information. Share only with the intended recipient. Nothing is sent automatically.</p>
        <dl>
          <dt>Payment link</dt><dd>{links.invoiceUrl}</dd>
          <dt>Invoice PDF link</dt><dd>{links.invoicePdfUrl}</dd>
        </dl>
        <div className="actions">
          <button type="button" className="button secondary" disabled={blocked} onClick={() => perform("copy", links.invoiceUrl)}>Copy payment link and hide</button>
          <button type="button" className="button secondary" disabled={blocked} onClick={() => perform("copy", links.invoicePdfUrl)}>Copy PDF link and hide</button>
          <button type="button" className="button secondary" onClick={() => { setLinks(null); setError(null); shareButton.current?.focus(); }}>Hide links</button>
        </div>
      </div>}
      {canVoid && !completed && !confirming && <div className="actions">
        <button ref={voidButton} type="button" className="button secondary danger-text" disabled={blocked} onClick={() => {
          flushSync(() => { setConfirming(true); setApproved(false); setLinks(null); setError(null); setNotice(""); });
          approvalInput.current?.focus();
        }}>Void invoice</button>
      </div>}
      {canVoid && confirming && !completed && <div className="publication-confirmation">
        <h3>Void version {version}?</h3>
        <p>Invoice <span className="technical">{invoiceId}</span></p>
        <p>This revokes Payr invoice links and stops new Payr payment authorizations. The immutable invoice and its history remain.</p>
        <p id="void-chain-warning" className="attention">Separate transaction warning: voiding cannot revoke an already-issued on-chain payment authorization. A transaction using it may still settle, and verified settlement may later show Paid.</p>
        <label className="publication-approval">
          <input ref={approvalInput} type="checkbox" checked={approved} disabled={blocked || voidAttempted} aria-describedby="void-chain-warning" onChange={(event) => setApproved(event.target.checked)} />
          <span>I approve voiding version {version} of this invoice.</span>
        </label>
        <div className="actions">
          <button type="button" className="button danger" disabled={blocked || !approved} onClick={() => perform("void")}>{busy === "void" ? "Voiding..." : `${voidAttempted ? "Retry" : "Confirm"} void version ${version}`}</button>
          {!voidAttempted && <button type="button" className="button secondary" disabled={blocked} onClick={() => {
            flushSync(() => { setConfirming(false); setApproved(false); });
            voidButton.current?.focus();
          }}>Cancel void</button>}
        </div>
      </div>}
      {error && <p className="publication-error" role="alert">{error.message}</p>}
      <p role="status" aria-live="polite">{busy === "copy" ? "Copying link..." : notice}</p>
      {state !== null && <div className="actions"><button type="button" className="button secondary" disabled={blocked} onClick={refresh}>{refreshing ? "Refreshing..." : "Refresh record"}</button></div>}
    </section>
  );
}
