# R08 Receipts And Delivery

Updated 8 September 2026. R08 implements reconciliation, immutable receipts, durable delivery, and protected proof UI. Its original base is `v0.6.0` / `0d122231b0252f587a59868022b65dea83f6d525`. The user approved integrating the subsequently released `v1.1.0` baseline and targeting `v1.2.0`; integrated release gates and tagging are still pending at this checkpoint.

## Scope And Isolation

- Authoritative implementation: `.worktrees/r08-reconciliation`, branch `integration/r08-reconciliation`. Implementation was sequential; no implementation-agent fanout occurred. Read-only specification, security, and standards reviewers checked the changes.
- `.worktrees/r08-deployment` is a separately approved production snapshot combining R08 with selected existing wallet UI. Those wallet-only files and dependencies are not R08 release scope. Shared-root work and the user-owned diagram are not overwritten.
- The retained demo database at API `57321` / DB `58322` is not a fixture target. Focused tests use `payr-r08-first-slice` at API `57421` / DB `58422`. Full DB/browser gates use the private Docker daemon in `payr-r08-release-20260908`, without host mounts or published ports.
- Environment files, bearer URLs, provider IDs, payment recovery records, and operator journals stay private and untracked. No payment or send approval is reusable.

## Worker Contracts

Reconciliation uses one verifier for immediate and backfill calls. Raw candidates cannot be silently dropped by strict ABI decoding. Verified-prefix block/log CAS checkpoints, bounded time/event/range budgets, retained-contract fairness, and independent contract failure handling are described in the historical [first-slice record](r08-reconciliation.md) and the dated decision. Settlement, receipt identity, and deduplicated logical delivery creation remain one service-only transaction.

Migrations `202609040006_payment_reconciliation.sql`, `202609040007_reconciliation_positions.sql`, and `202609040008_receipt_outbox_workers.sql` supply the persisted R08 contracts. Forward migration `202609080002_receipt_retry_jitter.sql` follows current main's reviewed retry policy without changing applied `008` or worker RPC signatures. Receipt and outbox DTOs are strict, repository boundaries are service-only, and workers use fenced claims and bounded I/O.

- Receipt creation reads frozen invoice and settlement facts, renders one restrained Commit Ledger document, and uses create-only private storage at `workspace/<workspaceId>/receipt/<receiptId>.pdf`. A collision is read and verified, never overwritten. Stored bytes, exact material facts, content hash, and raster-decoded QR are checked before readiness. Protected PDF reads verify bytes and revalidate access after download.
- Receipt bearer purpose, key version, verifier, activation, expiry, and revocation are independent of the original invoice bearer. Owner receipt reveal survives retirement of an expired/revoked original invoice key. Missing live keys still fail closed; no active-key substitution is allowed.
- Delivery requires a ready verified receipt. Normalized issuer/client addresses are deduplicated into one logical row retaining both roles when equal. No new recipient is inferred from mutable profile data.
- Before provider I/O, SQL durably binds the canonical payload SHA-256, stable provider idempotency key, request marker, and immutable first-attempt time. The payload includes exact recipient, sender, subject, text, HTML, and base64 attachment bytes. Receipt email retries do not regenerate an original invoice link.
- Dispatch converts DB-relative lease and ambiguity-window budget to a monotonic deadline anchored before the marker RPC. The RPC round trip and serialization consume the budget. Five-second lease and thirty-second ambiguity margins prevent starting work too near a boundary; provider requests have bounded abort signals.
- Rate limits and retryable failures use capped exponential backoff with jitter: sample between half and all of `min(30s * 2^attempt, 30m)` and persist once in the winning fenced transition. Injected samples test both exact bounds. Ambiguous outcomes reuse the original key only inside the original 24-hour window; uncertainty at/after the cutoff requires manual review, never a fresh automatic send. Changed payloads cannot reuse the row as a different logical request. `sent` means provider acceptance, not inbox placement or human reading.
- Keep the provider account, sender identity, canonical origin, and required receipt keys stable across pending retries. Do not clear request markers, replace idempotency keys, reset first-attempt time, or manually requeue sent/ambiguous work to force progress.

