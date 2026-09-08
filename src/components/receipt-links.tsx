"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import type { InvoiceStatusResult } from "../lib/domain/status";
import { consoleApi } from "./console-api";

type Props = { invoiceId: string; version: number; ready: boolean; pdfContentHash: string | null };
export function ReceiptLinks(props: Props) {
  return <Controls key={`${props.invoiceId}:${props.version}:${props.ready}:${props.pdfContentHash}`} {...props} />;
}
function Controls({ invoiceId, version, ready, pdfContentHash }: Props) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [links, setLinks] = useState<{ page: string; pdf: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  function clear() { request.current?.abort(); request.current = null; setLinks(null); setBusy(false); setMessage(""); }
  useEffect(() => {
    const hide = () => { request.current?.abort(); request.current = null; flushSync(() => { setLinks(null); setBusy(false); setMessage(""); }); };
    window.addEventListener("pagehide", hide);
    return () => { window.removeEventListener("pagehide", hide); request.current?.abort(); request.current = null; };
  }, []);
  async function reveal() {
    if (!ready || request.current || refreshing) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setMessage("");
    const timeout = setTimeout(() => { controller.abort(); if (request.current === controller) { request.current = null; setBusy(false); setMessage("Receipt links could not load. Refresh or try again."); } }, 20_000);
    try {
      const data = await consoleApi<InvoiceStatusResult>(`/api/invoices/${invoiceId}/status`, undefined, controller.signal);
      if (data.schemaVersion !== "payr.invoice-status.v1" || data.invoiceId !== invoiceId || data.invoiceVersion !== version
        || data.receipt.state !== "ready" || data.receipt.pdfContentHash !== pdfContentHash || !data.receipt.pageUrl
        || data.receipt.pdfUrl !== `${data.receipt.pageUrl}/pdf`) throw new Error();
      const url = new URL(data.receipt.pageUrl);
      if (url.origin !== window.location.origin || url.search || url.hash || url.username || url.password
        || url.href !== data.receipt.pageUrl || !/^\/receipt\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error();
      if (!controller.signal.aborted) setLinks({ page: data.receipt.pageUrl, pdf: data.receipt.pdfUrl });
    } catch { if (!controller.signal.aborted) setMessage("Receipt links could not load. Refresh or try again."); }
    finally { clearTimeout(timeout); if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  async function copy() {
    if (!links || request.current || refreshing) return;
    const controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      await navigator.clipboard.writeText(links.page);
      if (!controller.signal.aborted) {
        flushSync(() => { setLinks(null); setBusy(false); setMessage("Copied. Links are hidden here; your clipboard still contains the receipt link."); });
        button.current?.focus();
      }
    } catch { if (!controller.signal.aborted) setMessage("Copy was blocked. Select and copy the link manually, then hide it."); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  return <div className="publication-actions">
    {ready && <button ref={button} type="button" className="button" disabled={busy || refreshing} onClick={reveal}>{busy ? "Getting receipt links..." : "Show receipt links"}</button>}
    {links && <div className="publication-links"><p>These links grant access to the receipt. Nothing is sent by showing them.</p>
      <p><a href={links.page} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open receipt</a></p>
      <p><a href={links.pdf} referrerPolicy="no-referrer">Download receipt PDF</a></p>
      <p className="technical">{links.page}</p><div className="actions">
        <button type="button" className="button secondary" disabled={busy || refreshing} onClick={copy}>Copy receipt link and hide</button>
        <button type="button" className="button secondary" onClick={() => { flushSync(clear); button.current?.focus(); }}>Hide receipt links</button>
      </div></div>}
    <p role="status" aria-live="polite">{message}</p>
    <button type="button" className="button secondary" disabled={busy || refreshing} onClick={() => { clear(); startTransition(() => router.refresh()); }}>Refresh receipt status</button>
  </div>;
}
