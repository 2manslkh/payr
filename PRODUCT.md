# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent developers and freelancers billing international, crypto-native clients. The freelancer manages invoicing; the client explicitly approves payment in their own wallet.

## Product Purpose

Connect confirmed work, protected invoices, and invoice-bound USDC settlement proof. The full vision adds agent-driven invoice creation and automatic linked receipt delivery.

## Capabilities and Constraints

`PROJECT.md` remains the authoritative charter and source-precedence guide. Consult `docs/ops/r07-settlement.md` and `docs/ops/landing-release.md` for this release's implementation evidence rather than treating the vision as shipped behavior.

This landing-only release is based on v1.0.0. Protected invoice publication, PDFs, settlement authorization, and the recorded operator-payment flow are implemented. Client wallet payments and automatic reconciliation belong to separate unreleased work and are labeled upcoming here. Claude MCP, receipt rendering, and receipt-email workers remain unfinished. Authoring is currently API-first.

Connecting a wallet does not authorize payment. A transaction hash is not proof of Paid. Settlement verification must match the frozen invoice facts. Invoice contents remain private; settlement metadata does not prove genuine commerce or legal identity.

## Brand Commitments

Preserve the approved Payr wordmark, current theme, and currently rendered typography. `DESIGN.md` owns the visual rules. The user approved public use of the existing navy-and-white cat in a small supporting role on the landing page on 8 September 2026.

## Evidence on Hand

- `PROJECT.md`: users, intended workflow, constraints, and non-goals.
- `docs/ops/r07-settlement.md`: dated settlement authorization and operator-payment evidence and limitations.
- `assets/brand/source/mascot.png`: user-approved supporting character reference; do not invent its original generation provenance.
- `public/brand/payr-mark-v2.png`: approved production mark.

## Accessibility & Inclusion

Keep the explanatory content and sign-in action usable without JavaScript or WebGL. Respect reduced-motion preferences, keyboard access, visible focus, readable contrast, and mobile layouts.
