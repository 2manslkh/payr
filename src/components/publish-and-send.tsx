"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PublicationView, PublishedInvoiceResult } from "../lib/invoices/publication-contracts";
import { ConsoleError, consoleApi } from "./console-api";

export function PublishAndSend({ invoiceId, version, clientEmail, senderEmail, enabled, recovering = false, failedAttempt }: {
  invoiceId: string; version: number; clientEmail: string; senderEmail: string; enabled: boolean;
  recovering?: boolean;
  failedAttempt?: PublicationView["attempt"];
}) {
  const router = useRouter();
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [attempted, setAttempted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const key = useRef<string | null>(null);
  const storageKey = `payr:publish-and-send:${invoiceId}:${version}`;
  const stored = useSyncExternalStore((notify) => {
    window.addEventListener("storage", notify);
    return () => window.removeEventListener("storage", notify);
  }, () => {
    try { return sessionStorage.getItem(storageKey); } catch { return null; }
  }, () => null);
  const failedId = failedAttempt?.id;
  const failedVersion = failedAttempt?.invoiceVersion;
  let saved: { invoiceId: string; expectedVersion: number; approval: true; deliveryApproval: true; idempotencyKey: string; afterFailedAttemptId?: string } | null = null;
  try {
    const value = JSON.parse(stored ?? "null");
    if (value?.invoiceId === invoiceId && value.expectedVersion === version && value.approval === true && value.deliveryApproval === true
      && typeof value.idempotencyKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.idempotencyKey)
      && (value.afterFailedAttemptId === undefined ? Object.keys(value).length === 5
        : typeof value.afterFailedAttemptId === "string" && Object.keys(value).length === 6)
      && (failedVersion !== version || value.afterFailedAttemptId === failedId)) saved = value;
  } catch { /* Invalid or differently scoped browser data never supplies consent. */ }
  const resumable = saved !== null || attempted;
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!failedId || failedVersion === undefined) return;
    // Only retire consent for the confirmed failed revision. A replacement approved
    // after this failure must survive remounts while the server still shows old status.
    const failedStorageKey = `payr:publish-and-send:${invoiceId}:${failedVersion}`;
    try {
      const value = sessionStorage.getItem(failedStorageKey);
      if (value !== null && JSON.parse(value)?.afterFailedAttemptId !== failedId) {
        sessionStorage.removeItem(failedStorageKey);
        window.dispatchEvent(new Event("storage"));
      }
    } catch { /* Unreadable storage never supplies consent. */ }
  }, [invoiceId, failedId, failedVersion]);

  async function publish() {
    if ((!approved && !resumable) || (recovering && !resumable) || !enabled || request.current || refreshing || completed) return;
    key.current ??= saved?.idempotencyKey ?? crypto.randomUUID();
    // Persist only after the user's explicit send/resume click, before an uncertain HTTP write.
    // No email addresses, invoice contents, bearer URLs or credentials belong in browser storage.
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ invoiceId, expectedVersion: version, approval: true, deliveryApproval: true, idempotencyKey: key.current,
        ...((saved?.afterFailedAttemptId ?? failedId) ? { afterFailedAttemptId: saved?.afterFailedAttemptId ?? failedId } : {}),
      }));
      window.dispatchEvent(new Event("storage"));
    } catch {
      setError("This browser cannot retain the approved retry request. Enable session storage before publishing. No request was sent.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setAttempted(true); setError("");
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const result = await consoleApi<PublishedInvoiceResult>(`/api/invoices/${invoiceId}/publish`, {
        expectedVersion: version, approval: true, deliveryApproval: true, idempotencyKey: key.current,
      }, controller.signal);
      if (result.invoiceId !== invoiceId || result.invoiceVersion !== version || !result.invoiceEmail
        || result.invoiceEmail.state === "not_applicable") throw new ConsoleError("INVALID_RESPONSE");
      setCompleted(true);
      try { sessionStorage.removeItem(storageKey); window.dispatchEvent(new Event("storage")); } catch { /* A stale scoped key cannot authorize a new version. */ }
      startTransition(() => router.refresh());
    } catch (cause) {
      const code = cause instanceof ConsoleError ? cause.code : "";
      setError(code === "INVOICE_EMAIL_DISABLED" || code === "CONFIGURATION_ERROR"
        ? "Publish & Send is unavailable because email is not configured. No new publication was started by this request."
        : ["VERSION_CONFLICT", "PROFILE_CONFLICT", "PUBLICATION_FAILED", "DRAFT_NOT_EDITABLE"].includes(code)
          ? "The reviewed record can no longer be published. Refresh and review the current version, defaults, and client changes before approving again."
          : "Publication could not be confirmed. Retry this same approved request, or refresh to check its status. Do not send a separate email.");
    } finally {
      window.clearTimeout(timeout); request.current = null; setBusy(false);
    }
  }

  return <section className="invoice-rail-section publication-actions" aria-labelledby="publish-send-heading">
    <h2 id="publish-send-heading">Publish &amp; Send</h2>
    {failedAttempt && <p>The previous publication attempt for version {failedAttempt.invoiceVersion} failed and remains in history. A fresh approval uses a new request key and invoice number.</p>}
    <p>Version {version} becomes an immutable invoice. Payr emails the PDF and private invoice links to:</p>
    <dl className="invoice-facts"><dt>Client</dt><dd className="invoice-source">{clientEmail}</dd>
      <dt>Sender copy</dt><dd className="invoice-source">{senderEmail}</dd></dl>
    <p>One message per distinct address. Email acceptance is not proof of inbox delivery or payment.</p>
    {!enabled && <p className="attention">Invoice email is disabled or not configured. Publish &amp; Send is unavailable.</p>}
    {recovering && !resumable && <p role="status">Publication is recovering. This tab has no matching approved request to resume. Email-approved attempts are recovered automatically; refresh to check progress. If recovery remains blocked, return to the original approving tab or ask the operator to review it. Do not create a new approval or send a separate email.</p>}
    {!completed && (!recovering || resumable) && <>
      {!resumable && <label className="publication-approval"><input type="checkbox" checked={approved} disabled={busy || refreshing || !enabled}
        onChange={(event) => setApproved(event.target.checked)} />
        <span>I reviewed version {version}, all facts and applied defaults, the pending client-profile changes, and both email addresses. I approve publication and sending.</span></label>}
      {resumable && <p>Resume the exact previously approved version {version} request with its original key. This is not a new approval.</p>}
      <button type="button" className="button" disabled={(!approved && !resumable) || !enabled || busy || refreshing} onClick={publish}>
        {busy ? "Publishing..." : recovering || saved && !attempted ? "Resume Publish & Send" : attempted ? "Retry Publish & Send" : "Publish & Send"}
      </button>
    </>}
    {completed && <p role="status">Published. Invoice email is queued or processing; check the delivery states below. Do not send a duplicate.</p>}
    {error && <p className="publication-error" role="alert">{error}</p>}
  </section>;
}
