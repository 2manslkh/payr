"use client";

import { useRef, useState } from "react";
import { PAYR_CONNECTION_PROMPT } from "../lib/payr-connection";
import styles from "../app/install/page.module.css";

export function InstallPrompt() {
  const text = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function copy() {
    setBusy(true);
    setStatus("");
    try {
      await navigator.clipboard.writeText(PAYR_CONNECTION_PROMPT);
      setStatus("Setup prompt copied. Copying does not connect your workspace.");
    } catch {
      text.current?.focus();
      text.current?.select();
      setStatus("Clipboard access was blocked. The prompt is selected; copy it manually.");
    } finally {
      setBusy(false);
    }
  }
  return <section className={styles.prompt} aria-labelledby="prompt-heading">
    <div className={styles.promptHeader}>
      <h2 id="prompt-heading">Let your agent guide setup</h2>
      <p>This prompt contains only public setup instructions.</p>
    </div>
    <label className="sr-only" htmlFor="connection-prompt">Payr connection prompt</label>
    <textarea id="connection-prompt" ref={text} className={styles.promptText} value={PAYR_CONNECTION_PROMPT} readOnly spellCheck={false} />
    <div className={styles.promptFooter}>
      <button className="button" disabled={busy} onClick={copy}>{busy ? "Copying..." : "Copy setup prompt"}</button>
      <p>Your agent can guide the steps. Client settings and workspace authentication may need your action.</p>
    </div>
    <p className={styles.copyStatus} role="status" aria-live="polite">{status}</p>
  </section>;
}
