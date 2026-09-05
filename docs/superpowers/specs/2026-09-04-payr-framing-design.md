# Payr Framing and Design

Status: Draft for written review
Date: 2026-09-04
Owner: Lim Keng Hin (product and engineering)
Presentation and submission: Chanita Inthathong

## Executive verdict

Build Payr: an agent-native invoicing service for independent developers that turns a short instruction plus confirmed business and client profiles into a complete commercial invoice, protected payment link, and PDF, then reconciles the Arc USDC payment into a tamper-evident receipt and delivers it automatically.

The service provider is the only primary user. The client is a necessary bill-to party and payer, not a second product persona. The service provider's agent gathers confirmed information, creates the invoice through Payr, and prepares a Gmail message. The service provider approves publication and email separately. The client always controls the payment transaction.

The remembered three-minute claim is:

> A freelancer can go from one instruction to a complete PDF invoice and payment link, then receive an automatically reconciled receipt after real USDC settlement.

## 1. Starting point and constraints

- ETHOnline 2026 runs from 4–16 September 2026.[1]
- The exact submission cutoff time and timezone have not yet been verified from the participant dashboard. This must be confirmed before submission planning.
- Keng is the sole engineer and owns product decisions.
- Chanita owns administration, presentation, and submission preparation.
- Both have a focused 12–4 PM daily work block.
- Code freezes on 15 September so the final period can be used for presentation and submission.
- Keng has approximately 44 focused engineering hours from 4–14 September inclusive.
- The workspace currently contains framing documents and brand assets, but no application code or runnable build.
- The critical path may contain at most one difficult external integration at a time.
- `payrlink.xyz` has been purchased through Vercel. Vercel nameservers and A records have begun resolving, but HTTPS and Resend sender-domain verification are not yet proven.

Single framing outcome: approve one narrow, honest, demo-ready vertical slice before implementation.

Not yet: production-scale infrastructure, autonomous payer custody, multiple chains or tokens, fiat onboarding, tax engines, escrow, accounting integrations, or sponsor features without user value.

## 2. Candidate ranking

The concepts use the project scorecard's eight weighted dimensions: user pain, demo clarity, feasibility, onchain necessity, technical credibility, differentiation, sponsor fit, and post-hackathon potential.

| Rank | Concept | Score | Verdict |
| ---: | --- | ---: | --- |
| 1 | Seller-agent invoice creation with PDF/email delivery and human client payment | 427/500 | Strong but ambitious; proceed with gates |
| 2 | Buyer-agent autonomous accounts payable | 246/500 | Not viable in 44 hours |
| 3 | Generic A2A/A2C invoicing protocol | 127/500 | Reject for this event |

### 2.1 Seller-agent invoice creation

- User: independent developers billing crypto-native international clients.
- Painful moment: gathering client details, formatting and checking invoices, issuing payment instructions, matching transfers, and sending receipts.
- Promise: one instruction becomes a complete PDF invoice, protected payment link, and email-ready package; settlement automatically becomes a linked receipt delivered to both parties.
- Onchain necessity: direct USDC settlement plus shared, independently inspectable proof tying one transfer to one invoice commitment.
- Demo proof: a real Arc payment changes contract and application state before the judge.
- Leading risk: agent-generated documents alone are easy to copy. The differentiated product is the complete issuance-to-reconciliation loop.

### 2.2 Buyer-agent autonomous accounts payable

- Stronger theoretical fit for autonomous-agent prizes.
- Weaker firsthand demand evidence.
- Requires a funded agent wallet, spending policies, a second primary persona, Circle Agent Stack, and materially more security work.
- Rejected because sponsor fit does not rescue product and schedule risk.

### 2.3 Generic A2A/A2C invoicing protocol

- Has a broad future narrative but no narrow first user or painful moment.
- Requires several workflows and relies on narration rather than a single visible outcome.
- Rejected for the hackathon. Agent-to-agent settlement remains a possible later expansion, not an MVP claim.

## 3. Product framing

### One-sentence product

Payr lets an independent developer tell an AI agent whom to invoice, what for, and how much; Payr assembles the confirmed invoice, PDF, and payment link, while verified Arc USDC settlement automatically produces and emails a linked receipt.

### Target user

An independent software developer or freelancer who bills international, crypto-native clients and already has an external wallet.

### Initial payer

A crypto-native client who already holds testnet USDC and can approve a transaction from an existing wallet.

### Painful moment

After completing work, the freelancer must gather legal and address details, format and check an invoice, write payment instructions, monitor a transfer, identify which invoice it paid, and create a receipt. Bank currency limitations can also make the proceeds slow or unusable.

### Core promise

From one short instruction, generate a client-ready invoice preview; after approval, produce an immutable invoice number, protected payment link, downloadable PDF, QR code, and email-ready package. After one client wallet transaction, show a verified paid state and issue a receipt without manual reconciliation.

### Why Ethereum and Arc are necessary

