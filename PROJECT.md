# Project Charter

## One-sentence product

Payr lets an independent developer tell an AI agent whom to invoice, what for, and how much; Payr assembles the confirmed invoice, PDF, and payment link, while verified Arc USDC settlement automatically produces and emails a linked receipt.

## Target user

Independent software developers and freelancers billing international, crypto-native clients.

## Painful moment

After completing work, the freelancer must gather client details, format and check an invoice, provide payment instructions, monitor settlement, identify which invoice was paid, and issue a receipt. Unsupported bank currencies can make the proceeds slow or unusable.

## Core promise

One short instruction becomes a confirmed USDC invoice, protected payment link, downloadable PDF, QR code, and email-ready package; one verified Arc payment becomes paid status plus a receipt page/PDF delivered to both parties.

## Product surfaces

- Claude is the primary invoice creation, revision, publication, status, and voiding interface.
- The authenticated web app is an operations companion for setup, clients, connector credentials, an overview, an invoice ledger, immutable invoice detail, redacted activity, and settlement/receipt proof. It does not duplicate invoice authoring.
- The protected client surface presents the invoice, exact payment review, wallet-controlled Arc transaction, settlement progression, and receipt without requiring a Payr account.
- Incoming Bills are a future product direction. They remain hidden from MVP navigation and add no batch or autonomous payment behavior.

## Experience direction

`Commit Ledger` is the approved design direction. Payr uses a cool, document-led workspace with restrained typography, aligned financial figures, shallow navigation, and concentrated deep-navy proof regions. The interface always presents commercial lifecycle and payment evidence as separate facts. The existing arrow-R monogram remains; the production wordmark is standardized as `Payr`.

The durable visual rules are recorded in `DESIGN.md`. Surface-specific behavior and acceptance criteria remain in the approved framing design and implementation plan.

## Why Ethereum is necessary

The invoice document can be generated offchain, but Arc provides direct ownership of settled USDC plus neutral, independently inspectable proof binding the payment to an invoice commitment. The contract enforces exact amount, payee, expiry, and single settlement.

## Three-minute demo path

1. In Claude, ask Payr to invoice a saved client for completed work.
2. Review the complete draft generated from confirmed profiles and visibly applied saved payment terms.
3. Explicitly approve publication and receive an immutable invoice number, `https://payrlink.xyz/invoice/<high-entropy-slug>` payment link, PDF, and QR code.
4. If the Gmail smoke test is stable, separately approve the prepared Gmail message; otherwise open the returned link directly.
5. Open the link as the client and connect a pre-funded external wallet.
6. Press Pay Now, obtain a short-lived policy-controlled authorization, and pay exact native USDC through the Payr contract on Arc.
7. Show event-verified Paid state, receipt PDF, Resend receipt email, and explorer proof.
8. Show the private-document/policy-attestation/onchain-settlement architecture diagram.

## Success criteria

- A first-time viewer understands the problem and outcome without a long explanation.
- One instruction creates a complete draft from confirmed profiles and saved defaults.
- The core flow runs end to end through the deployed Claude connector and Arc contract.
- Paid state is caused only by a verified settlement event.
- Invoice contents remain private; only a salted commitment and settlement metadata are public.
- Wrong-value, expired-authorization, and replay payments are rejected.
- Payr generates and verifies the invoice PDF/QR and receipt PDF.
- Payr performs one idempotent logical Resend receipt dispatch per confirmed party and records provider message IDs.
- The live journey fits under three minutes and has a fallback backed by a prior real transaction.
- The repository, deployment, architecture diagram, video, and submission tell the same story.

## Sponsor strategy

- Primary: Arc — Best DeFi/Onchain Finance Application.
- Conditional: Privy — Best B2B Financial Product, only if an early policy allow/deny and contract-verification spike passes.
- Conditional: Arc — Launch on Arc Testnet & Push to Mainnet, only with availability through 30 September.
- Conditional: Bazantic — Agentify a New API, only after a one-hour integration spike succeeds.
- Excluded: Arc Agentic Economy and Continuity-only Arc prizes.

## Non-goals

- Autonomous payer custody or agent-controlled spending.
- Multiple primary personas, chains, stablecoins, or payment methods.
- Fiat/card onboarding.
- Tax calculation or jurisdiction-specific compliance.
- Escrow, disputes, partial payments, reminders, accounting exports, and Payr-sent initial invoice emails.
- Public invoice contents, invoice NFTs, or project tokens.
- Dual-party EIP-712 invoice signatures.
- Agent changes to sender identity or payout wallet.
- Direct browser invoice authoring in the MVP.
- Incoming Bills, batch payment, or autonomous accounts-payable workflows in the MVP.
- Unsourced or automatically accepted web-search data.
- Guaranteed Gmail PDF attachment; protected links are the required delivery path.
- Sponsor integrations that do not improve the freelancer journey.

## Constraints

- Event window: 4–16 September 2026; exact submission cutoff time/timezone still requires dashboard verification.
- Team: Keng is product owner and sole human operator; scoped implementation agents work under Keng's review, while Chanita owns administration and presentation.
- Focused availability: 12–4 PM daily.
- Engineering budget: approximately 44 focused hours from 4–14 September.
- Code freeze: 15 September.
- Deployment: web application plus remote MCP endpoint and Arc contract.
- Canonical public domain: `https://payrlink.xyz`; DNS/TLS and Resend sender verification must pass before it is used in the demo.
- Document scope: generic commercial invoice/payment request, not a tax-compliance product.

## Source of truth

Newer dated entries in `DECISIONS.md` record explicit overrides. This charter owns product scope and non-goals; `docs/superpowers/specs/2026-09-04-payr-framing-design.md` owns behavior and acceptance criteria; `DESIGN.md` owns the visual contract; the implementation plan owns technical decomposition; and the orchestration plan owns worktree, integration, and release mechanics. Conflicts are reconciled in those documents before implementation continues.
