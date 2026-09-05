# Project Charter

## One-sentence product

Payr lets an independent developer ask an AI agent to create a complete invoice from saved profiles, approve it, and receive a client payment link that settles USDC on Arc and automatically produces a linked receipt.

## Target user

Independent software developers and freelancers billing international, crypto-native clients.

## Painful moment

After completing work, the freelancer must gather client details, format and check an invoice, provide payment instructions, monitor settlement, identify which invoice was paid, and issue a receipt. Unsupported bank currencies can make the proceeds slow or unusable.

## Core promise

One short prompt becomes a client-ready USDC invoice and payment link; one verified Arc payment becomes a paid status and tamper-evident receipt without manual reconciliation.

## Why Ethereum is necessary

The invoice document can be generated offchain, but Arc provides direct ownership of settled USDC plus neutral, independently inspectable proof binding the payment to an invoice commitment. The contract enforces exact amount, payee, expiry, and single settlement.

## Three-minute demo path

1. In Claude, ask Payr to invoice a saved client for completed work.
2. Review the complete draft generated from saved sender and client profiles.
3. Explicitly approve publication and receive an opaque payment link.
4. Open the link as the client and connect a pre-funded external wallet.
5. Pay exact native USDC through the Payr settlement contract on Arc.
6. Return to Claude and retrieve Paid status, receipt, and explorer proof.
7. Show the private-offchain/onchain-settlement architecture diagram.

## Success criteria

- A first-time viewer understands the problem and outcome without a long explanation.
- One prompt creates a complete draft in under 30 seconds under normal service conditions.
- The core flow runs end to end through the deployed Claude connector and Arc contract.
- Paid state is caused only by a verified settlement event.
- Invoice contents remain private; only a salted commitment and settlement metadata are public.
- Wrong-value and replay payments are rejected.
- The live journey fits under three minutes and has a fallback backed by a prior real transaction.
- The repository, deployment, architecture diagram, video, and submission tell the same story.

## Sponsor strategy

- Primary: Arc — Best DeFi/Onchain Finance Application.
- Conditional: Arc — Launch on Arc Testnet & Push to Mainnet, only with availability through 30 September.
- Conditional: Bazantic — Agentify a New API, only after a one-hour integration spike succeeds.
- Excluded: Privy B2B, Arc Agentic Economy, and Continuity-only Arc prizes.

## Non-goals

- Autonomous payer custody or agent-controlled spending.
- Multiple primary personas, chains, stablecoins, or payment methods.
- Fiat/card onboarding.
- Tax calculation or jurisdiction-specific compliance.
- Escrow, disputes, partial payments, reminders, accounting exports, and automated email delivery.
- Public invoice contents, invoice NFTs, or project tokens.
- Sponsor integrations that do not improve the freelancer journey.

## Constraints

- Event window: 4–16 September 2026; exact submission cutoff time/timezone still requires dashboard verification.
- Team: Keng is product owner and sole engineer; Chanita owns administration and presentation.
- Focused availability: 12–4 PM daily.
- Engineering budget: approximately 44 focused hours from 4–14 September.
- Code freeze: 15 September.
- Deployment: web application plus remote MCP endpoint and Arc contract.
- Document scope: generic commercial invoice/payment request, not a tax-compliance product.

## Source of truth

The approved design and acceptance criteria are in `docs/superpowers/specs/2026-09-04-payr-framing-design.md`.
