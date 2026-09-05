# Payr Framing and Design

Status: Draft for written review
Date: 2026-09-04
Owner: Lim Keng Hin (product and engineering)
Presentation and submission: Chanita Inthathong

## Executive verdict

Build Payr: an agent-native invoicing service for independent developers that turns a short prompt plus saved business and client profiles into a complete commercial invoice and Arc USDC payment link, then reconciles the onchain payment into a tamper-evident receipt.

The freelancer is the only primary user. The client is a necessary payer in the settlement flow, not a second product persona. The agent creates and publishes invoices after explicit human approval; it does not control the client's wallet or autonomously spend funds.

The remembered three-minute claim is:

> A freelancer can go from one prompt to a payable USDC invoice and an automatically reconciled receipt.

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

Single framing outcome: approve one narrow, honest, demo-ready vertical slice before implementation.

Not yet: production-scale infrastructure, autonomous payer custody, multiple chains or tokens, fiat onboarding, tax engines, escrow, accounting integrations, or sponsor features without user value.

## 2. Candidate ranking

The concepts use the project scorecard's eight weighted dimensions: user pain, demo clarity, feasibility, onchain necessity, technical credibility, differentiation, sponsor fit, and post-hackathon potential.

| Rank | Concept | Score | Verdict |
| ---: | --- | ---: | --- |
| 1 | Seller-agent invoice creation with human client payment | 436/500 | Strong candidate; proceed |
| 2 | Buyer-agent autonomous accounts payable | 246/500 | Not viable in 44 hours |
| 3 | Generic A2A/A2C invoicing protocol | 127/500 | Reject for this event |

### 2.1 Seller-agent invoice creation

- User: independent developers billing crypto-native international clients.
- Painful moment: gathering client details, formatting and checking invoices, issuing payment instructions, matching transfers, and sending receipts.
- Promise: one prompt becomes a complete, payable invoice; settlement automatically becomes a linked receipt.
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

Payr lets an independent developer ask an AI agent to create a complete invoice from saved profiles, approve it, and receive a client payment link that settles USDC on Arc and automatically produces a linked receipt.

### Target user

An independent software developer or freelancer who bills international, crypto-native clients and already has an external wallet.

### Initial payer

A crypto-native client who already holds testnet USDC and can approve a transaction from an existing wallet.

### Painful moment

After completing work, the freelancer must gather legal and address details, format and check an invoice, write payment instructions, monitor a transfer, identify which invoice it paid, and create a receipt. Bank currency limitations can also make the proceeds slow or unusable.

### Core promise

From one short prompt, generate a client-ready payment request in under 30 seconds under normal service conditions; after one client wallet transaction, show a verified paid state and linked receipt without manual reconciliation.

### Why Ethereum and Arc are necessary

A normal database can generate an invoice but cannot provide direct ownership of the settled asset or neutral, independently inspectable settlement. Arc moves USDC directly from the client to the freelancer while the contract enforces invoice-specific terms and emits deterministic reconciliation data. Arc uses USDC as its native token and exposes the same underlying balance through an 18-decimal native interface and a 6-decimal ERC-20 interface.[5]

### Document claim

Payr creates a generic commercial invoice/payment request. It does not claim jurisdiction-specific tax compliance or legal sufficiency.

## 4. Scope

### Included in the vertical slice

- Wallet-signature login for the freelancer.
- One saved sender profile.
- One or more saved client profiles; the demo uses one preloaded client.
- One invoice currency and settlement asset: USDC on Arc.
- Prompt-driven draft creation through a remote MCP connector.
- Deterministic server-side validation and rendering.
- Human review before publication.
- Opaque hosted invoice/payment link.
- One native-USDC settlement contract.
- Event-backed paid status and receipt.
- Printable invoice and receipt web pages.
- Portable `SKILL.md` documenting how API-capable agent hosts should use Payr safely.
- Claude as the primary demo client because it supports remote MCP custom connectors.[2]

### Explicit non-goals

- Autonomous payer agent or any agent-controlled spending.
- A2A negotiation or machine procurement.
- Mainstream client onboarding, card payment, or fiat conversion.
- Multiple chains, stablecoins, or settlement assets.
- Escrow, milestones, disputes, refunds, partial payments, tips, or overpayments.
- Automated email delivery, reminders, or debt collection.
- Accounting-suite integration.
- Tax calculation or jurisdiction-specific invoice compliance.
- Public invoice contents, invoice NFTs, or token issuance.
- Pixel-perfect PDF generation; browser print/save is sufficient for MVP.
- Privy integration solely to qualify for a prize.

