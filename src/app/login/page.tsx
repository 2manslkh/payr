import type { Metadata } from "next";
import Link from "next/link";
import { PayrWordmark } from "../../components/payr-wordmark";
import { WalletLogin } from "../../components/wallet-login";

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
          Your wallet.
          <br />
          Your workspace.
        </h1>
        <p>Sign in to manage your sender profile, clients, and agent connections.</p>
        <WalletLogin />
        <section className="ruled-section">
          <h2>A signature, not a payment</h2>
          <p>
            Your first sign-in creates a workspace owned by this wallet. It also becomes your initial payout
            address. Changing that address later requires a new owner signature.
          </p>
          <p>Invoice publication and the Claude MCP connection are not available yet.</p>
        </section>
        <Link className="text-link" href="/">
          Back to Payr
        </Link>
      </main>
    </div>
  );
}
