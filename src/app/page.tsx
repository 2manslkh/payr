import Link from "next/link";
import { PayrWordmark } from "../components/payr-wordmark";

export default function HomePage() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Link href="/" aria-label="Payr home">
          <PayrWordmark />
        </Link>
        <span>Arc testnet</span>
      </header>
      <main id="main-content" className="home-page">
        <h1>Invoice. Settle. Reconcile.</h1>
        <p>
          Payr helps independent developers turn confirmed work into an invoice, then reconcile verified USDC
          settlement into a linked receipt.
        </p>
        <p className="status">
          The invoice, payment, and settlement workflow is planned and not yet available.
        </p>
        <Link className="button" href="/login">
          Sign in to Payr
        </Link>
        <p className="muted">
          Set up your sender profile and clients while the invoice workflow is being built.
        </p>
      </main>
    </div>
  );
}