## 5. User journey

### Freelancer setup

1. Connect an external wallet and sign a login message.
2. Save a sender profile with business name, address, contact details, and payout wallet.
3. Save a client profile with business name, billing address, and contact details.
4. Create a revocable agent connector for that workspace.

The demo starts after setup with one sender and one client already saved.

### Agent invoice creation

1. Freelancer writes: "Invoice Acme 250 USDC for the September API milestone, due Friday."
2. The agent calls `create_invoice_draft` with structured fields.
3. Payr loads the authenticated sender and client profiles.
4. Payr validates the amount, service description, due date, payout wallet, and required identity fields.
5. Payr creates a frozen draft version and returns a complete preview.
6. The agent asks the freelancer to approve or revise it.
7. On explicit approval, the agent calls `publish_invoice`.
8. Payr freezes the published version, creates its private document commitment and settlement authorization, and returns an opaque payment link.
9. The freelancer shares the link manually. Automated delivery is outside the MVP.

### Client payment

1. Client opens the link without creating a Payr account.
2. The page displays the full invoice, payee wallet, exact USDC amount, due date, and Arc network.
3. Client connects an existing wallet.
4. The page checks network and shows invoice value separately from estimated USDC gas reserve.
5. Client approves one transaction with the exact native-USDC value.
6. The contract validates and forwards the payment directly to the freelancer.

### Reconciliation and receipt

1. Payr independently retrieves and verifies the Arc transaction receipt and settlement event.
2. An idempotent database transaction records the settlement.
3. Payr renders a receipt from the frozen invoice version and verified event.
4. `get_invoice_status` returns Paid, payer, payee, amount, settlement time, transaction hash, explorer URL, and receipt URL.

## 6. System architecture

### Components

1. **Next.js application**
   - Freelancer setup and invoice dashboard.
   - Public opaque invoice/payment route.
   - Printable invoice and receipt routes.
   - API and reconciliation handlers.

2. **Supabase/PostgreSQL**
   - Private sender/client profiles.
   - Invoice state and immutable versions.
   - Hashed opaque-link and connector credentials.
   - Idempotent settlement ledger.
   - Row-level access controls for freelancer data.

3. **Canonical Payr API**
   - Owns validation, state transitions, rendering inputs, commitments, and status.
   - Does not call an LLM.
   - Returns bounded structured results and stable error codes.

4. **Remote MCP adapter**
   - Exposes the Payr API to Claude and other compatible MCP clients.
   - Provides three tools: `create_invoice_draft`, `publish_invoice`, and `get_invoice_status`.
   - Claude supports publicly reachable Streamable HTTP/SSE MCP connectors and OAuth-capable custom connectors.[2][3]

5. **Portable agent skill**
   - Explains when Payr is appropriate.
   - Requires draft review before publication.
   - Documents field semantics, error recovery, and privacy limits.
   - Does not claim every chat product supports the same installation mechanism.

6. **Arc settlement contract**
   - Accepts exact native USDC through `msg.value`.
   - Verifies a Payr EIP-712 settlement authorization.
   - Prevents duplicate settlement.
   - Forwards funds directly to the freelancer.
   - Emits deterministic settlement metadata.

7. **Reconciler**
   - Reads transaction receipts and contract logs from Arc RPC.
   - Is the only path that can transition a published invoice to paid.
   - Uses an idempotent unique settlement key.

### Authentication boundary

Production should use OAuth for the remote connector. The hackathon demo may use a revocable, high-entropy per-workspace token embedded in an unguessable connector endpoint because Claude's custom connector UI does not accept arbitrary static headers. This is a declared testnet-only shortcut: URL credentials can appear in logs and browser history.

The connector credential is scoped to invoice drafting, publication, and status for one workspace. It cannot move money, change payout wallets, or expose unrelated workspaces.

## 7. Agent tool contracts

### `create_invoice_draft`

Inputs:

- client alias or ID
- one or more line-item descriptions
- exact decimal USDC amount per line item
- issue date, defaulting to the current workspace date
- due date
- optional memo
- idempotency key

Behavior:

- Loads saved profiles.
- Rejects missing or ambiguous fields without mutation.
- Converts money with decimal-safe code.
- Produces canonical invoice JSON and a rendered preview.
- Returns draft ID, version, preview, and explicit approval instruction.

### `publish_invoice`

Inputs:

- draft ID
- expected version
- explicit approval flag
- idempotency key

Behavior:

- Rejects stale or incomplete drafts.
- Freezes the approved version.
- Creates a random invoice key and salt.
- Computes `keccak256(salt || canonicalInvoiceJson)`.
- Creates an EIP-712 authorization.
- Returns the existing link when safely retried.

### `get_invoice_status`

Inputs:

- invoice ID

Behavior:

- Returns draft, published, paid, or expired state.
- For paid invoices, returns only verified settlement and receipt fields.
- Never infers payment from a client-side success message.

## 8. Data model and state machine

### Principal records

- `users`: wallet identity and workspace ownership.
- `sender_profiles`: private invoice issuer details and payout wallet.
- `clients`: private saved billing profiles.
- `invoices`: owner, client, current state, currency, due date, authorization expiry, and current version.
- `invoice_versions`: canonical immutable JSON, rendered content reference, salt, and document commitment.
- `payment_links`: hashed opaque token, invoice, expiry, and revocation state.
- `connector_tokens`: hashed credential, workspace scope, expiry, and revocation state.
- `settlements`: chain ID, contract, invoice key, transaction hash, log index, payer, payee, atomic amount, and block time.

### Invoice state machine

`draft -> published -> paid`

Additional terminal state: `published -> expired` when the technical settlement authorization expires unpaid.

- Drafts can be replaced by a new version.
- Published versions are immutable.
- Paid invoices cannot be edited or paid again.
- Due date is a commercial expectation, not the technical authorization expiry.
- Default authorization expiry is 30 days after the due date, allowing late payment while bounding old authorizations.

## 9. Settlement contract

### Signed commitment

The EIP-712 payload binds:

- random `invoiceKey`
- salted `documentCommitment`
- payee wallet
- exact 18-decimal native-USDC amount
- authorization expiry
- Arc chain ID
- settlement contract address through the EIP-712 domain

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
- recovered signer equals the immutable Payr attestor
- valid EIP-712 domain for the current chain and contract

Required effects:

1. Mark `invoiceKey` paid.
2. Forward the complete native-USDC value to `payee`.
3. Revert all state if forwarding fails.
4. Emit `InvoicePaid(invoiceKey, documentCommitment, payer, payee, amount)`.

The contract holds no balance after a successful call and provides no withdrawal path. Reentrancy protection and checks-effects-interactions are mandatory.

Arc's native and ERC-20 USDC interfaces represent the same asset but use different raw decimals. The settlement path uses only the 18-decimal native interface; code must never compare it directly with 6-decimal ERC-20 values.[5]

## 10. Privacy and security

- Names, addresses, contacts, line items, tax fields, rendered documents, salts, and notes stay offchain.
- The payment page is protected by a random bearer link; the database stores only its hash.
- The onchain document commitment is salted to resist guessing low-entropy invoice contents.
- Only the invoice key, salted commitment, payer, payee, amount, and settlement event are public.
- Server rendering escapes all user-controlled text.
- API responses minimize profile data and are scoped by workspace.
- Connector and payment-link tokens are independently revocable and rate-limited.
- The backend attestor cannot custody or transfer payer/freelancer funds.
- Attestor compromise could authorize deceptive payment terms, so the client page must visibly show payee and amount before wallet approval.
- MVP attestor storage must be isolated from the application database and rotatable by redeploying the immutable-attestor contract. A production managed signer or user-issued authorization is future work.
- The product makes no tax, sanctions, AML, or legal-compliance guarantee.

## 11. Money and state invariants

- The frontend cannot credit or mark an invoice paid.
- Only a verified Arc event from the configured contract and chain can create a settlement.
- The unique settlement identity is chain ID + transaction hash + log index.
- Each invoice key can settle once.
- Exact payment only; partial payment, overpayment, and tips revert.
- Every accepted payment atomically forwards the full amount or reverts.
- The receipt references one immutable invoice version and one verified event.
- Money is represented as decimal strings and integer atomic units, never floating-point numbers.

## 12. Failure behavior