A normal database can generate an invoice but cannot provide direct ownership of the settled asset or neutral, independently inspectable settlement. Arc moves USDC directly from the client to the freelancer while the contract enforces invoice-specific terms and emits deterministic reconciliation data. Arc uses USDC as its native token and exposes the same underlying balance through an 18-decimal native interface and a 6-decimal ERC-20 interface.[5]

### Document claim

Payr creates a generic commercial invoice/payment request. It does not claim jurisdiction-specific tax compliance or legal sufficiency.

## 4. Scope

### Included in the vertical slice

- Wallet-signature login for the freelancer.
- One saved sender profile with default payment terms.
- One or more saved client profiles; the demo uses one preloaded client.
- Structured missing-field responses so the host agent can ask the service provider for information.
- Optional host-agent web search for public client fields only after user approval; every suggested field must carry a source and receive confirmation.
- One invoice currency and settlement asset: USDC on Arc.
- Prompt-driven draft creation through a remote MCP connector.
- Deterministic server-side validation and rendering.
- Separate human approvals for invoice publication and email sending.
- Immutable sequential invoice numbering at publication.
- Revocable high-entropy `https://payrlink.xyz/invoice/<slug>` payment link with no client login.
- Server-generated invoice PDF, protected PDF URL, content hash, and QR code.
- One native-USDC settlement contract.
- A policy-controlled Privy server wallet as the Payr EIP-712 attestor, retained only if an early allow/deny spike passes.
- Short-lived payment authorization issued only when the client presses Pay Now.
- Event-backed paid status, receipt page, and receipt PDF.
- One idempotent logical receipt-email dispatch per confirmed party through Resend.
- Gmail email package and connector smoke test; PDF attachment is optional rather than required.
- Portable `SKILL.md` documenting how API-capable agent hosts should use Payr safely.
- Claude as the primary demo client because it supports remote MCP custom connectors.[2]

### Explicit non-goals

- Autonomous payer agent or any agent-controlled spending.
- A2A negotiation or machine procurement.
- Mainstream client onboarding, card payment, or fiat conversion.
- Multiple chains, stablecoins, or settlement assets.
- Escrow, milestones, disputes, refunds, partial payments, tips, or overpayments.
- Automated invoice-email delivery by Payr, reminders, or debt collection. The service provider's agent sends the initial Gmail message after approval.
- Accounting-suite integration.
- Tax calculation or jurisdiction-specific invoice compliance.
- Public invoice contents, invoice NFTs, or token issuance.
- Dual-party EIP-712 invoice acknowledgment or a fake PDF "Sign here" control.
- Automatic Gmail PDF attachment unless a live connector spike proves it.
- Agent authority to change sender identity or payout wallet.
- Unsourced or automatically accepted web-search data.
- Privy integration that cannot demonstrate an enforced typed-data policy.

## 5. User journey

### Freelancer setup

1. Connect an external wallet and sign a login message.
2. Save a sender profile with business name, address, contact details, payout wallet, invoice prefix, and default payment terms.
3. Save a client profile with business name, billing address, and contact details.
4. Create a revocable agent connector for that workspace.

Sender identity and payout-wallet changes are dashboard-only. Changing the payout wallet requires a fresh wallet signature. The agent may propose client-profile changes but cannot silently overwrite confirmed fields.

The main demo starts after setup with one sender and one client already saved. Missing-information search is demonstrated separately only if the core flow is stable.

### Agent invoice creation

1. Freelancer writes: "Invoice Circle 1,000 USDC for building the frontend website."
2. The agent calls `create_invoice_draft` with structured fields.
3. Payr loads the authenticated sender and client profiles.
4. When the prompt omits a due date, Payr applies the sender's saved default payment terms and highlights the applied default in the draft.
5. If required data is missing, Payr returns structured missing fields and creates no draft. The agent asks the service provider to supply them.
6. With separate user approval, the host agent may search for missing public client fields. It presents source URLs, never infers email or wallet addresses, and passes only user-confirmed values to Payr. Information typed directly by the service provider is marked `user_provided` rather than given a fabricated web source.
7. Payr validates issuer, client, line items, exact USDC amounts, dates, payout wallet, and optional confirmed client-profile changes.
8. Payr returns a complete structured preview showing all defaults and proposed profile changes.
9. The service provider approves or revises the draft.
10. On explicit publication approval, the agent calls `publish_invoice`.
11. Payr atomically assigns the next workspace invoice number, freezes the version, creates a random invoice key and salted document commitment, renders the PDF and QR code, and returns protected invoice/PDF URLs plus an email package.

### Initial email

1. The agent uses the returned confirmed recipient, subject, body, payment link, and PDF link to prepare a Gmail message.
2. The email body always contains the payment link and PDF link.
3. The PDF is attached only if a live connector smoke test proves arbitrary file attachment support. Attachment is not a core acceptance criterion.
4. The service provider separately approves the Gmail send. Claude's Google Workspace connector supports drafting and sending Gmail messages and asks for approval by default.[10]

