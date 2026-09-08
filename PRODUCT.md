# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent developers and freelancers billing international, crypto-native clients. The freelancer manages invoicing; the client explicitly approves payment in their own wallet.

## Product Purpose

Connect confirmed work, protected invoices, and invoice-bound USDC settlement proof. The full vision adds agent-driven invoice creation and automatic linked receipt delivery.

## Capabilities and Constraints

`PROJECT.md` remains the authoritative charter and source-precedence guide. Consult `docs/ops/r07-settlement.md`, `docs/ops/landing-release.md`, and `docs/ops/r08-receipts-delivery.md` for dated implementation evidence rather than treating the vision as shipped behavior.

The integrated R08 candidate preserves the v1.1.0 landing page and reviewed v1.0.0 fixes. Protected publication/PDFs, settlement authorization/reconciliation, receipt rendering, and receipt-email workers are implemented. One scoped operator receipt email is verified; production-wide email remains disabled. Client wallet UI and Claude MCP remain separate R09 work. Authoring is currently API-first. Landing illustrations describe the broader workflow and are not live account evidence.

The user confirmed that protected receipts show exact settled amount, invoice reference, payer/payee, transaction/block evidence, hashes, QR, and PDF download. Contact addresses and delivery-recipient details stay private. Receipt and delivery completion require verified artifacts and provider evidence, not payment submission alone.

Connecting a wallet does not authorize payment. A transaction hash is not proof of Paid. Settlement verification must match the frozen invoice facts. Invoice contents remain private; settlement metadata does not prove genuine commerce or legal identity.

## Brand Commitments

Preserve the approved Payr wordmark, current theme, and currently rendered typography. `DESIGN.md` owns the visual rules. The user approved public use of the existing navy-and-white cat in a small supporting role on the landing page on 8 September 2026.

Preserve Commit Ledger on protected documents. The receipt has no dashboard chrome and is not a product redesign.

## Evidence on Hand

- `PROJECT.md`: users, intended workflow, constraints, and non-goals.
- `docs/ops/r07-settlement.md`: dated settlement authorization and operator-payment evidence and limitations.
- `assets/brand/source/mascot.png`: user-approved supporting character reference; do not invent its original generation provenance.
- `public/brand/payr-mark-v2.png`: approved production mark.

## Accessibility & Inclusion

Keep the explanatory content and sign-in action usable without JavaScript or WebGL. Respect reduced-motion preferences, keyboard access, visible focus, readable contrast, and mobile layouts.
Protected document controls preserve 44px targets, semantic status text, and WCAG AA contrast.
