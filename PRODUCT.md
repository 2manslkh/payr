# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent developers and freelancers billing international, crypto-native clients. The freelancer manages invoicing; the client explicitly approves payment in their own wallet.

## Product Purpose

Connect agent-driven invoice creation, protected documents, invoice-bound USDC settlement proof, and linked receipt delivery. Live acceptance and operator-mode limits remain distinct from implemented capabilities.

## Capabilities and Constraints

`PROJECT.md` remains the authoritative charter and source-precedence guide. Consult `STATUS.md`, `docs/ops/r09-release.md`, and the separately dated R07/R08 records for current capabilities and evidence limits.

The repository baseline on `main` is `v1.4.1` at `923ef3f` (PR #14 merged), not a new deployment-evidence claim. The separately recorded R09 `v1.3.0` release includes protected publication/PDFs, client wallet payments, settlement authorization/reconciliation, receipt rendering, durable receipt-email workers, and the four-tool stateless Claude MCP endpoint. MCP uses canonical draft/publication/status/void services; there is no browser invoice editor. One scoped operator receipt email is verified; production-wide email remains disabled. Deployed Claude and full external-wallet rehearsals, human inbox opening, and unattended delivery remain unproven. Landing illustrations are not live account evidence.

Root dashboard balance/count improvements, the public `/install` guide, and docs follow-up are being integrated on `integration/root-updates` alongside its unique discovery/roadmap commits, through approved feature-group commits and one combined PR into `main`. They are not already released or deployed; final integration tests and PR results are not yet claimed. The guide's separate plugin prompt stays disabled until reviewed distribution metadata exists; that does not mean the released MCP endpoint is unavailable. `docs/ops/dashboard.md` records all eleven migrations applied/read back locally and on hosted Payr, not application deployment. `docs/ops/repository-cleanup.md` preserves the historical cleanup checkpoint with a current integration note.

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