### Client payment

1. Client opens the link without creating a Payr account.
2. The page and protected PDF display the same immutable invoice version, payee wallet, exact USDC amount, due date, Arc network, and QR code.
3. The QR code contains the protected HTTPS invoice URL, not raw transaction calldata. It opens the responsive payment page for a supported mobile EVM wallet flow.
4. Client connects an existing wallet.
5. The page checks that the invoice is still published and payable, then requests a short-lived EIP-712 authorization from Payr's attestor.
6. The page checks network and shows invoice value separately from estimated USDC gas reserve.
7. Client approves one transaction with the exact native-USDC value.
8. The contract validates and forwards the payment directly to the freelancer.

### Reconciliation and receipt

1. Payr independently retrieves and verifies the Arc transaction receipt and settlement event.
2. A backfill event watcher catches settlements even when the browser callback is lost.
3. An idempotent database transaction records the settlement by chain ID, transaction hash, and log index.
4. Payr renders a separate immutable receipt page and PDF from the frozen invoice version and verified event.
5. Resend dispatches one idempotent logical receipt delivery to each confirmed address, using a unique delivery record and provider idempotency key.
6. `get_invoice_status` returns Paid, payer, payee, amount, settlement time, transaction hash, explorer URL, receipt URL, and receipt-email state.

### Correction

1. Published invoice versions are never edited or deleted.
2. Before payment, the service provider may void an invoice and create a replacement with a new number, PDF, commitment, and link.
3. Payr never issues a new short-lived payment authorization for a voided invoice.
4. A previously issued short-lived authorization remains a bounded residual risk until it expires; perfect immediate revocation would require an onchain revocation transaction and is outside the MVP.

## 6. System architecture

### Components

1. **Next.js application**
   - Freelancer setup and invoice dashboard.
   - Revocable bearer-link invoice/payment route.
   - Protected invoice-PDF and receipt routes.
   - Pay Now authorization and transaction preparation.
   - API, voiding, and reconciliation handlers.

2. **Supabase/PostgreSQL**
   - Private sender/client profiles.
   - Invoice state and immutable versions.
   - Atomic per-workspace invoice sequence.
   - Hashed opaque-link and connector credentials.
   - Immutable document and email-delivery records.
   - Idempotent settlement ledger.
   - Row-level access controls for freelancer data.

3. **Canonical Payr API**
   - Owns validation, sourced-field confirmations, state transitions, rendering inputs, commitments, and status.
   - Does not call an LLM.
   - Returns bounded structured results and stable error codes.

4. **Remote MCP adapter**
   - Exposes the Payr API to Claude and other compatible MCP clients.
   - Provides four tools: `create_invoice_draft`, `publish_invoice`, `get_invoice_status`, and `void_invoice`.
   - Claude supports publicly reachable Streamable HTTP/SSE MCP connectors and OAuth-capable custom connectors.[2][3]

5. **Portable agent skill**
   - Explains when Payr is appropriate.
   - Gives the host agent responsibility for optional approved web search, source presentation, user confirmation, local PDF download when supported, and Gmail composition.
   - Requires separate approval for publication and sending email.
   - Documents field semantics, defaults, error recovery, and privacy limits.
   - Does not claim every chat product supports the same installation mechanism.

6. **Document renderer**
   - Uses one canonical immutable invoice model for the payment page and PDF.
   - Generates a server-side PDF with a payment-page QR code.
   - Returns a protected URL, deterministic filename, content type, byte size, and content hash.
   - Generates a separate receipt PDF from the frozen invoice and verified settlement.

7. **Privy attestor**
   - Uses a policy-controlled Privy server wallet to sign short-lived Payr EIP-712 payment authorizations.
   - The policy allows only the intended Payr typed-data shape and constraints and denies unmatched methods.[11]
   - Lives behind a signer interface so a failed early spike can fall back to an isolated testnet signer without changing invoice or contract semantics.

8. **Arc settlement contract**
   - Accepts exact native USDC through `msg.value`.
   - Verifies the short-lived Payr EIP-712 authorization.
   - Prevents duplicate settlement.
   - Forwards funds directly to the freelancer.
   - Emits deterministic settlement metadata.

9. **Reconciler and receipt dispatcher**
   - Reads transaction receipts and contract logs from Arc RPC.
   - Is the only path that can transition a published invoice to paid.
   - Uses an idempotent unique settlement key.
   - Renders the receipt and performs one idempotent logical Resend dispatch per confirmed address.

10. **External host-agent capabilities**
   - Claude Gmail drafts/sends the initial invoice message after user approval.[10]
   - The host agent's own web tool performs optional approved company-data research.
   - These are orchestration capabilities, not Payr data sources or payment authorities.

### Authentication boundary

Production should use OAuth for the remote connector. The hackathon demo may use a revocable, high-entropy per-workspace token embedded in an unguessable connector endpoint because Claude's custom connector UI does not accept arbitrary static headers. This is a declared testnet-only shortcut: URL credentials can appear in logs and browser history.