Worker implementations and types are in `src/lib/payments/reconciliation-contracts.ts`, `src/lib/receipts/`, `src/lib/email/outbox-contracts.ts`, and the corresponding repositories. F5 is recorded in `docs/superpowers/freezes/2026-09-08-f5-settlement-workers.md`; the implementation commit is its freeze boundary, not an earlier uncommitted first slice.

## Protected Surfaces

The receipt page/PDF shows exact settled amount, invoice reference/version, payer/payee, transaction/block facts, document hashes, and receipt QR. It has no dashboard chrome, billing addresses, or delivery-recipient details. Private headers, nonce CSP, no-referrer links, and uniform admission apply to HTML/PDF/RSC/prefetch.

Owner initial HTML/RSC receives an allowlisted settlement/receipt/delivery summary, not bearer credentials, recipient rows, or provider IDs. Receipt links require an explicit authenticated reveal. Copy, hide, navigation, and refresh clear shown credentials; hiding during a pending clipboard write restores focus and ignores late completion. Clipboard contents cannot be revoked by hiding the UI. Commercial expiry and settlement-derived Paid remain independent. Activity exposes redacted outcomes only.

Native PDF imports are opaque to tracing. `next.config.ts` explicitly includes worker resources for publication, receipt, outbox, and receipt-page entry points; `scripts/check-function-traces.mjs` asserts all five entries contain PDF.js, fonts, QR decoder, and native canvas dependencies. This repaired an observed hosted receipt failure without replacing already stored bytes.

## Hosted Evidence

All operations below were separately approved and scoped. This evidence does not authorize new sends, broad queue draining, or another payment.

- Hosted project `grutkfsoekcpwdksgasm` was verified before migration application; migration `008` was applied and the `001`-`008` list read back. No hosted reset/seed was used. Already applied SQL must be repaired with a new migration, not edited in place.
- Original `DEMO-2026-000001` and its frozen facts remain intact. Its original payment is `0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f`, block `60875360`, log `507`. Its frozen issuer address is non-deliverable, so the user approved a new fixture rather than rewriting it.
- New invoice `DEMO-2026-000002`, version 1, paid `0.01` testnet USDC in transaction `0x642b74188f1fc2fe2227038cb41fc3ef2fd076e8dbf4591f2fe4e1d660b31dea`, Arc Testnet `5042002`, block `61029025`, log `32`, block time `2026-09-08 05:49:23 UTC`. The contract is `0x21bf4df6beb22edb1a71f6dc7b92ffbab122a49a`. Payment approval is consumed.
- Reconciliation replay retained one settlement, one ready receipt, and one logical delivery to the approved same-address issuer/client recipient, preserving roles `["issuer", "client"]`.
- The immutable receipt is **18,865 bytes**, hash `0x75fb2fd4e7cb11614f16467a12f08c1e3e9fcae61ed849e681e76ace94e3f817`. Deployed HTML/PDF and decoded receipt QR were read back after the tracing repair. Storage and protected HTTP use `application/pdf`.
- Verified combined deployment: `dpl_Ave3eaQRB2L4YzTwk4LBiHN9zNFS`, `https://payr-9awa89vke-kenks-projects.vercel.app`, alias `https://payrlink.xyz`. This is a pre-release observation, not proof that later review fixes or subsequent releases are deployed.
- One approved receipt email was sent from `Payr <receipts@noreply.payrlink.xyz>`, subject `Payment Confirmed: DEMO-2026-000002`, attachment `receipt-DEMO-2026-000002-v1.pdf`. Resend reported `delivered`; text/HTML and downloaded attachment bytes matched the approved canonical payload hash `c6f9e9de92459531b51f97a72b052320527bf194ada787a19af9881575c832ba`.
- Resend labels its attachment metadata `application/octet-stream`; its signed CDN download returned HTTP 200 and the exact 18,865-byte PDF/hash above. This is byte-verified PDF delivery, not a claim that the provider declared PDF MIME or that a human opened their inbox.
- The final read-only recovery performed **zero provider POSTs**. A subsequent worker invocation did not initiate another send; one logical delivery remained `sent`. Do not send this fixture again.

