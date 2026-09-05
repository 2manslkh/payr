# Project Charter

## One-sentence product

Payr lets an independent developer tell an AI agent whom to invoice, what for, and how much; Payr assembles the confirmed invoice, PDF, and payment link, while verified Arc USDC settlement automatically produces and emails a linked receipt.

## Target user

Independent software developers and freelancers billing international, crypto-native clients.

## Painful moment

After completing work, the freelancer must gather client details, format and check an invoice, provide payment instructions, monitor settlement, identify which invoice was paid, and issue a receipt. Unsupported bank currencies can make the proceeds slow or unusable.

## Core promise

One short instruction becomes a confirmed USDC invoice, protected payment link, downloadable PDF, QR code, and email-ready package; one verified Arc payment becomes paid status plus a receipt page/PDF delivered to both parties.

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
- Unsourced or automatically accepted web-search data.
- Guaranteed Gmail PDF attachment; protected links are the required delivery path.
- Sponsor integrations that do not improve the freelancer journey.

## Constraints

- Event window: 4–16 September 2026; exact submission cutoff time/timezone still requires dashboard verification.
- Team: Keng is product owner and sole engineer; Chanita owns administration and presentation.
- Focused availability: 12–4 PM daily.
- Engineering budget: approximately 44 focused hours from 4–14 September.
- Code freeze: 15 September.
- Deployment: web application plus remote MCP endpoint and Arc contract.
- Canonical public domain: `https://payrlink.xyz`; DNS/TLS and Resend sender verification must pass before it is used in the demo.
- Document scope: generic commercial invoice/payment request, not a tax-compliance product.

## Source of truth

The approved design and acceptance criteria are in `docs/superpowers/specs/2026-09-04-payr-framing-design.md`.