The connector credential is scoped to invoice drafting, publication, voiding, and status for one workspace. It cannot move money, change sender identity or payout wallets, or expose unrelated workspaces. It may save only client-profile changes that are shown in the draft and explicitly approved at publication. The Claude approval turn is a workflow control, not cryptographic evidence of user intent: a stolen connector token could still publish or void invoices, so the token must be scoped, rate-limited, revocable, and kept out of logs.

The client invoice link is a separate revocable high-entropy bearer credential. The database stores only its hash. Invoice and PDF responses use `noindex`, private/no-store caching, and URL redaction in application logs and analytics.

## 7. Agent tool contracts

`payr:create-invoice` is the user-facing portable-skill workflow. It interprets the request, coordinates approved host-agent search when needed, collects confirmation, and orchestrates the bounded MCP tools below. It is not a fifth backend mutation endpoint.

### `create_invoice_draft`

Inputs:

- client alias or ID, or confirmed fields for a new client
- one or more line-item descriptions
- exact decimal USDC amount per line item
- issue date, defaulting to the current workspace date
- due date or permission to use the sender's saved default payment terms
- optional memo
- optional proposed client-profile fields, each with provenance (`user_provided` or `web_source`), a source URL when web-sourced, and explicit confirmation
- idempotency key

Behavior:

- Loads saved profiles.
- If the alias is unknown but a complete confirmed new-client payload is supplied, includes a pending client-profile creation in the draft diff rather than saving immediately.
- Returns stable missing-field errors without mutation when required data or defaults are unavailable.
- Rejects unconfirmed, conflicting, or prohibited client-profile changes and any web-sourced field without its source URL.
- Never accepts agent changes to sender identity or payout wallet.
- Converts money with decimal-safe code.
- Produces canonical invoice JSON and a rendered preview.
- Shows every applied default and proposed saved-profile change.
- Returns draft ID, version, preview, and explicit publication-approval instruction.

### `publish_invoice`

Inputs:

- draft ID
- expected version
- explicit approval flag
- idempotency key

Behavior:

- Rejects stale or incomplete drafts.
- Requires explicit approval of the exact draft version and profile-change diff.
- Atomically assigns the next workspace invoice number.
- Freezes the approved version.
- Creates a random invoice key and salt.
- Renders the final PDF and QR code, then computes `invoiceDataHash = keccak256(canonicalInvoiceJson)` and `pdfContentHash = keccak256(pdfBytes)`.
- Computes `documentCommitment = keccak256(abi.encode(salt, invoiceDataHash, pdfContentHash))` so settlement binds both the structured invoice and delivered artifact without ambiguous concatenation.
- Returns `https://payrlink.xyz/invoice/<high-entropy-slug>`, a protected PDF URL, filename, content hash, and a Gmail-ready recipient/subject/body package.
- Returns the existing number, document, and link when safely retried.

### `get_invoice_status`

Inputs:

- invoice ID

Behavior:

- Returns draft, published, voided, paid, or expired state plus PDF/payment-link metadata appropriate to the caller.
- For paid invoices, returns only verified settlement, receipt, and receipt-email fields.
- Never infers payment from a client-side success message.

### `void_invoice`

Inputs:

- published invoice ID
- expected version
- explicit approval flag
- idempotency key

Behavior:

- Rejects draft, already paid, already voided, or mismatched-version requests.
- Marks the invoice voided and prevents Payr from issuing any new payment authorization.
- Revokes the invoice and PDF bearer link for ordinary access or renders a minimal non-sensitive Voided page.
- Does not claim to revoke a short-lived authorization already issued to a client; that residual authorization expires naturally.

## 8. Data model and state machine

### Principal records

- `users`: wallet identity and workspace ownership.
- `sender_profiles`: private invoice issuer details, payout wallet, invoice prefix, and default payment terms.
- `clients`: private saved billing profiles and confirmation provenance.
- `invoice_sequences`: atomically allocated next number per workspace/year or configured sequence.
- `invoices`: owner, client, immutable published number, current state, currency, due date, payable-until time, and current version.
- `invoice_versions`: canonical immutable JSON, rendered HTML/PDF references, salt, PDF content hash, and the commitment over both representations.
- `payment_links`: hashed opaque token, invoice, expiry, and revocation state.
- `connector_tokens`: hashed credential, workspace scope, expiry, and revocation state.
- `settlements`: chain ID, contract, invoice key, transaction hash, log index, payer, payee, atomic amount, and block time.
- `payment_authorizations`: invoice, attestor, issue/expiry times, and policy result; never treated as settlement.
- `email_deliveries`: message kind, recipient, provider idempotency key, provider message ID, and delivery state.

### Invoice state machine

`draft -> published -> paid`

Additional terminal states: `published -> voided` and `published -> expired` when the invoice is no longer payable.