## Operator Mode

Production `PAYR_RECEIPT_EMAIL_ENABLED=false` remains intentional. The one scoped operator send is not approval to enable automatic delivery or drain other pending rows. `vercel.json` schedules daily reconciliation, receipt, and outbox calls at 00:00, 00:05, and 00:10 UTC, respectively; configuration alone is not evidence of observed scheduling.

The explicit fallback is operator mode. `scripts/run-workers.ts` invokes reconciliation, then bounded receipt work, then bounded outbox work using `CRON_SECRET` from the process environment. It prints only allowlisted outcomes/IDs/counts. This generic runner can process unrelated queued work, so review scope and obtain approval before any send-enabled invocation. A disabled outbox returns `disabled` without provider I/O. Do not present this checkpoint as unattended end-to-end operation.

Before widening delivery, inspect ready receipts, normalized recipient roles, unresolved request markers, retry windows, and manual-review rows; verify sender/account configuration; obtain explicit batch approval. A missing provider response does not prove no email was accepted. Use authoritative provider read-back and the original persisted identity before deciding recovery.

## Verification And Release

Pre-integration R08 evidence: 1,814 unit tests (13 skipped), 10 release-tool tests, production build and dependency tracing; 35 compiled-document tests passed on the isolated package rerun; all 46 desktop/mobile browser tests passed. One full verification run hit the existing 45-second worker deadline on the 18-page invoice package fixture; an unchanged isolated rerun passed. The timeout remains an intermittent resource/performance risk, not a waived gate or a proven root cause.

Focused real receipt SQL/Storage/outbox tests cover artifact collision/read-back, concurrent claims, stale fences, deduplicated roles, ambiguity boundaries, retry payload identity after invoice-key retirement, and redacted audit outcomes. Final integrated full DB counts and current-source release results must be recorded after merging `v1.1.0`; earlier first-slice counts are historical.

Fresh reviewers found effective-expiry projection, owner receipt retrieval after old-key retirement, and Hide-during-copy focus issues. All were reproduced by failing tests, fixed, and re-reviewed; **139 focused tests passed**. Integrated gates, protected PR checks, merge, annotated tag, and post-merge CI are not yet claimed here.

R08 implementation was committed atomically as `7f36510`; current main was merged as `9581c5b`, retaining `v1.1.0` landing and `v1.0.0` reviewed fixes. Product/status conflicts preserve both intents. Typecheck and 1,782 non-PDF unit tests passed after merge. The retry-policy difference required forward migration `202609080002`; its deterministic sample/bounds/cap/privilege regression failed before implementation, then all 12 outbox and 5 receipt SQL/Storage tests and SQL lint passed in the disposable focused profile. Publication fairness and retry jitter migrations are included in integrated local verification but their hosted application is not claimed.

Release strategy: preserve R08 atomically, merge current `main` without dropping its reviewed sender-save/publication fixes or landing page, rerun disposable DB/browser and complete verification, then prepare the required version-only final commit. Use merge-commit PR integration and immutable CI-created tags. Forward-fix any post-release defect with a new release; do not rewrite tags or deployed migrations.

### Integrated Gate Read-Back

The complete private-runner gate passed at source `492274f`, from `2026-09-08 09:04:25 UTC` to `09:12:14 UTC`: frozen dependency install, DB start/reset applying all ten migrations, SQL lint, **462 DB tests across 12 files**, complete `pnpm verify` (**1,832 unit/PDF tests**, 13 skips, 10 release-tool tests, lint/typecheck/build), all five PDF-entry trace assertions, **35 compiled-document package tests**, and **68 desktop/mobile browser tests**, including the preserved landing page. This was a complete green gate, not a selected rerun after the earlier timeout.

Local contract formatting/build, ABI drift, and all 15 contract tests with 256 fuzz runs also passed; the local Foundry binary reported nightly, so the protected CI job remains the authoritative pinned Foundry 1.4.0 gate. Independent integration/jitter review found no additional actionable issue. Source working trees are clean before release preparation. The final version-only commit, PR checks, merge/tag, and post-merge read-back belong to the release record rather than this pre-release observation.