- Unknown client: return `CLIENT_NOT_FOUND` and a setup URL; create nothing.
- Missing/ambiguous data: return field errors; create nothing.
- Duplicate draft request: return the original result by idempotency key.
- Duplicate publish: return the existing link and commitment.
- Stale draft version: reject publication and return the latest draft.
- Expired/revoked connector: deny before revealing private data.
- Wrong chain: request an Arc network switch and do not submit.
- Insufficient wallet balance: show invoice value and estimated gas reserve separately.
- Invalid signature, wrong amount/payee/domain, expired authorization, replay, blocked address, or failed forwarding: transaction reverts and invoice remains unpaid.
- Submitted transaction with delayed database sync: verify the receipt in the client, show `confirming reconciliation`, and retry through the reconciler.
- A callback or claimed transaction hash never changes state without independent receipt and event verification.

## 13. Verification plan

### Unit and API tests

- Canonical serialization and stable salted commitment.
- Decimal parsing and 18-decimal atomic conversion.
- Required fields and profile ownership.
- Invoice state transitions and immutable publication.
- Connector scope, expiry, revocation, and response minimization.
- Draft/publish idempotency.
- Event parsing and duplicate-settlement suppression.

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
- Settle with real testnet USDC.
- Verify the emitted event, database record, paid state, receipt, recipient balance change, and explorer transaction.

This test is mandatory because standard local EVM simulators cannot reproduce all Arc-native behavior.[5]

### MCP and browser verification

- Exercise MCP initialize, tool discovery, draft, publish, and status through the deployed remote endpoint.
- Exercise the connector from Claude, not only a local MCP client.
- Visually inspect invoice, payment, and receipt pages at desktop and mobile widths.
- Exercise wrong network, rejected wallet action, reverted transaction, delayed reconciliation, and paid receipt.
- Run production typecheck, tests, and build before any completion claim.

## 14. Three-minute demo

- **0:00–0:20:** Keng states the firsthand pain: scattered client details, manual invoices, cross-border currency friction, and manual receipts.
- **0:20–0:55:** In Claude, request: "Invoice Acme 250 USDC for the September API milestone, due Friday." Show the complete draft created from saved profiles.
- **0:55–1:15:** Approve publication. Claude returns the hosted payment link.
- **1:15–2:00:** Open the link as the client, connect a pre-funded external wallet, and pay on Arc.
- **2:00–2:35:** Return to Claude and query status. Show Paid, the receipt, and explorer proof.
- **2:35–3:00:** Show one architecture diagram: private invoice offchain, salted commitment and settlement event onchain, USDC directly to the freelancer.

### Demo fallback

- Fund and test both wallets before the presentation; do not depend on a faucet.
- Keep one previously settled invoice backed by a real Arc transaction and explorer link.
- Keep a short recording of a successful real run.
- If a provider or network fails live, state the failure, then demonstrate reconciliation against the prior real transaction. Label prerecorded material as prerecorded.

## 15. Sponsor strategy

### Primary: Arc — Best DeFi/Onchain Finance Application

Arc asks for meaningful Arc/USDC use and favors conditional, automated, or multi-step settlement.[8] Payr qualifies as payment/fintech infrastructure only if the contract enforces exact invoice-bound terms and replay protection. A plain token transfer is not enough.

### Conditional secondary: Arc — Launch on Arc Testnet & Push to Mainnet

The From-Scratch prize accepts USDC commerce flows and agentic payments, but requires a working frontend/backend, architecture diagram, documentation, and mainnet deployment or deployment-readiness by 30 September 2026.[8]

Target this only if:

- the testnet vertical slice is stable by code freeze, and
- Keng explicitly commits post-submission time through 30 September.

Do not claim this target is complete merely because a testnet contract exists.

### Conditional tertiary: Bazantic — Agentify a New API

Payr's invoice API could be a new reusable agent service. Eligibility requires a Bazantic x402/MPP Gateway, a service not already available through Bazantic or another sponsor API, a working recipe, and a screen-recorded demonstration.[8]

Give Bazantic at most a one-hour spike after the core Arc journey passes. Keep it only if the gateway and recipe call the canonical Payr API without duplicating state or destabilizing Claude. Otherwise drop the track.

### Do not target: Privy — Best B2B Financial Product

Privy requires at least one Privy wallet and one control such as a policy, signer, quorum, or intent.[8] The approved design uses existing external wallets. Adding a Privy wallet only for eligibility would be sponsor collage.

### Do not target: Arc — Agentic Economy