- Drafts can be replaced by a new version.
- Drafts display `DRAFT`; an invoice number is allocated only during atomic publication.
- Published numbers and versions are immutable.
- Paid invoices cannot be edited or paid again.
- Voided invoices cannot receive new payment authorizations; replacements receive a new number and link.
- Due date is a commercial expectation, not the technical authorization expiry.
- `payableUntil` defaults to 30 days after the due date, allowing late payment while bounding old invoices.
- Each Pay Now authorization expires after ten minutes or at `payableUntil`, whichever comes first.

## 9. Settlement contract

### Short-lived signed authorization

Publication renders and hashes the final PDF, then creates the invoice key and `keccak256(abi.encode(salt, keccak256(canonicalInvoiceJson), keccak256(pdfBytes)))` document commitment but no long-lived payment signature. When Pay Now is pressed, the backend confirms that the invoice is still published and within `payableUntil`, then asks the policy-controlled Privy attestor to sign an authorization valid for at most ten minutes.

The EIP-712 payload binds:

- random `invoiceKey`
- salted `documentCommitment`
- payee wallet
- exact 18-decimal native-USDC amount
- short authorization expiry
- Arc chain ID
- settlement contract address through the EIP-712 domain

The Privy integration is accepted only if a live spike proves both an allowed Payr signature and rejection of a forbidden typed-data request. Privy documents that wallet policies can inspect EIP-712 shapes and that unmatched methods default to deny.[11]

### Payment function

Conceptual interface:

```solidity
payInvoice(
  bytes32 invoiceKey,
  bytes32 documentCommitment,
  address payable payee,
  uint256 amount,
  uint64 validUntil,
  bytes signature
) external payable
```

Required checks:

- `msg.value == amount`
- nonzero payee and amount
- authorization not expired
- invoice key not previously paid
- recovered signer equals the immutable Payr attestor address
- valid EIP-712 domain for the current chain and contract

Required effects:

1. Mark `invoiceKey` paid.
2. Forward the complete native-USDC value to `payee`.
3. Revert all state if forwarding fails.
4. Emit `InvoicePaid(invoiceKey, documentCommitment, payer, payee, amount)`.

The contract holds no balance after a successful call and provides no withdrawal path. Reentrancy protection and checks-effects-interactions are mandatory.

Voiding prevents Payr from issuing a new signature. An authorization issued immediately before voiding remains usable until its short expiry. Onchain immediate revocation is a post-MVP feature and this bounded race must be documented rather than hidden.

Arc's native and ERC-20 USDC interfaces represent the same asset but use different raw decimals. The settlement path uses only the 18-decimal native interface; code must never compare it directly with 6-decimal ERC-20 values.[5]

## 10. Privacy and security

- Names, addresses, contacts, line items, tax fields, rendered documents, salts, and notes stay offchain.
- The invoice page and PDF are protected by a revocable random bearer link; the database stores only its hash.
- The slug is redacted from logs and analytics, pages are `noindex`, and responses disable shared caching.
- Bearer links protect against guessing but not client forwarding; Payr must not claim stronger confidentiality.
- The onchain document commitment is salted to resist guessing low-entropy invoice contents.
- Only the invoice key, salted commitment, payer, payee, amount, and settlement event are public.
- Server rendering escapes all user-controlled text.
- API responses minimize profile data and are scoped by workspace.
- Connector and payment-link tokens are independently revocable and rate-limited.
- Sender identity and payout-wallet changes require the authenticated dashboard and a fresh wallet signature; agent tools cannot perform them.
- Web-search suggestions require source URLs and explicit field-level confirmation. User-entered fields use explicit `user_provided` provenance. Email and wallet addresses are never inferred.
- A leaked connector token could publish or void invoices despite the intended chat approval turn; strict scope, rate limits, revocation, and audit logs bound this declared hackathon shortcut.
- The Privy attestor wallet is policy-constrained, kept unfunded, and never used to custody or transfer payer/freelancer funds.
- Attestor compromise could authorize deceptive payment terms, so the client page must visibly show payee and amount before wallet approval.
- The signer interface allows the Privy integration to be removed if its policy gate fails without changing the settlement payload.
- Invoice and receipt emails contain protected financial-document links; Resend/Gmail provider metadata is treated as sensitive operational data.
- The product makes no tax, sanctions, AML, or legal-compliance guarantee.

## 11. Money and state invariants

- The frontend cannot credit or mark an invoice paid.
- Only a verified Arc event from the configured contract and chain can create a settlement.
- The unique settlement identity is chain ID + transaction hash + log index.
- Each invoice key can settle once.
- Exact payment only; partial payment, overpayment, and tips revert.
- Every accepted payment atomically forwards the full amount or reverts.
- The receipt references one immutable invoice version and one verified event.
- Receipt generation and each logical Resend delivery are idempotent and occur only after verified settlement.
- A payment authorization is not evidence of payment.
- Money is represented as decimal strings and integer atomic units, never floating-point numbers.

## 12. Failure behavior

