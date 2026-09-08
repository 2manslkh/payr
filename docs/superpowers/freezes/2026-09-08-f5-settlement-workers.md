# F5 Settlement Workers

Status: implemented sequentially; frozen when this document, schemas, types, and regression tests are committed together in the R08 implementation commit. No implementation fanout took place before that boundary. Original base: `v0.6.0` / `0d122231b0252f587a59868022b65dea83f6d525`.

## Consumer Contract

- `src/lib/payments/reconciliation-contracts.ts` and `reconcile.ts`: exact frozen-event verification shared by immediate/backfill consumers. Migration `007` stores the next unprocessed block/log position. Verified-prefix checkpoints are the explicit dated override in `DECISIONS.md`; no failed candidate is skipped.
- `src/lib/receipts/contracts.ts`, `src/lib/db/receipts.ts`, and migration `008`: fenced receipt claim/complete/fail, immutable identity, create-only private artifact, byte/material/QR verification before readiness, independent receipt bearer access.
- `src/lib/email/outbox-contracts.ts`, `outbox.ts`, `resend.ts`, `src/lib/db/outbox.ts`, and migration `008`: ready-receipt dependency, one deduplicated logical recipient with retained roles, stable payload hash/key, durable request marker and immutable first-attempt time, and manual review at the 24-hour ambiguity boundary. Forward migration `202609080002` adopts current main's capped half-to-full jitter policy; exact injected samples make bounds deterministic in tests. Worker RPC signatures and existing persisted retry times are unchanged.
- Monotonic dispatch budget begins before the marker RPC and charges the round trip and serialization. Dispatch respects five-second lease and thirty-second ambiguity margins. A provider acceptance is `sent`, not human inbox confirmation. Disabled delivery cannot call the provider.
- `src/lib/domain/status.ts` retains distinct commercial/payment/receipt/delivery axes. Owner initial HTML/RSC uses `settlementManagementView`'s redacted allowlist; authenticated explicit reveal is separate. Public document status never exposes recipient rows or provider IDs. Receipt access must not depend on an expired/revoked invoice bearer whose key has been retired.
- R09 consumers must use canonical persisted status, never transaction submission alone, to display Paid. Receipt readiness and email provider acceptance remain separate progress indicators.

## Verification Boundary

Regression tests accompany verifier/runtime, strict DTOs, receipt worker/storage, outbox adapter/deadlines, owner reveal, and effective-expiry projection. Actual SQL/Storage tests cover claim/fence/replay and ambiguity behavior; compiled desktop/mobile tests cover receipt PDF/QR, private access, revocation, and owner SSR redaction. Native PDF worker resources are asserted in all relevant production traces.

Current live evidence, operator-only delivery policy, known timeout risk, and protected release requirements are in `docs/ops/r08-receipts-delivery.md`. The freeze does not imply approval to send another email, mutate frozen demo facts, deploy a contract, or repay an invoice. Subsequent schema repairs require new migrations because `008` is already applied to the hosted project.