Arc asks for autonomous agents that hold wallets, make payments, manage risk, or settle jobs using Circle Agent Stack.[8] Payr's agent creates invoices; a human client controls settlement. Describe Payr as an agent-native invoicing workflow, not an autonomous transacting agent.

### Ineligible: Arc — Best DeFi or Agentic Application

The combined prize is restricted to Continuity Track participants.[8] Payr is registered From Scratch.

## 16. Engineering budget

| Workstream | Hours |
| --- | ---: |
| Core data model and minimal setup UI | 7 |
| Invoice API, rendering, and portable agent skill | 8 |
| MCP adapter and Claude connector | 6 |
| Settlement contract, tests, and Arc deployment | 8 |
| Payment page, reconciliation, and receipt | 8 |
| Deployment, end-to-end hardening, demo assets, and buffer | 7 |
| **Total** | **44** |

Bazantic, if attempted, consumes at most one hour from the final seven-hour block. Privy and autonomous payer work have no allocation.

## 17. Leading risks and scope triggers

| Risk | Signal | Required response |
| --- | --- | --- |
| Claude remote connector authentication takes more than planned | No deployed authenticated draft call within the MCP block | Use the declared scoped testnet connector token; do not build full OAuth |
| Arc-native transfer behavior differs from local tests | First testnet settlement fails or units mismatch | Stop UI polish and fix/test the contract on Arc; never fake settlement |
| Document rendering consumes excessive time | Printable invoice is not ready after the rendering block | Ship restrained HTML with print CSS; defer generated PDF |
| Reconciliation is flaky | Paid event does not reliably become one ledger record | Make receipt polling/idempotency the priority; drop Bazantic and secondary UI |
| Bazantic duplicates the MCP layer | Requires a separate data model or agent UI | Drop Bazantic |
| Sponsor pressure expands personas | Autonomous payer or Privy wallet enters the critical path | Reject the feature and preserve the freelancer journey |
| Mainnet launch prize creates post-event obligations | No availability through 30 September | Do not submit for that prize |

## 18. Acceptance criteria

The MVP is complete only when all of the following have been exercised:

1. A deployed Claude custom connector discovers the Payr tools.
2. One prompt creates a complete draft from saved sender/client profiles.
3. Publication requires an explicit approval turn and returns the same link on retry.
4. The hosted link displays the frozen invoice and exact Arc USDC payment.
5. A real external wallet settles the invoice through the deployed Arc contract.
6. The contract rejects wrong value and replay attempts.
7. A verified event—not frontend state—marks the invoice paid.
8. Claude returns paid status, transaction proof, and a printable receipt.
9. Private invoice content is absent from contract calldata and events except for the salted commitment.
10. Production tests, typecheck, and build pass.
11. The complete live path fits under three minutes.
12. The repository, architecture diagram, demo, and written submission tell the same product story.

## 19. Decisions requiring no further implementation debate

- Primary user: freelancer, not accounts-payable team.
- Human client controls payment.
- Claude is the demo interface; Payr remains API/MCP-first.
- Saved profiles supply legal identity details; the prompt supplies work and commercial terms.
- Invoice contents stay offchain.
- Arc and USDC are the only settlement chain/asset in MVP.
- Settlement uses a minimal invoice-bound contract, not direct wallet transfer, escrow, or NFT issuance.
- The invoice is generic and makes no tax-compliance guarantee.
- Privy and Arc autonomous-agent tracks are excluded from the core build.

## 20. Remaining pre-implementation checks

These are verification tasks, not design decisions:

- Confirm the exact ETHOnline submission cutoff time and timezone from the authenticated event dashboard.
- Exercise the reported active Claude, Circle/Arc, Bazantic, and wallet accounts before depending on them.
- Confirm the Arc testnet RPC, explorer, chain ID, and faucet-funded balances from official current documentation.
- Verify whether the selected Arc mainnet-launch prize requires any additional registration outside the ETHGlobal submission.

## Sources

[1] https://ethglobal.com/events — ETHGlobal Events
[2] https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp — Claude custom connectors using remote MCP
[3] https://platform.claude.com/docs/en/agents-and-tools/mcp-connector — Claude MCP connector documentation
[5] https://docs.arc.io/arc/references/evm-differences.md — Arc EVM differences
[8] https://ethglobal.com/events/ethonline2026/prizes — ETHOnline 2026 prizes
