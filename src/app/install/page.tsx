import Link from "next/link";
import { PayrWordmark } from "../../components/payr-wordmark";
import { InstallPrompt } from "../../components/install-prompt";
import { SkillInstall } from "../../components/landing/skill-install";
import styles from "./page.module.css";

export const metadata = {
  title: "Connect Payr to your agent",
  description: "Connect Claude, Cowork or another MCP client to Payr, configure workspace access, and verify the connection. No plugin required.",
  alternates: { canonical: "/install" },
};

export default function InstallPage() {
  return <div className="public-page">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="public-header">
      <Link href="/" aria-label="Payr home"><PayrWordmark /></Link>
      <Link className="text-link" href="/app">Open workspace</Link>
    </header>
    <main id="main-content" className={`${styles.page} content-reveal`} tabIndex={-1}>
      <div className={styles.intro}>
        <h1>Connect Payr to your agent.</h1>
        <p>Use Payr&apos;s invoice tools through an MCP connection. No plugin download required.</p>
      </div>
      <section className={styles.steps} aria-labelledby="steps-heading">
        <h2 id="steps-heading">From connection to workspace access</h2>
        <ol>
          <li>
            <h3>Add the connection</h3>
            <p>Choose your client below. This adds Payr&apos;s gateway and lets your agent discover its tools.</p>
            <div className={styles.clientSetup}><SkillInstall heading="Choose your client" showGuideLink={false} /></div>
          </li>
          <li>
            <h3>Connect your workspace</h3>
            <p>Sign in to Payr and open Connections. Create a REST gateway connection for the operator-registered service. For a demo, use a dedicated workspace with test data, only the permissions you need and a one-day expiry. Prefer a verified private credential path if available.</p>
            <p className={styles.pending}><strong>Hackathon setup: credentials are model-visible.</strong> If you explicitly accept this exposure, your agent can pass the demo credential in tool calls. Chat, tool history and Bazantic traces may retain it. Never supply service keys, wallet private keys or cookies. Revoke the credential after your demo.</p>
            <p>After you consent, supply the raw account credential to your agent or approve reading <code>PAYR_ACCOUNT_CREDENTIAL</code> from its local environment. The agent must put it in <code>requestBody.accountCredential</code>, beside <code>requestBody.input</code>, on each protected call if the discovered schema exposes that field. Do not include <code>Bearer </code> or put it inside <code>input</code>. Reading it from an environment variable still exposes it when used in a tool argument.</p>
            <Link className="text-link" href="/app/connections">Open Payr Connections</Link>
          </li>
          <li>
            <h3>Verify access</h3>
            <p>Once workspace authentication is configured, ask your agent to call <code>get_account</code> and confirm the returned workspace is yours. This is a read-only check. Seeing a tool list or copying a prompt does not verify workspace access.</p>
            <p>The currently imported gateway catalog does not include <code>get_account_context</code>. Wallet address discovery needs an updated catalog, an explicit <code>wallet:read</code> grant and the service operation scope. No agent can sign or spend.</p>
            <p>Review the exact draft and both email recipients before approving Publish &amp; Send. New publication requires approval of both the invoice and its email delivery; disabled invoice email blocks publication. The operator must refresh the gateway schemas before activation. Payment stays in the client&apos;s wallet.</p>
          </li>
        </ol>
      </section>
      <InstallPrompt />
      <section className={styles.access} aria-labelledby="connection-help">
        <h2 id="connection-help">Connection questions</h2>
        <details>
          <summary>I can see tools, but account access fails</summary>
          <p>The gateway can list tools before you authenticate a workspace. Check that the protected call includes your account credential in the discovered body field, then check expiry, revocation and scopes. If it still fails, ask the operator to check gateway configuration without sharing your credential. The gateway&apos;s service key alone does not grant workspace access.</p>
        </details>
        <details>
          <summary>Codex asks me to authenticate or OAuth login returns 404</summary>
          <p>This demo flow does not use OAuth. Keep the public gateway URL, but remove the Payr account credential from its bearer or Authorization header settings. Bazantic does not forward Authorization upstream. Restart the client after configuration changes. Neither MCP settings nor an exported environment variable automatically inserts a credential into tool bodies; the agent must populate the discovered field after your consent. Authenticated client execution must still be verified with <code>get_account</code>.</p>
        </details>
        <details>
          <summary>I already use a direct Payr MCP connection</summary>
          <p>A working direct connection can continue on deployments that support it. Its private endpoint URL and credential are different from the public gateway and REST gateway credentials. If it reports &quot;Use the Payr Bazantic gateway&quot;, follow the gateway setup above. Refresh older tool schemas for the required Publish &amp; Send approvals.</p>
        </details>
        <details>
          <summary>Do I need the Payr plugin or skill?</summary>
          <p>No. The optional plugin is archived, not an installation prerequisite. MCP tools provide schemas, workflow guidance and structured results; the portable invoice playbook is guidance, not authentication. Use the tools your connection actually exposes.</p>
        </details>
      </section>
      <footer className={styles.footer}><span>Payr on Arc Testnet</span><Link href="/app">Open workspace</Link></footer>
    </main>
  </div>;
}