- Unknown client without complete confirmed new-client fields: return `CLIENT_NOT_FOUND`; create nothing and let the host agent ask before retrying.
- Missing/ambiguous data or absent payment-term defaults: return field errors; create nothing.
- Unconfirmed, conflicting, prohibited, or web-sourced-without-URL profile changes: reject them and identify the affected fields.
- Duplicate draft request: return the original result by idempotency key.
- Duplicate publish: return the existing invoice number, link, PDF, and commitment.
- Stale draft version: reject publication and return the latest draft.
- PDF/QR generation failure: do not expose a payable link; retain an auditable failed publication attempt and never reuse a reserved number.
- Gmail send rejection/failure: invoice remains published and payable; return the email package for retry or manual sending.
- Unsupported Gmail attachment: send the protected PDF link instead; do not fail the invoice workflow.
- Expired/revoked connector: deny before revealing private data.
- Voided/expired invoice: do not issue a payment authorization.
- Privy policy rejection: return a stable authorization-denied error without exposing policy internals.
- Wrong chain: request an Arc network switch and do not submit.
- Insufficient wallet balance: show invoice value and estimated gas reserve separately.
- Invalid signature, wrong amount/payee/domain, expired authorization, replay, blocked address, or failed forwarding: transaction reverts and invoice remains unpaid.
- Submitted transaction with delayed database sync: verify the receipt in the client, show `confirming reconciliation`, and retry through the reconciler.
- A callback or claimed transaction hash never changes state without independent receipt and event verification.
- Receipt PDF or Resend failure after settlement: keep the invoice Paid, record delivery failure, and retry idempotently without duplicating messages.

## 13. Verification plan

### Unit and API tests

- Canonical serialization and stable salted commitment.
- Decimal parsing and 18-decimal atomic conversion.
- Required generic invoice fields, saved defaults, and profile ownership.
- Profile provenance/confirmation and prohibited sender/payout changes.
- Atomic invoice numbering, immutable publication, void-and-replace, and failed-publication handling.
- Connector scope, expiry, revocation, and response minimization.
- Draft, publish, void, receipt, and email idempotency.
- Event parsing and duplicate-settlement suppression.
- PDF filename/hash linkage and receipt derivation.

### Foundry contract tests

- Valid exact payment and zero retained balance.
- Wrong signer, domain, payee, amount, and `msg.value`.
- Expired authorization.
- Replay attempt.
- Forwarding failure.
- Reentrancy attempt.

### Arc testnet integration

- Deploy the real contract.
- Create and publish one real invoice commitment.
- Use the Pay Now endpoint to issue a short-lived authorization.
- Settle with real testnet USDC.
- Verify the emitted event, database record, paid state, receipt, recipient balance change, and explorer transaction.

This test is mandatory because standard local EVM simulators cannot reproduce all Arc-native behavior.[5]

### MCP and browser verification

- Exercise MCP initialize, tool discovery, missing-field response, draft, publish, status, and void through the deployed remote endpoint.
- Exercise the connector from Claude, not only a local MCP client.
- Generate the invoice and receipt PDFs, inspect metadata/text, rasterize them, and visually verify layout.
- Decode the rendered QR and prove it equals the protected invoice URL.
- Visually inspect invoice, payment, and receipt pages at desktop and mobile widths.
- Exercise wrong network, rejected wallet action, voided invoice, expired authorization, reverted transaction, delayed reconciliation, and paid receipt.
- Verify one Resend settlement notification reaches each confirmed test recipient without duplicate sends.
- Smoke-test Claude Gmail draft/send with its normal approval gate. Treat PDF attachment as optional unless independently proven.[10]
- Live-test one allowed and one forbidden Privy typed-data request before enabling the Privy signer.[11]
- Run production typecheck, tests, and build before any completion claim.

## 14. Three-minute demo

- **0:00–0:15:** Keng states the firsthand pain: scattered client details, manual invoices, cross-border currency friction, and manual receipts.
- **0:15–0:45:** In Claude, request: "Invoice Circle 1,000 USDC for building the frontend website." Show the complete draft, including the visibly applied saved payment terms.
- **0:45–1:05:** Approve publication. Claude returns the immutable number, protected payment link, PDF download, QR code, and Gmail-ready message.
- **1:05–1:25:** If the Gmail smoke test is stable, approve the pre-addressed Gmail send and open it in the client inbox. Otherwise open the returned payment link directly and state that Gmail is an enhancement.
- **1:25–2:05:** Open the link as the client, connect a pre-funded external wallet, and pay on Arc.
- **2:05–2:35:** Show the page transition to verified Paid, then show the receipt PDF and Resend receipt email.
- **2:35–2:50:** Return to Claude and query status, including receipt-email state and explorer proof.
- **2:50–3:00:** Show one architecture diagram: agent orchestration, private document/PDF offchain, policy-controlled attestation, and direct Arc USDC settlement.

### Demo fallback

