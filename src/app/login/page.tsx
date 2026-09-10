import type { Metadata } from "next";
import Link from "next/link";
import { PayrWordmark } from "../../components/payr-wordmark";
import { PrivyLogin } from "../../components/privy-login";

export const metadata: Metadata = { title: "Sign in | Payr", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Link href="/" aria-label="Payr home">
          <PayrWordmark />
        </Link>
        <span>Arc testnet</span>
      </header>
      <main id="main-content" className="login-page">
        <h1>
          Your business.
          <br />
          Your workspace.
        </h1>
        <p>Sign in to manage your sender profile, clients, and agent connections.</p>
        <PrivyLogin appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID} />
        <noscript>Enable JavaScript to sign in securely through Privy.</noscript>
        <section className="ruled-section">
          <h2>A wallet, ready for your business</h2>
          <p>
            Sign-in provisions a wallet you control. Your agent can read its address with your permission,
            but cannot control it. New workspaces use it as their default invoice payout address.
          </p>
          <p>After signing in, set up your sender profile and connect Claude from Connections. Publishing an invoice requires your explicit approval.</p>
          <p>Already use Payr? Link your existing workspace after signing in to retain invoices and agent connections. Testnet funds only.</p>
        </section>
        <Link className="text-link" href="/">
          Back to Payr
        </Link>
      </main>
    </div>
  );
}
