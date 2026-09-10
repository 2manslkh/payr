# Automatic Receipt Email

Implementation added 10 September 2026 following approval for automatic receipt
emails for future payments. This document records source behavior and rollout
requirements, not proof of production activation or email delivery.

## Behavior

- Verified settlement registers tracked Next `after` work for its exact receipt.
  This generates/verifies the PDF and attempts up to two deduplicated destinations.
  Scheduling failure cannot turn a committed payment into a reconciliation failure.
- Reconciliation replays can resume the same work. Backfill limits immediate work
  to two distinct receipts per invocation; durable workers recover the remainder.
- `PAYR_RECEIPT_EMAIL_ENABLED` remains an explicit, default-off deployment gate.
  Receipt generation does not require enabling email.
- Migration `202609100002_automatic_receipt_email.sql` records a fixed database
  cutover time. Automatic claims require both delivery creation and verified block
  time to be at or after cutover. Existing queued receipts and late reconciliation
  of older payments are excluded, even when their payment pages are revisited.
- Both immediate delivery and `/api/jobs/outbox` use the restricted automatic claim.
  Empty scoped claims never fall back to the historical queue. The service-only
  legacy claim remains available for separately approved operator recovery.
- Scheduled receipt generation also selects only post-cutover work. Receipt and
  email recovery order by last update rather than original creation, rotating
  retried work behind other waiting rows so one failing item cannot monopolize
  the scheduler. Explicit receipt-ID generation remains available for recovery.
- Existing ready-artifact checks, frozen recipient roles, fences, payload hashes,
  stable idempotency keys and ambiguity windows remain unchanged. `sent` means
  provider acceptance, not inbox delivery.

## Activation

1. Keep receipt sending disabled while applying the forward migration to the
   verified target database. Record its cutover time privately. Do not reset the
   database, rewrite old rows, or move cutover backward to include old payments.
2. Deploy the matching source, including reconciliation function PDF resources.
   Verify the build and `node scripts/check-function-traces.mjs` before deployment.
3. Verify the existing Resend account, verified `RESEND_FROM_EMAIL`, canonical app
   origin, retained receipt keys, and `CRON_SECRET`. Preserve existing provider
   configuration and request identities across retries.
4. Set `PAYR_RECEIPT_EMAIL_ENABLED=true` for the matching deployment. Do not enable
   an older deployment: its outbox uses the unrestricted historical queue. A
   rollback to older code must also disable receipt sending.
5. For the next separately authorized payment, read back receipt readiness,
   logical delivery state and Resend acceptance/delivery. Do not create a payment
   or send a test to an arbitrary recipient as an implicit rollout check.

The current Vercel schedules remain daily at 00:00, 00:05 and 00:10 UTC. The new
post-response path avoids that delay for normal payments, but interrupted work or
retries can wait until the next daily run. This is not a prompt-retry SLA: ambiguous
sends can reach their 24-hour manual-review boundary before recovery. For prompt
unattended recovery, provision a scheduler supported by the hosting plan that
invokes the protected reconciliation, receipt and outbox endpoints every few
minutes, and monitor backlog and manual-review states. Changing hosting plans or
creating a new scheduler is a separate infrastructure operation.

An existing queued receipt, including the one shown in the original report,
requires identification and a separate scoped recovery. Automatic activation does
not authorize draining the old queue.

## Verification

Focused regression tests cover post-commit scheduling, replay, failed persistence,
disabled sending, exact receipt scope, ready-receipt replay, request budgets and
provider deadline capping. Real SQL tests on an isolated local stack cover old
queue exclusion, late reconciliation of old payments, concurrent claims, global
recovery/exhaustion, and service-only access. No live provider POST is made by
these tests.

## Release Candidate

Coordinator: `integration/automatic-receipts-v2.1.0` in
`.worktrees/automatic-receipts-v2.1.0`, based on `v2.0.0` /
`ac4188438693429f90414838fbf4888eb0c04c4c`. The user approved retaining the
already-deployed PR #21 commits `192bc7d` (MCP authentication guidance) and
`5422ae5` (authenticated draft review links), then releasing automatic receipts
as `v2.1.0`. Root demo assets and other worktrees are excluded.

Independent specification/security and standards reviews used `openai/gpt-6-astra`;
the unavailable historical Terra reviewer requirement is not claimed. Review
repairs rotate receipt/delivery retries fairly and cover automatic retry-to-sent,
expired sender leases, immutable provider identity, and runtime scheduling ID,
deduplication, cap and deadline wiring.

Fresh isolated `payr-auto-receipts-v210` at API/DB/shadow
`64321/64322/64320` passed full migration reset, SQL lint, and all 548 database
tests across 17 files. Browser port is `3298`; no retained stack is a fixture
target. Complete release preparation and hosted activation evidence belong in
the release PR and its deployment read-back, not this pre-release checkpoint.

Hosted preflight found `202609100001_wallet_discovery_audit` absent from migration
history. Receipt migration `002` does not depend on it; this rollout must apply
only `002` with transactional history recording, not a broad migration push.
The preflight Vercel project read-back confirmed Git-triggered deployments are
disabled and the existing daily schedules remain active. Do not infer future
deployment state from this dated observation.
