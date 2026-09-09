import Link from "next/link";
import { PayrWordmark } from "../../components/payr-wordmark";
import { InstallPrompt } from "../../components/install-prompt";
import styles from "./page.module.css";

export const metadata = { title: "Install Payr", description: "Set up Payr in your AI agent with verified installation instructions.", alternates: { canonical: "/install" } };

export default function InstallPage() {
  return <div className="public-page">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="public-header">
      <Link href="/" aria-label="Payr home"><PayrWordmark /></Link>
      <Link className="text-link" href="/app">Open workspace</Link>
    </header>
    <main id="main-content" className={`${styles.page} content-reveal`}>
      <div className={styles.intro}>
        <h1>Install Payr in your agent.</h1>
        <p>One prompt to get set up. Your agent handles installation; you stay in control of access.</p>
      </div>
      {/* Plugin delivery is separate. Supply reviewed public metadata only after installation is verified. */}
      <InstallPrompt installation={null} />
      <section className={styles.steps} aria-labelledby="install-steps-heading">
        <h2 id="install-steps-heading">When installation is available</h2>
        <ol>
          <li><h3>Copy the prompt</h3><p>Use the verified instructions on this page. No credentials are included.</p></li>
          <li><h3>Paste into your agent</h3><p>Use a listed, supported agent. Review its proposed installation changes before approving.</p></li>
          <li><h3>Connect your workspace</h3><p>Complete authentication separately, then verify the connection before using invoice tools.</p></li>
        </ol>
      </section>
      <section className={styles.access} aria-labelledby="install-access-heading">
        <div><h2 id="install-access-heading">Your workspace. Your permission.</h2><p>Never paste a private key, seed phrase, or connection credential into an installation prompt. An active credential is not proof of a working agent connection.</p></div>
        <Link className="text-link" href="/app/connections">Manage connection credentials</Link>
      </section>
      <footer className={styles.footer}><span>Payr on Arc Testnet</span><Link className="text-link" href="/app">Back to workspace</Link></footer>
    </main>
  </div>;
}