- Fund and test both wallets before the presentation; do not depend on a faucet.
- Keep one previously settled invoice backed by a real Arc transaction and explorer link.
- Keep the successful invoice PDF, receipt PDF, Gmail message, and Resend delivery evidence for that transaction.
- Keep a short recording of a successful real run.
- If Gmail or search fails, bypass the enhancement and continue from the already created payment link.
- If a payment/provider network fails live, state the failure, then demonstrate reconciliation against the prior real transaction. Label prerecorded material as prerecorded.

## 15. Sponsor strategy

### Primary: Arc — Best DeFi/Onchain Finance Application

Arc asks for meaningful Arc/USDC use and favors conditional, automated, or multi-step settlement.[8] Payr qualifies as payment/fintech infrastructure only if the contract enforces exact invoice-bound terms and replay protection. A plain token transfer is not enough.

### Conditional secondary: Privy — Best B2B Financial Product

Privy requires a wallet, a B2B financial workflow, and a functional control such as a policy or signer.[8] Payr now has a meaningful candidate integration: a policy-controlled Privy server wallet authorizes only the intended short-lived EIP-712 payment shape. Privy documents typed-data policy matching and deny-by-default behavior for unmatched methods.[11]

Target this only if an early live spike proves:

- one allowed Payr authorization is signed,
- one forbidden typed-data request is rejected by policy, and
- the Arc settlement contract accepts the resulting valid signature.

If any part fails its timebox, use the isolated testnet signer and withdraw from the Privy prize.

### Conditional tertiary: Bazantic — Agentify a New API

Payr's invoice API could be a new reusable agent service. Eligibility requires a Bazantic x402/MPP Gateway, a service not already available through Bazantic or another sponsor API, a working recipe, and a screen-recorded demonstration.[8]

Give Bazantic at most a one-hour spike after the core Arc journey passes. Keep it only if the gateway and recipe call the canonical Payr API without duplicating state or destabilizing Claude. Otherwise drop the track.

### Conditional fourth: Arc — Launch on Arc Testnet & Push to Mainnet

The From-Scratch prize accepts USDC commerce flows and agentic payments, but requires a working frontend/backend, architecture diagram, documentation, and mainnet deployment or deployment-readiness by 30 September 2026.[8]

Target this only if the testnet vertical slice is stable by code freeze and Keng explicitly commits post-submission time through 30 September. Do not claim this target is complete merely because a testnet contract exists.

### Do not target: Arc — Agentic Economy

Arc asks for autonomous agents that hold wallets, make payments, manage risk, or settle jobs using Circle Agent Stack.[8] Payr's agent creates invoices; a human client controls settlement. Describe Payr as an agent-native invoicing workflow, not an autonomous transacting agent.

### Ineligible: Arc — Best DeFi or Agentic Application

The combined prize is restricted to Continuity Track participants.[8] Payr is registered From Scratch.

## 16. Engineering budget

| Workstream | Hours |
| --- | ---: |
| Foundation, authentication, profiles, and domain | 5 |
| Invoice state/API, MCP adapter, and portable agent skill | 7 |
| HTML/PDF rendering, protected links, and QR | 5 |
| Settlement contract, Arc deployment, and Privy policy spike | 8 |
| Payment page and external wallet flow | 5 |
| Event watcher, receipt PDF, and Resend delivery | 6 |
| Tests, deployment, Gmail demo, rehearsal, and buffer | 8 |
| **Total** | **44** |

Bazantic, if attempted, consumes at most one hour from the final eight-hour block. Gmail and search are enhancements; autonomous payer work has no allocation.

## 17. Leading risks and scope triggers

| Risk | Signal | Required response |
| --- | --- | --- |
| Claude remote connector authentication takes more than planned | No deployed authenticated draft call within the MCP block | Use the declared scoped testnet connector token; do not build full OAuth |
| Arc-native transfer behavior differs from local tests | First testnet settlement fails or units mismatch | Stop UI polish and fix/test the contract on Arc; never fake settlement |
| Privy policy cannot constrain or sign Payr typed data | Allowed/denied spike or contract verification fails | Use isolated testnet signer and drop the Privy prize |
| PDF rendering consumes excessive time | Final PDF/QR is not reliable after its block | Simplify to one restrained template; do not add signatures or customization |
| Reconciliation is flaky | Paid event does not reliably become one ledger record | Make receipt polling/idempotency the priority; drop Bazantic and secondary UI |
| Gmail cannot attach generated PDF | Attachment smoke test fails | Send protected PDF/payment links; do not block invoice delivery |
| Gmail or web search is unreliable | Enhancement causes demo latency or errors | Remove it from the main run and open the generated payment link directly |
| Receipt email duplicates or fails | Same event creates repeated sends or no delivery record | Stop polish and fix outbox/idempotency before demo |
| `payrlink.xyz` TLS or Resend verification remains incomplete | HTTPS or SPF/DKIM checks fail at integration gate | Use verified Vercel hostname for web demo and do not claim branded Resend delivery |
| Bazantic duplicates the MCP layer | Requires a separate data model or agent UI | Drop Bazantic |
| Sponsor pressure expands personas | Autonomous payer enters the critical path | Reject the feature and preserve the freelancer journey |
| Mainnet launch prize creates post-event obligations | No availability through 30 September | Do not submit for that prize |

