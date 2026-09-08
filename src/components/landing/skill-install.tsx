"use client";

import { useId, useState } from "react";
import Link from "next/link";
import styles from "./skill-install.module.css";

const managers = [
  { name: "npm", runner: "npx" },
  { name: "pnpm", runner: "pnpm dlx" },
  { name: "bun", runner: "bunx" },
];

export function SkillInstall() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const command = `${managers[selected].runner} skills add 2manslkh/payr --skill payr-create-invoice`;

  return (
    <section className={styles.install} aria-label="Install the Payr skill">
      <div className={styles.terminal}>
        <div className={styles.toolbar}>
          <div role="tablist" aria-label="Package manager" className={styles.tabs}>
            {managers.map((manager, index) => (
              <button key={manager.name} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
                disabled={copyState === "copying"}
                onClick={() => { setSelected(index); setCopyState("idle"); }}
                onKeyDown={(event) => {
                  const next = event.key === "ArrowRight" ? (index + 1) % managers.length
                    : event.key === "ArrowLeft" ? (index + managers.length - 1) % managers.length
                    : event.key === "Home" ? 0 : event.key === "End" ? managers.length - 1 : null;
                  if (next === null) return;
                  event.preventDefault();
                  setSelected(next);
                  setCopyState("idle");
                  document.getElementById(`${id}-tab-${next}`)?.focus();
                }}>
                {manager.name}
              </button>
            ))}
          </div>
          <button className={styles.copy} type="button" aria-label="Copy installation command" disabled={copyState === "copying"} onClick={async () => {
            setCopyState("copying");
            try {
              await navigator.clipboard.writeText(command);
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
          <code><span>{managers[selected].runner}</span>{" skills add "}<span className={styles.source}>2manslkh/payr</span>{" --skill payr-create-invoice"}</code>
        </div>
      </div>
      <p className={styles.note}>Install Payr in any agent <Link href="/app/connections">Connect Payr tools separately.</Link></p>
      <span role="status" className={copyState === "error" ? styles.error : "sr-only"}>{copyState === "copied" ? "Installation command copied." : copyState === "error" ? "Couldn't copy. Select and copy the command above." : ""}</span>
    </section>
  );
}
