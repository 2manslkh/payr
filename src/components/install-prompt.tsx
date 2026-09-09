"use client";

import { useRef, useState } from "react";
import styles from "../app/install/page.module.css";

export type PayrInstallation = { prompt: string; sourceUrl: string; supportedAgents: string[] };

export function InstallPrompt({ installation }: { installation: PayrInstallation | null }) {
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    if (!installation) return;
    try {
      await navigator.clipboard.writeText(installation.prompt);
      setCopied(true);
      setStatus("Installation prompt copied. Paste it into your supported AI agent.");
    } catch {
      setCopied(false);
      setStatus("Clipboard access was blocked. The prompt is selected; copy it manually.");
      text.current?.focus();
      text.current?.select();
    }
  }
  return <section className={styles.prompt} aria-labelledby="prompt-heading">
    <div className={styles.promptHeader}><h2 id="prompt-heading">Your installation prompt</h2><span>{installation ? "Ready to copy" : "Not available yet"}</span></div>
    {installation ? <>
      <label className="sr-only" htmlFor="installation-prompt">Payr installation prompt</label>
      <textarea id="installation-prompt" ref={text} className={styles.promptText} value={installation.prompt} readOnly spellCheck={false} />
      <p className={styles.source}>Supported agents: {installation.supportedAgents.join(", ")}. <a href={installation.sourceUrl} target="_blank" rel="noopener noreferrer">Official installation source</a></p>
    </> : <div className={styles.unavailable}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20" /></svg>
      <h3>The plugin is still being prepared.</h3>
      <p>Once Payr&apos;s official plugin is available, you&apos;ll find a verified installation prompt here. No package names or setup commands to guess.</p>
    </div>}
    <div className={styles.promptFooter}>
      <button className="button" disabled={!installation} onClick={copy}>{copied ? "Prompt copied" : "Copy installation prompt"}</button>
      <p>{installation ? "Review the agent's proposed changes before approving." : "Copy becomes available when installation is verified."}</p>
    </div>
    <p className={styles.copyStatus} role="status" aria-live="polite">{status}</p>
  </section>;
}