## 18. Acceptance criteria

The core MVP is complete only when all of the following have been exercised:

1. A deployed Claude custom connector discovers the Payr tools.
2. One instruction creates a complete draft from confirmed sender/client profiles and visibly applies saved payment terms.
3. Missing fields return without mutation; unconfirmed changes and web-sourced fields without URLs are rejected.
4. Publication requires explicit approval, allocates one immutable number, freezes the version, and returns the same artifacts on retry.
5. Payr produces a valid protected invoice page, PDF, content hash, and QR encoding the same payment URL.
6. Pay Now obtains a short-lived authorization and refuses voided/expired invoices.
7. A real external wallet settles exact native USDC through the deployed Arc contract.
8. The contract rejects wrong value, expired authorization, and replay attempts.
9. A verified event—not frontend state—marks the invoice paid.
10. Payr generates a separate receipt page/PDF from the immutable invoice and event.
11. Payr creates one idempotent logical Resend delivery per confirmed party and records provider message IDs; it does not claim transport-level exactly-once delivery.
12. Claude returns paid status, transaction proof, receipt, and receipt-email state.
13. Private invoice content is absent from contract calldata and events except for the salted commitment.
14. Production tests, typecheck, and build pass.
15. The core live path fits under three minutes even if Gmail and search are bypassed.
16. The repository, architecture diagram, demo, and written submission tell the same product story.

Enhancement acceptance is separate:

- Claude Gmail creates and sends the initial link-bearing message after its own user approval.[10]
- The host agent may present sourced public client fields, but Payr persists none without explicit confirmation.
- Gmail PDF attachment is demonstrated only if a live test proves it; otherwise the email contains the protected PDF link.

## 19. Decisions requiring no further implementation debate

- Primary user: freelancer, not accounts-payable team.
- Human client controls payment.
- Claude is the demo interface; Payr remains API/MCP-first.
- Saved profiles are authoritative; host-agent memory only selects them.
- Approved host-agent search may suggest sourced public client fields, but Payr accepts only confirmed values and never infers email/wallet addresses.
- Sender identity and payout wallet are dashboard-only; the agent may save approved client-profile changes.
- Saved default payment terms apply when the prompt omits a due date and are shown in the draft.
- Publication and Gmail send use separate user approvals.
- Published invoices are immutable, sequentially numbered, and corrected through void-and-replace.
- PDF and QR are core artifacts; automatic Gmail PDF attachment is not.
- Gmail sends the initial invoice links; Resend sends verified post-payment receipts.
- Invoice contents stay offchain.
- Arc and USDC are the only settlement chain/asset in MVP.
- Invoices are denominated and settled in exact USDC without a USD oracle or equivalent display.
- Settlement uses a minimal invoice-bound contract and a short-lived Pay Now authorization, not direct wallet transfer, escrow, or NFT issuance.
- The invoice is generic and makes no tax-compliance guarantee.
- Dual-party EIP-712 invoice acknowledgment is excluded; client transaction approval is the settlement act.
- Privy is retained only if its policy-controlled signer passes the live allow/deny spike.
- Arc autonomous-agent tracks remain excluded.

## 20. Remaining pre-implementation checks

These are verification tasks, not design decisions:

- Confirm the exact ETHOnline submission cutoff time and timezone from the authenticated event dashboard.
- Confirm `payrlink.xyz` HTTPS routing and Resend SPF/DKIM verification after DNS propagation.
- Exercise the reported active Claude, Gmail, Privy, Circle/Arc, Bazantic, Resend, and wallet accounts before depending on them.
- Verify Claude Gmail link sending and separately test whether outbound PDF attachments are supported.
- Prove one allowed and one denied Privy EIP-712 policy request against the intended Payr schema.
- Confirm the Arc testnet RPC, explorer, chain ID, and faucet-funded balances from official current documentation.
- Verify whether the selected Arc mainnet-launch prize requires any additional registration outside the ETHGlobal submission.

## Sources

[1] https://ethglobal.com/events — ETHGlobal Events
[2] https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp — Claude custom connectors using remote MCP
[3] https://platform.claude.com/docs/en/agents-and-tools/mcp-connector — Claude MCP connector documentation
[5] https://docs.arc.io/arc/references/evm-differences.md — Arc EVM differences
[8] https://ethglobal.com/events/ethonline2026/prizes — ETHOnline 2026 prizes
[10] https://support.claude.com/en/articles/10166901-use-google-workspace-connectors — Claude Google Workspace connector capabilities
[11] https://docs.privy.io/recipes/agent-integrations/x402-sanctions-screening — Privy EIP-712 wallet policy enforcement
