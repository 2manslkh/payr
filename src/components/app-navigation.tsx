"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useState } from "react";
import type { IdentitySession } from "../lib/identity/contracts";
import { consoleApi } from "./console-api";
import { RequestError } from "./console-ui";
import { PayrWordmark } from "./payr-wordmark";

const IdentityContext = createContext<IdentitySession | null>(null);
export function ConsoleIdentity({
  session,
  children,
}: {
  session: IdentitySession;
  children: React.ReactNode;
}) {
  return <IdentityContext value={session}>{children}</IdentityContext>;
}
export function useConsoleIdentity() {
  const session = use(IdentityContext);
  if (!session) throw new Error("Console identity is required");
  return session;
}

const destinations = [
  { label: "Overview", href: "/app", path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { label: "Invoices", href: "/app/invoices", path: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" },
  {
    label: "Clients",
    href: "/app/clients",
    path: "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M5 21v-3a7 7 0 0 1 14 0v3",
  },
  { label: "Activity", href: "/app/activity", path: "M4 5h16M4 12h10M4 19h16M18 10l3 2-3 2" },
  {
    label: "Connections",
    href: "/app/connections",
    path: "M9 15l6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  },
  { label: "Settings", href: "/app/settings", path: "M4 6h16M4 12h16M4 18h16M9 3v6M15 9v6M9 15v6" },
];

export function AppNavigation() {
  const pathname = usePathname();
  const session = useConsoleIdentity();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await consoleApi<{ ok: true }>("/api/auth/logout", {});
      window.location.replace("/login");
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  function navLink(item: (typeof destinations)[number]) {
    const active = item.href === "/app" ? pathname === item.href : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={item.path} />
        </svg>
        <span>{item.label}</span>
      </Link>
    );
  }
  return (
    <>
      <aside className="workspace-rail">
        <Link href="/app" className="rail-brand" aria-label="Payr overview">
          <PayrWordmark />
        </Link>
        <nav aria-label="Workspace" className="rail-nav">
          {destinations.map(navLink)}
        </nav>
        <div className="rail-footer">
          <span>Arc testnet</span>
          <p>Workspace console</p>
        </div>
      </aside>
      <header className="workspace-topbar">
        <Link href="/app" className="mobile-brand" aria-label="Payr overview">
          <PayrWordmark />
        </Link>
        <span className="topbar-label">
          Workspace console <span className="muted">/ Arc testnet</span>
        </span>
        <div
          className="account"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              event.currentTarget.querySelector("button")?.focus();
            }
          }}
        >
          <button
            className="button secondary"
            aria-expanded={open}
            aria-controls="account-panel"
            onClick={() => setOpen(!open)}
          >
            Account
          </button>
          {open && (
            <div id="account-panel" className="account-panel">
              <p>Workspace owner</p>
              <code className="wallet-address">{session.ownerWallet}</code>
              <nav aria-label="Account">{destinations.slice(4).map(navLink)}</nav>
              <button className="button secondary" disabled={busy} onClick={logout}>
                {busy ? "Signing out..." : "Sign out"}
              </button>
              <p className="muted">Sign out removes this browser&apos;s session only.</p>
              <RequestError error={error} />
            </div>
          )}
        </div>
      </header>
      <nav className="bottom-nav" aria-label="Mobile workspace">
        {destinations.slice(0, 4).map(navLink)}
      </nav>
    </>
  );
}
