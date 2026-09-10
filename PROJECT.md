# Project Charter

## Current Candidate: 10 September 2026

The approved reconciliation targets a breaking `v2.0.0` release without declaring
it released or deployed. The 10 September `DECISIONS.md` entry supersedes older
separate-Gmail and no-initial-email scope. Retain Privy onboarding/receiving-wallet
discovery and the newer dashboard login/MCP guide; archive the optional direct-MCP
plugin outside the active product. Execution and evidence boundaries are in
`docs/ops/reconciliation-v2.md`; dated source results do not replace fresh CI.

## One-sentence product

Payr lets an independent developer tell an AI agent whom to invoice, what for, and how much; after explicit Publish & Send approval, Payr publishes the frozen invoice and emails its PDF and private links, while verified Arc USDC settlement produces a linked receipt with separately gated receipt delivery.

## Target user

Independent software developers and freelancers billing international, crypto-native clients.

## Painful moment

After completing work, the freelancer must gather client details, format and check an invoice, provide payment instructions, monitor settlement, identify which invoice was paid, and issue a receipt. Unsupported bank currencies can make the proceeds slow or unusable.

## Core promise

One short instruction becomes a reviewed USDC invoice; explicit approval of publication and delivery produces a protected payment link, frozen PDF/QR and one initial email per distinct confirmed client/issuer address. One verified Arc payment becomes paid status plus a receipt page/PDF, with receipt email independently enabled and verified.

## Product surfaces

- A compatible, verified MCP client is the primary invoice creation/revision interface; Claude is the target demo client. Use actual discovered tools: the recorded public gateway has eleven Payr operations, with neither account context nor void. The local twelve-operation upstream adds context, not void; direct MCP retains void.
- The authenticated web app is an operations companion for setup, clients, connector credentials, an overview, an invoice ledger, immutable invoice detail, redacted activity, and settlement/receipt proof. It does not duplicate invoice authoring.
- The protected client surface presents the invoice, exact payment review, wallet-controlled Arc transaction, settlement progression, and receipt without requiring a Payr account.
- Incoming Bills are a future product direction. They remain hidden from MVP navigation and add no batch or autonomous payment behavior.

Privy provides user-owned receiving-wallet onboarding, not payment signing or
agent spending. Existing workspace/profile/payout/invoice/credential bindings must
survive linking. `docs/ops/privy-onboarding.md` preserves deployed-snapshot evidence
and the still-open live ownership/linking/policy-denial gates. The MCP guide must
separate public discovery from private workspace access: per-user credential
injection into generated MCP is unverified, and secrets never belong in chat.

## Experience direction

`Commit Ledger` is the approved design direction. Payr uses a cool, document-led workspace with restrained typography, aligned financial figures, shallow navigation, and concentrated deep-navy proof regions. The interface always presents commercial lifecycle and payment evidence as separate facts. The existing arrow-R monogram remains; the production wordmark is standardized as `Payr`.

The durable visual rules are recorded in `DESIGN.md`. Surface-specific behavior and acceptance criteria remain in the approved framing design and implementation plan.

## Future credit and lending

After the invoicing MVP, extend invoice-bound settlement into DeFi marketplaces, including escrow where a validated marketplace use case needs it. With user consent, accumulated invoice settlement history can become one input to a credit assessment and eventually undercollateralized USDC lending using suitable Circle/Arc infrastructure. These are future capabilities, not current MVP or sponsor-integration claims.

Settlement proves a transfer, not genuine commerce or repayment capacity. Credit work must address identity, self-payment and collusion resistance, counterparty concentration, unpaid obligations, defaults, and privacy before assigning scores or lending. Lending also requires validated underwriting, capital/risk ownership, applicable legal review, and verification of the actual Circle products or lending protocols to integrate. Keep raw invoice contents private; do not publish borrower scores or add lending/escrow tables to the current build.

## Why Ethereum is necessary

The invoice document can be generated offchain, but Arc provides direct ownership of settled USDC plus neutral, independently inspectable proof binding the payment to an invoice commitment. The contract enforces exact amount, payee, expiry, and single settlement.

## Three-minute demo path

1. In Claude, ask Payr to invoice a saved client for completed work.
2. Review the complete draft generated from confirmed profiles and visibly applied saved payment terms.
3. Review the exact version, defaults, client changes and both recipient addresses; approve Publish & Send with `approval:true` and `deliveryApproval:true`. Receive an immutable number, private payment link, frozen PDF and QR.
4. Inspect Payr's initial invoice emails and attachments with separately approved real recipients. Equal normalized addresses get one combined-role message. Provider acceptance is not inbox delivery; do not send a duplicate through Gmail. Disabled invoice email blocks fresh publication.
5. Open the link as the client and connect a pre-funded external wallet.
6. Press Pay Now, obtain a short-lived authorization from the guarded local-testnet attestor (not the Privy receiving wallet), and pay exact native USDC through the Payr contract on Arc Testnet.
7. Show event-verified Paid state, receipt PDF, Resend receipt email, and explorer proof.
8. Show the private-document/policy-attestation/onchain-settlement architecture diagram in `docs/architecture.excalidraw.svg`, with planned capabilities visibly separated from deployed behavior.

