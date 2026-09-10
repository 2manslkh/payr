"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { PAYR_GATEWAY_URL as gatewayUrl, PAYR_GATEWAY_MCP_URL as mcpUrl } from "../../lib/payr-connection";
import styles from "./skill-install.module.css";

const mcpConfig = JSON.stringify({ mcpServers: { payr: { url: mcpUrl } } }, null, 2);
const clients = [
  {
    name: "Claude / Cowork",
    snippet: mcpUrl,
    instruction: "In Claude, open Customize > Connectors > Add custom connector. Name it Payr and paste this server URL. In Cowork, open the Cowork tab first. Workspace authentication is a separate step; this URL only adds the server.",
  },
  {
    name: "Claude Code",
    snippet: `claude mcp add --transport http payr ${mcpUrl}`,
    instruction: "Run this command in your terminal with Claude Code installed.",
  },
  {
    name: "Cursor",
    snippet: mcpConfig,
    instruction: "Add this server to .cursor/mcp.json, keeping any existing servers.",
  },
  {
    name: "ChatGPT / Codex",
    snippet: `codex mcp add payr --url ${mcpUrl}`,
    instruction: `Run this command in Codex CLI. For ChatGPT, use ${mcpUrl} in its custom MCP connector settings, where supported.`,
  },
  {
    name: "Custom MCP",
    snippet: mcpConfig,
    instruction: "Add this configuration to an MCP client that supports remote HTTP servers, keeping any existing servers.",
  },
  {
    name: "CLI",
    snippet: `baz curl ${gatewayUrl} --account wallet --json`,
    instruction: "Run with the Bazantic CLI installed and an account named wallet configured.",
  },
];

export function SkillInstall({ heading = "Connect Payr", showGuideLink = true }: { heading?: string; showGuideLink?: boolean }) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const client = clients[selected];

  return (
    <section className={styles.install} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={styles.heading}>{heading}</h2>
      <div className={styles.terminal}>
        <div role="tablist" aria-label="Agent or client" className={styles.tabs}>
          {clients.map((client, index) => (
            <button key={client.name} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
              disabled={copyState === "copying"}
              onClick={() => { setSelected(index); setCopyState("idle"); }}
              onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % clients.length
                  : event.key === "ArrowLeft" ? (index + clients.length - 1) % clients.length
                  : event.key === "Home" ? 0 : event.key === "End" ? clients.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                setSelected(next);
                setCopyState("idle");
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }}>
              {client.name}
            </button>
          ))}
        </div>
        <div className={styles.toolbar}>
          <span>Payr</span>
          <button className={styles.copy} type="button" aria-label="Copy setup snippet" disabled={copyState === "copying"} onClick={async () => {
            setCopyState("copying");
            try {
              await navigator.clipboard.writeText(client.snippet);
              setCopyState("copied");
            } catch {
              setCopyState("error");
            }
          }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
            {copyState === "copied" ? "Copied" : "Copy"}
          </button>
        </div>
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0} className={styles.command}>
          <pre><code>{client.snippet}</code></pre>
          <p className={styles.instruction}>{client.instruction}</p>
        </div>
      </div>
      <p className={styles.note}>No plugin required. Add the server, then configure and verify workspace access. Private gateway authentication still needs operator setup.<br />
        {showGuideLink && <><Link href="/install">Workspace setup and connection guide</Link><br /></>}
        Powered by <a href="https://bazantic.com">Bazantic</a>.</p>
      <span role="status" className={copyState === "error" ? styles.error : "sr-only"}>{copyState === "copied" ? "Setup snippet copied." : copyState === "error" ? "Couldn't copy. Select and copy the snippet above." : ""}</span>
    </section>
  );
}
