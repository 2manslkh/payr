import Link from "next/link";
import { PayrWordmark } from "../components/payr-wordmark";
import Image from "next/image";
import { InvoiceIllustration } from "../components/landing/invoice-illustration";
import { WorkflowStory } from "../components/landing/workflow-story";
import { SkillInstall } from "../components/landing/skill-install";
import { PublicAgentTools } from "../components/landing/public-agent-tools";
import { apiMarkdown, authMarkdown } from "../lib/discovery";
import styles from "./page.module.css";

export const metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <div className={styles.landing}>
      <PublicAgentTools setupInstructions={authMarkdown} capabilities={apiMarkdown} />
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <Link href="/" aria-label="Payr home">
          <PayrWordmark />
        </Link>
        <nav aria-label="Main navigation">
          <a className={styles.workflowLink} href="#workflow">How it works</a>
          <span className={styles.network}>Arc Testnet</span>
          <Link href="/login" className={styles.headerSignIn}>Sign in <Arrow /></Link>
        </nav>
      </header>
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <h1 id="hero-title">From finished work to <span>verified payment.</span></h1>
            <p>AI-powered invoicing.</p>
            <SkillInstall />
            <div className={styles.heroActions}>
              <Link className={`button ${styles.primaryAction}`} href="/login">Sign in to Payr <Arrow /></Link>
              <a className={styles.textAction} href="#workflow">See the workflow <Arrow down /></a>
            </div>
          </div>
          <figure className={styles.heroArtwork}>
            <InvoiceIllustration />
            <figcaption><span className={styles.captionLine} /> One invoice. A connected record.</figcaption>
          </figure>
        </section>

        <div className={styles.promiseLine} aria-label="Payr workflow">
          <span>Build.</span><Arrow /><span>Invoice.</span><Arrow /><span>Get Paid.</span>
        </div>

        <section className={styles.problem} aria-labelledby="problem-title">
          <div><h2 id="problem-title">Shipping the work isn&apos;t the end of the work.</h2></div>
          <div className={styles.problemCopy}>
            <p>The project is done. The payment admin is just beginning.</p>
            <p>Client details in one place. An invoice in another. A transfer to track down. A receipt still to send. For independent developers billing across borders, the work after the work adds up.</p>
            <p className={styles.problemConclusion}>Payr connects the pieces, from the invoice you approve to the payment you can verify.</p>
          </div>
          <div className={styles.adminTrail} aria-hidden="true"><span>Billing details</span><i /><span>Invoice PDF</span><i /><span>Payment link</span><i /><span>Transfer proof</span></div>
        </section>

        <section id="workflow" className={styles.workflowSection} aria-labelledby="workflow-title">
          <div className={styles.sectionHeading}>
            <h2 id="workflow-title">One record.<br />From start to settled.</h2>
          </div>
          <WorkflowStory>
            <article id="confirm-work" data-workflow-step="0" className={styles.chapter}>
              <span className={styles.stepNumber}>01 / Confirm</span>
              <h3>Start with the facts.<br />Not a blank invoice.</h3>
              <p>Save your sender profile, clients, payout wallet, and payment terms. Payr assembles a draft from confirmed details and checks what is missing before it can move forward.</p>
              <div className={styles.chapterFact}>Your details. Explicit approval. No guesswork.</div>
              <p className={styles.comingNote}><span>Coming next</span> Create and revise invoices through Claude. Authoring is API-first today.</p>
            </article>
            <article id="publish-invoice" data-workflow-step="1" className={styles.chapter}>
              <span className={styles.stepNumber}>02 / Publish</span>
              <h3>Make it official.<br />Keep it protected.</h3>
              <p>Approve the exact draft. Payr freezes the invoice, assigns its number, and creates a downloadable PDF and protected payment link you can share with your client.</p>
              <div className={styles.chapterFact}>A fixed record, not an editable moving target.</div>
            </article>
            <article id="approve-payment" data-workflow-step="2" className={styles.chapter}>
              <span className={styles.stepNumber}>03 / Pay <span className={styles.upcoming}>Coming next</span></span>
              <h3>Their wallet.<br />Their approval.</h3>
              <p>Your client opens the link, reviews the amount and payee, and approves the USDC payment in their own wallet. They don&apos;t need a Payr account.</p>
              <div className={styles.chapterFact}>Connecting a wallet is never permission to pay.</div>
            </article>
            <article id="verify-settlement" data-workflow-step="3" className={styles.chapter}>
              <span className={styles.stepNumber}>04 / Verify <span className={styles.upcoming}>Coming next</span></span>
              <h3>Not just sent.<br />Verified and matched.</h3>
              <p>Payr checks the onchain settlement against the invoice&apos;s exact amount, payee, and commitment. Only matching, verified settlement becomes Paid.</p>
              <div className={styles.chapterFact}>A transaction hash alone is not payment proof.</div>
            </article>
            <article id="close-loop" data-workflow-step="4" className={styles.chapter}>
              <span className={styles.stepNumber}>05 / Receipt <span className={styles.upcoming}>Coming next</span></span>
              <h3>The final detail.<br />Already connected.</h3>
              <p>The next step is a receipt linked to the verified payment, with a downloadable PDF and automatic delivery to both parties. One continuous record, from work to proof.</p>
              <div className={styles.chapterFact}>Receipt generation and email delivery are in development.</div>
            </article>
          </WorkflowStory>
        </section>

        <section className={styles.capabilities} aria-labelledby="capabilities-title">
          <div className={styles.capabilityIntro}><h2 id="capabilities-title">Built for the details<br />that matter.</h2></div>
          <dl className={styles.capabilityList}>
            <div><dt>Confirmed, then published</dt><dd>Saved profiles and explicit approval keep the invoice grounded in the details you agreed to.</dd></div>
            <div><dt>Private by design</dt><dd>Invoice contents stay offchain. Protected links give clients access; anyone with a live link can open it.</dd></div>
            <div><dt>Payment with boundaries</dt><dd>The settlement contract enforces the amount, payee, authorization expiry, and one settlement per invoice.</dd></div>
            <div><dt>Proof with context</dt><dd>Payment evidence is tied to the invoice, not left as an unexplained transfer in a wallet.</dd></div>
          </dl>
        </section>

        <section className={styles.availability} aria-labelledby="availability-title">
          <h2 id="availability-title">A clear view of what&apos;s here.</h2>
          <div className={styles.availabilityColumns}>
            <div><h3><span className={styles.statusDot} /> On Arc Testnet</h3><p>Workspace and client setup. API-first invoices. Protected PDFs and payment links. Invoice-bound settlement authorization and a verified operator-payment flow.</p><small>Testnet software, not a mainnet financial service.</small></div>
            <div><h3><span className={styles.nextDot} /> Coming next</h3><p>Client wallet payments and automatic reconciliation. Claude-based invoice creation and revision. Linked receipt pages, PDFs, and automatic receipt emails.</p><small>The full agent-to-receipt journey is still in development.</small></div>
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div><h2 id="closing-title">You did the work.<br />Give it a proper finish.</h2><p>Set up your profile and clients in Payr.</p><Link href="/login" className={`button ${styles.primaryAction}`}>Open your workspace <Arrow /></Link></div>
          <Image src="/brand/payr-mascot.webp" alt="" width={180} height={166} className={styles.mascot} />
        </section>
      </main>
      <footer className={styles.footer}><span>Payr</span><p>Build. Invoice. Get Paid.</p><a href="#hero-title">Back to top <Arrow up /></a></footer>
    </div>
  );
}

function Arrow({ down = false, up = false }: { down?: boolean; up?: boolean }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" className={down ? styles.arrowDown : up ? styles.arrowUp : undefined}><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