The diagram is user-owned and in progress alongside implementation. Record the final 2-4 minute submission video only after the deployed core product flow is complete, then rehearse, upload, and verify it before the submission deadline. Script and presentation preparation may happen earlier.

## Success criteria

- A first-time viewer understands the problem and outcome without a long explanation.
- One instruction creates a complete draft from confirmed profiles and saved defaults.
- The core flow runs end to end through the deployed Claude connector and Arc contract.
- Paid state is caused only by a verified settlement event.
- Invoice contents remain private; only a salted commitment and settlement metadata are public.
- Wrong-value, expired-authorization, and replay payments are rejected.
- Payr generates and verifies the invoice PDF/QR and receipt PDF.
- New publication requires both literal approvals before reservation and queues only the frozen recipients/PDF/private links. Authorized finalized legacy no-send replay is read-only; it never backfills mail or grants new send approval.
- Initial email, verified payment and receipt proof are core acceptance. A disabled-email or link-only fallback may illustrate retained evidence but cannot pass the fresh Publish & Send journey. Receipt enablement remains a separate operator gate.
- Payr performs one idempotent logical Resend receipt dispatch per confirmed party and records provider message IDs.
- The live journey fits under three minutes and has a fallback backed by a prior real transaction.
- The repository, deployment, architecture diagram, video, and submission tell the same story.

## Sponsor strategy

- Primary: Arc — Best DeFi/Onchain Finance Application.
- Conditional prize claim: Privy, Best B2B Financial Product. User-owned receiving-wallet onboarding is selected core scope; live ownership/linking and genuine receiving-policy denial must pass before claims. It does not replace the payment attestor.
- Additional target: Arc — Launch on Arc Testnet & Push to Mainnet, with one-click mainnet deployment-readiness due 30 September 2026. Eligibility and completion depend on demonstrated readiness, not this commitment alone; see `docs/ops/mainnet-readiness.md`.
- Conditional prize claim: Bazantic, Agentify a New API. Preserve the dated HTTP gateway proof, but generated-MCP private authentication, client acceptance and prize qualification remain unverified.
- Excluded: Arc Agentic Economy and Continuity-only Arc prizes.

## Non-goals

- Autonomous payer custody or agent-controlled spending.
- Multiple primary personas, chains, stablecoins, or payment methods.
- Fiat/card onboarding.
- Tax calculation or jurisdiction-specific compliance.
- Escrow, disputes, partial payments, reminders, accounting exports, and arbitrary agent email. Payr-sent initial invoice email is required within the approved Publish & Send boundary.
- Public invoice contents, invoice NFTs, or project tokens.
- Dual-party EIP-712 invoice signatures.
- Agent changes to the payout wallet, or sender changes without explicit approval and opt-in sender scopes. Direct Chat Setup for sender business/contact/address, prefix and default terms is approved by the 9 September 2026 decision.
- Direct browser invoice authoring in the MVP.
- Incoming Bills, batch payment, or autonomous accounts-payable workflows in the MVP.
- Unsourced or automatically accepted web-search data.
- A separate Gmail delivery workflow or optional plugin distribution. Payr's approved initial email attaches the frozen PDF and includes protected links.
- Sponsor integrations that do not improve the freelancer journey.
- Credit scoring, lending, and marketplace escrow in the submission MVP; these remain the future roadmap above.

## Constraints

- Event window: 4–16 September 2026. The official submission deadline is **13 September 2026, 12:00 EDT / 16:00 UTC**; event end is not submission cutoff. Source: https://ethglobal.com/events/ethonline2026/info/details (checked 6 September). Cross-check the authenticated dashboard; any discrepancy uses the earlier cutoff until resolved.
- Team: Keng is product owner and sole human operator; scoped implementation agents work under Keng's review, while Chanita owns administration and presentation.
- Focused availability: 12–4 PM daily.
- Engineering budget: the original 44-hour estimate is historical, not remaining availability. Re-estimate remaining work against the dated gates in the implementation plan, including operator work, reviews, and integration; do not assume extra human hours from agent parallelism.
- Feature freeze: **11 September 2026, 23:59 UTC**. Final deployed proof, video, and rehearsals: **12 September**. Reserve two hours of core-blocker contingency before the internal submission target of **13 September, 14:00 UTC**, leaving two hours before the official cutoff.
- Deployment: web application plus remote MCP endpoint and Arc contract.
- Canonical public domain: `https://payrlink.xyz`; DNS/TLS and Resend sender verification must pass before it is used in the demo.
- Document scope: generic commercial invoice/payment request, not a tax-compliance product.
- Post-submission milestone: one protected action deploys the reviewed contract and application configuration to a provisioned mainnet environment, with verification and fail-closed gates, by **30 September 2026**. This is a separate readiness deliverable, not permission to broadcast mainnet transactions now or extend the MVP submission deadline.

## Source of truth

Newer dated entries in `DECISIONS.md` record explicit overrides. This charter owns product scope and non-goals; `docs/superpowers/specs/2026-09-04-payr-framing-design.md` owns behavior and acceptance criteria; `DESIGN.md` owns the visual contract; the implementation plan owns technical decomposition; and the orchestration plan owns worktree, integration, and release mechanics. Conflicts are reconciled in those documents before implementation continues.
