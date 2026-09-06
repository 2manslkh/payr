"use client";

import { useState } from "react";
import type { EmailContent } from "../../../lib/email/templates";
import { PayrWordmark } from "../../../components/payr-wordmark";
import styles from "./preview.module.css";

export function EmailPreview({ previews }: { previews: (EmailContent & { label: string })[] }) {
  const [selected, setSelected] = useState(0);
  const [width, setWidth] = useState("desktop");
  const [view, setView] = useState("html");
  const email = previews[selected];
  return <main className={styles.page}>
    <header className={styles.header}><PayrWordmark /><span>Development only</span></header>
    <h1>Email previews</h1>
    <p className={styles.description}>Invoice and settlement correspondence. Synthetic data only; nothing is sent. Preview links are inert.</p>
    <div className={styles.controls}>
      <label>Template<select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
        {previews.map((preview, index) => <option key={preview.label} value={index}>{preview.label}</option>)}
      </select></label>
      <label>Viewport<select value={width} onChange={(event) => setWidth(event.target.value)}>
        <option value="desktop">Desktop / 680 px</option><option value="mobile">Mobile / 375 px</option>
      </select></label>
      <label>Format<select value={view} onChange={(event) => setView(event.target.value)}>
        <option value="html">Rendered HTML</option><option value="text">Plain text</option><option value="source">HTML source</option>
      </select></label>
    </div>
    <dl className={styles.envelope}><div><dt>Subject</dt><dd>{email.subject}</dd></div><div><dt>Inbox preview</dt><dd>{email.previewText}</dd></div></dl>
    <section aria-label="Email content" className={styles.stage}>
      {view === "html" ? <iframe className={styles.frame} style={{ maxWidth: width === "mobile" ? 375 : 680 }}
        title={`${email.label} email preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={email.htmlBody} />
        : <pre className={styles.source}>{view === "text" ? email.textBody : email.htmlBody}</pre>}
    </section>
    <p className={styles.note}>Browser rendering is not an inbox compatibility test. Verify Gmail and Outlook before enabling delivery.</p>
  </main>;
}
