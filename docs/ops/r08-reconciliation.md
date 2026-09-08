# R08 Reconciliation First Slice

Historical checkpoint only. The user subsequently approved full sequential R08 implementation, scoped deployment/payment/email operations, and release. Current receipt/outbox contracts, live evidence, and release limitations are in [R08 Receipts And Delivery](r08-receipts-delivery.md). Statements below about pending work or absent hosted operations describe the first-slice checkpoint, not current state.

## Scope And Ownership

The user selected sequential first-slice implementation, without commits, implementation-agent fanout, deployment, emails, or further payments. Work lives in `.worktrees/r08-reconciliation` on `integration/r08-reconciliation`, based on released `v0.6.0` / `0d122231b0252f587a59868022b65dea83f6d525`.

The existing root reconciliation starter was carried into this worktree: verifier/runtime/repository, immediate and cron routes, migrations `006`/`007`, and the daily cron configuration. Only the needed reconciliation environment factory and IP normalizer export were carried from shared files. Root R09 wallet UI, dependencies, public polling, operator scripts, diagram, and environment files were not copied or changed. Package version remains `0.6.0`.

This is not completed R08. It verifies settlement ingestion and the existing atomic enqueue boundary. Receipt generation, protected receipt pages/PDFs, durable outbox workers, actual receipt emails, and unattended-operation evidence remain pending. F5 is not yet a committed complete interface freeze, and no implementation fanout is authorized.

## Verified-Prefix Contract

- Arc-specific finality remains one successful receipt included in a successfully fetched committed block. No confirmation-depth waiting, fork tables, rollback machinery, or alternate payment-state model is added.
- Immediate and backfill paths use one verifier. Chain, contract, receipt/block/log identity, exact `InvoicePaid` shape, and frozen invoice commitment/payee/amount/deadline are checked before persistence. Commercial state and invoice-bearer revocation do not exclude valid historical settlement evidence.
- Backfill fetches raw logs for each allowlisted contract. It does not use viem's strict ABI filtering, which silently drops malformed candidates. Every returned candidate must reach receipt verification; an unexpected topic or malformed log blocks that contract's progress rather than disappearing before the checkpoint.
- The cursor is the next unprocessed `(block, logIndex)` position. After settlement persistence, compare-and-set advances to the verified log index plus one. A completed remaining range advances to `(endBlock + 1, 0)`. A lost compare-and-set stops that contract's attempt; replay remains safe through the existing immutable event/invoice uniqueness constraints.
- The user explicitly approved per-event verified-prefix checkpoints instead of whole-range-only checkpoints. A failed second event leaves the first event checkpointed. A fresh process resumes the second, and dense blocks progress across bounded invocations. See `DECISIONS.md`.
- A missing frozen target for a configured backfill candidate is not treated as permanently irrelevant. Its cursor remains before that candidate and the operation reports `RECONCILIATION_UNAVAILABLE`. Investigate database recovery or configuration before advancing manually. Immediate unrelated/unknown transactions return `invalid`, not paid status.
- Independent contracts may still progress when another is blocked. The operation reports failure after processing the independent work, retaining successful prefixes. A failure response therefore does not imply that no valid settlements were recorded.

## Bounds And Delivery Enqueue

- A worker invocation has a 240-second budget, at most 100 verified events, and a caller-selected ceiling of 1-50 completed ranges of at most 10,000 blocks each. The HTTP routes allow 300 seconds for bounded I/O completion and response overhead.
- Current plus at most 20 retained contracts are supported. Cursor reads are bounded and concurrent. Lagging persisted cursors are considered first across fresh server instances; range/event allowances are divided across contracts. Time shares limit starting additional work, but do not prevent one already-started healthy event from completing within the global budget.
- Chain reads use a ten-second transport timeout with no transport retry. Reconciliation repository requests and immediate-route admission use ten-second abort signals. The immediate request's budget starts before admission rather than after it.
- Immediate reconciliation processes at most 100 matching events and returns `pending` when its budget is exhausted. Backfill independently resumes remaining events. Neither result replaces canonical invoice status as the source of displayed payment state.
- Confirmed frozen issuer/client addresses are trimmed, lowercased, validated, sorted, and deduplicated. One matching address produces one logical delivery retaining `['issuer', 'client']`. Malformed frozen contact data fails closed; no recipient is inferred.
- The existing service-only settlement transaction creates one immutable settlement, one pending receipt/link identity, and deduplicated pending delivery rows atomically. Reconciliation replay may generate new proposed token metadata, but the database returns the existing logical work and preserves its original receipt identity.
- `PAYR_RECONCILIATION_START_BLOCK` is required and must be a canonical bounded integer string. Set it to the earliest verified deployment block among current and retained contracts; never infer that a newly selected default covers older deployments.

## Verification

The carried starter initially passed 21 focused tests and typecheck. New failing regressions were observed before fixes for slow empty ranges, missing targets, wrong-contract/out-of-range cursor advancement, oversized immediate batches, malformed ABI suffixes, raw-log decoder loss, unbounded admission, and retained-contract starvation.

Verification uses these boundaries:

- Event verifier and real viem custom transport: malformed raw candidates cannot disappear before checkpointing; a valid/malformed/valid sequence checkpoints only the first candidate.
- Cursor/service recovery: partial failure and fresh-process resume, lost compare-and-set, dense blocks, slow dependencies, bounded processing, independent contract failures, and progress when a single event exceeds a fractional time share.
- Actual SQL/repository/lifecycle integration: before/after/equal-to-void events, delayed expiry, concurrent immediate/backfill replay, stable receipt identity, one normalized recipient with both roles, exact bigint cursors, and service-only RPC privileges.
- Runtime/HTTP seams: admission before chain work, request budget propagation, private responses, rejected client-supplied facts, pending versus provider failure, and bounded database calls.

The nine reconciliation integration tests passed against a disposable local Supabase profile named `payr-r08-first-slice` (API `57421`, Postgres `58422`, shadow `57420`). All seven migrations applied there and SQL lint passed. Tests insert independently named fixtures; controlled commercial-state fixtures simulate historical race outcomes. Chain responses are deterministic fixtures, not live Arc evidence. No hosted migration or reconciliation was performed.

The isolated test profile is retained under ignored `.supabase/r08-first-slice`; it is not configuration for the main demo. The optional test-only `PAYR_TEST_DATABASE_CONTAINER` supports this specific isolated container in the new integration file. Existing full-suite helpers still use the original ports/container, so do not run the full DB or browser fixture suite against the retained demo.

Final `pnpm verify` passed on 8 September: lint, typecheck, 1,766 unit tests (13 skipped), 10 release-tool tests, production build, the trace-conflict check, and all 35 compiled-document tests. The final nine-test reconciliation DB run also passed. Independent specification/security and standards reviews identified raw-log filtering, admission timeout, and cross-contract progress issues; these were reproduced, repaired, and re-reviewed with no remaining medium/high finding in the reviewed paths. The full DB regression suite, new receipt browser tests, protected CI, and a release are not claimed by this first slice.

## Remaining R08 Work

1. Define receipt and outbox worker DTOs/RPCs and finish F5, with explicit capacity and commit approval before implementation fanout.
2. Add service-only receipt claim/complete/retry/fail operations, pre-ready identity protection, create-only private storage, exact served-byte/hash/QR verification, and independent protected receipt access.
3. Add outbox claim/request-marker/completion/retry operations, stable payload identity, immutable provider key/first-attempt time, ready-receipt dependency, fence checks, and exact 24-hour ambiguity cutoff. Preserve deterministic backoff and confirmed recipient roles.
4. Add receipt/outbox cron routes and the ordered operator fallback, then authenticated settlement/receipt/delivery proof surfaces and redacted activity.
5. Run complete hostile database and desktop/mobile receipt gates in a disposable environment. Coordinate migration numbering with the shared root before adding the next migration; `005` is already document access, not a free worker migration number.
6. Obtain separate deployment/provider-operation approval. Reconcile the existing R07 transaction twice, generate/verify one receipt twice, and prove one logical delivery per confirmed recipient without duplicate sends. Observe a scheduled call or explicitly retain operator mode.

The existing paid demo transaction is `0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f`, block `60875360`, Payr log `507`. Do not pay the invoice again to reproduce R08 evidence. The source `vercel.json` schedules only reconciliation daily; its presence is not evidence that this slice was deployed or cron was observed.
