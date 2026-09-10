# Invoice Email Contract

Implementation contract for the user-approved 9 September Publish & Send change.
This is not deployment, cron provisioning, credential or live-send authorization.
The coordinator owns `publish-and-send.md` and the operator rollout.

## Approval And Cutover

New published requests require literal `approval:true` and `deliveryApproval:true`.
The fingerprint includes delivery approval; reusing an old no-send key for a new
send approval conflicts. Canonical v1 requests without delivery approval can only
read their already-finalized authorized replay. They cannot reserve, resume or
enqueue. HTTP/OpenAPI new bodies require delivery approval; legacy MCP can read
its persisted v1 result. Existing v1 SQL reservation/finalization and receipt DTO
signatures remain available for persisted work and shipped internal consumers.

`PAYR_INVOICE_EMAIL_ENABLED=false` is the default. Fresh requests validate this
independent gate plus Resend sender/key before reservation. Receipt enablement is
unchanged, remains off and is never consulted by the invoice worker. Replays of
already-finalized work do not need current mail configuration. New reservations
are Arc Testnet only. Agents must refresh discovery/reimport changed schemas;
the Baz catalog still has exactly eleven operations, with no added void resource.

`invoiceEmail` contains `state` and `deliveries` with only `roles`, `state`,
`attemptCount`, `nextAttemptAt`. It is separate from `receiptEmail`. `sent` means
Resend acceptance, not inbox delivery. No recipient addresses, provider IDs, keys,
PDF bytes or internal attempt IDs appear in this new status object. Public status
continues using its explicit allowlist and does not expose private deliveries.

The six-field `gmailLinkPackage` remains for shipped v1 consumers. It is not a
sending instruction. New results set `sendApprovalRequired:false`; historical
v1 no-send replay retains `true`. Do not ask agents to send a duplicate via Gmail.

## Transaction And RPCs

Forward migration: `202609090011_invoice_email.sql`. No historical SQL is edited.

- `payr_reserve_publication_v2(uuid,text,uuid,jsonb)` validates delivery approval,
  reuses v1 snapshot/version/default/client-diff/auth/idempotency checks and stores
  pinned email config only for a newly allocated attempt, never on replay.
- `invoice_email_approvals` pins `from`, `appOrigin`, `templateVersion` and network.
  It is immutable, RLS-enabled and has no direct service/client privileges.
- An AFTER state-change trigger inside `payr_finalize_publication_v1` enqueues
  exactly the frozen client/sender distinct normalized addresses. An enqueue
  error prevents finalization. `(publication_attempt_id,normalized_recipient)`
  is unique. No queue backfill or status/replay enqueue exists.
- `email_deliveries` has a receipt/invoice_issued shape constraint and composite
  workspace FK. The receipt claim join cannot claim an invoice delivery.
- `payr_claim_invoice_delivery_v1(p_id uuid default null,
  p_publication_attempt_id uuid default null)` claims one eligible invoice-only
  row, ordered by `updated_at,created_at,id`, using SKIP LOCKED, a fresh fence and
  a bounded lease. The matching partial index uses the same order. Attempts rotate
  behind untouched pending work even if preparation repeatedly fails.
- `payr_begin_invoice_delivery_v1(uuid,bigint,text)` persists the original payload
  hash and provider request marker before I/O, after rechecking validity under
  the same invoice advisory lock used by settlement/void, then invoice/link locks.
  The advisory lock is acquired before any row locks; no connector locks are taken.
  The final settlement check and marker run after every lock wait. It never starts
  a stale invoice request.
- `payr_claim_invoice_publication_v1(uuid,uuid)` selects only eligible attempts with
  an immutable `invoice_email_approvals` row, ordered by update/creation/ID, then
  delegates to the existing explicitly scoped v1 lease/fence claim. No candidate
  returns null; it never forwards null to the broad legacy claim. Concurrent claims
  may safely return idle rather than claim unrelated work.
- `payr_finish_delivery_v1(uuid,bigint,jsonb)` is the unchanged shared completion
  algorithm. Its internal DTO dispatcher preserves the receipt shape and adds
  the invoice variant. Existing receipt RPC/DTO consumers remain unchanged.
- `payr_publication_status_v2(uuid,text,uuid,uuid)` adds redacted invoice deliveries
  to the authorized v1 status projection. The v1 status response stays unchanged.

### Origin Pinning

Email-approved attempt DTOs at the new application seams carry optional
`attempt.link.appOrigin`, read from the immutable approval's `config.appOrigin`.
The field is absent for legacy no-send attempts. No origin is inferred from current
deployment configuration when an approval pin exists, and no PDF is regenerated to
accommodate origin drift.

- New `payr_find_publication_replay_v2(uuid,text,uuid,text,text)` and
  `payr_claim_publication_v2(uuid,uuid)` wrap the unchanged v1 authorization/CAS
  functions and add the pin. Both foreground and general/background worker reads
  use these wrappers. The approval-only recovery claim delegates to the v2 claim.
- Existing new `payr_reserve_publication_v2`, `payr_publication_status_v2`, and the
  invoice-only outbox DTO add the same metadata, without changing receipt DTOs.
- New `payr_read_invoice_document_v2(uuid)` wraps the existing protected document
  read and adds the pin so the protected page's displayed QR agrees with its PDF.
- Internal `payr_pin_publication_origin_v1(jsonb)` has no caller execute grants.
  Its fresh snapshot observes approvals committed while a replay waited for the
  reservation lock. The three public v2 wrappers are service-role-only.
- Shared `publicationLink` uses the invoice origin pin with the CURRENT retained
  keyring. Workers generate/verify the origin-A QR after restart on origin B;
  published results, Gmail compatibility links, status and share links also stay A.
  Receipt origin behavior is unchanged. Existing v1 publication/document RPC DTO
  shapes remain unchanged; no extra database round-trip is introduced per application read.

Origin restart DB coverage exercises reserved/no-PDF, rendering/already-uploaded,
and stored/PDF-metadata states through both foreground and background callers.
It verifies origin-A results, QR destination, unchanged existing PDF bytes/hash,
protected document pinning, and unchanged raw v1 replay/document DTOs. These tests
require a refreshed disposable migration runner and have not been run by this lane.
The global receipt-claim test permits unrelated receipt work while asserting that
all new invoice email rows remain byte-for-byte unchanged, including targeted
receipt-claim attempts against each invoice delivery ID.

## Retry Safety

The same TypeScript outbox worker and Resend provider implement both kinds.
Invoice preparation reads the exact frozen PDF from private storage, verifies
its content type, byte length, PDF signature and Keccak-256 against publication metadata,
then renders from only frozen snapshot/link material and pinned configuration.
It never regenerates the PDF or reads live client/sender profiles.

Template version `invoice-issued-v1` uses the existing template builder with
explicit audience and `network:"Arc Testnet"`. Payload hashing is the fail-closed
fallback if template/logo implementation changes after any provider attempt:
`PAYLOAD_CHANGED` goes to manual review, never a changed-body retry. Retain old
link keys; missing storage/keys cannot justify regenerating payloads. The sender
and app origin are pinned even when deployment configuration changes.

Voided, revoked, expired or settled invoices cannot start a new request. If work
is invalidated while its prior provider result is ambiguous, it requires manual
review. Valid ambiguous retries use the original key/hash inside Resend's finite
24-hour window; outside it they require manual review. The durable marker is the
last database validity decision before provider I/O, not an atomic transaction
with Resend. Neither exactly-once sending nor inbox delivery is guaranteed.

## Coordinator Integration

Endpoint ready: `GET /api/jobs/invoice-outbox`, Node runtime, `maxDuration=300`.
Authenticate with the existing `Authorization: Bearer <CRON_SECRET>` contract
(at least 32 characters). No caller-controlled batch size or recipient input.
Response is `{outcome:"disabled"|"drained",processed:number}`; failures are
sanitized by `privateWorkerRequest`. The HTTP batch limit is eight and the loop
  has a 240-second soft budget, subject to bounded per-operation timeouts.

Worker ready: `drainInvoiceEmails({publicationAttemptId?,limit?})` in
`src/lib/email/invoice-runtime.ts`; allowed limits 1..8. No scope means invoice-only
cron recovery: first resume at most one reserved/rendering/stored email-approved
publication through the shared publication worker, then drain at most eight invoice
deliveries. Recovery and delivery share the 240-second budget and abort signal;
database/storage requests also have 10-second timeouts. A delivery starts only with
55 seconds of budget remaining for claim/storage/marker/provider/completion. `processed` still counts
only delivery attempts, so the endpoint response and Cron caller do not change.
Historical no-send publication attempts are excluded even if explicitly targeted.
The Next `afterPublication(attemptId)` callback skips publication recovery, uses limit two and
that exact publication ID. Dashboard HTTP, legacy MCP and Baz API all inject this
callback into the same canonical service runtime. No fire-and-forget provider work
is launched by publish. The durable cron wakeup must be provisioned separately by
the coordinator; without it, recovery is not unattended.

Tracing review is required for `/api/jobs/invoice-outbox`, dashboard publish,
legacy/stable MCP and `/api/v1/[operation]` through their dynamic invoice runtime
and private storage import. Reuse the repository's PDF/native-package tracing
rules as needed. The new endpoint now actually renders/verifies PDFs during scoped
publication recovery, so its trace must include the existing publication worker's
native PDF/canvas/font dependencies. This lane does not edit `next.config.ts`, CI or cron config.

Dashboard retries persist only `{invoiceId,expectedVersion,approval:true,
deliveryApproval:true,idempotencyKey}` in session storage scoped by invoice/version,
and only after the explicit publish click. Remount/status refresh offers Resume
with the original key, not new consent. No emails, bearer links or credentials are
stored. Without a matching locally approved request, a nonterminal attempt shows
recovery/operator guidance instead of a new approval. Browser storage is not the
durable recovery mechanism; the approval-filtered cron worker is.

Review-fix DB scenarios in `invoice-email.integration.test.ts` (not run by this lane):
two-session settlement/advisory-lock wait followed by marker rejection; invoice/link
row-lock acquisition while begin waits to detect lock inversion; retry fairness
within one publication and across an older eligible cohort; reserved/rendering/stored
approval-filtered recovery with legacy exclusion; shared-worker finalization and
exactly one transactional delivery set after recovery. All settlement facts and
document providers are synthetic; no chain RPC or email provider is contacted.

All new tests use mocked providers. `invoice-email.integration.test.ts` uses the
disposable project harness and has not been executed by this lane. The coordinator
must run the fresh migration/DB gate and independent review before activation.
No retained database, real email, credentials or historical test invoice was used.

## Local Verification

Origin-drift pass: 405 focused unit tests passed across eight files; typecheck,
focused lint, production build and diff whitespace checks passed. Origin restart
and receipt-queue isolation DB scenarios remain pending the coordinator's fresh
disposable runner. No database or browser execution was performed by this lane.

Review-fix pass: 215 focused unit tests passed across six files; typecheck, focused
lint, production build and diff whitespace checks passed. New DB concurrency,
fairness and recovery scenarios remain unexecuted for the disposable validation lane.

- `pnpm test:unit`: 2,489 passed, 13 skipped. No database project ran.
- `pnpm typecheck`, `pnpm lint`, and `git diff --check`: passed.
- Production build and existing function-trace/PDF-package checks passed.
- UI mechanical detector: no findings. Authenticated desktop/mobile browser
  verification remains pending the coordinator's disposable runner.
- Browser PDF fixtures now use v1 no-send reservation plus the existing compiled
  publication worker, never a mail-enabled runtime override. The browser harness
  explicitly disables invoice email as well as receipt email. The fresh HTTP
  publication fixture asserts the disabled gate before preparing its no-send PDF.
- Review was in-thread; no independent sub-agent tool was available in this lane.
  The coordinator's fresh standards/spec/security review remains required.

## Core Lane Files

Exact files edited/added by this lane, excluding the already-applied gateway
prerequisite and template/coordinator-owned edits:

```text
.env.example
DECISIONS.md
playwright.config.ts
docs/ops/bazantic-agent-api.md
docs/ops/bazantic-publication.md
docs/ops/invoice-email-contract.md
docs/ops/mcp-claude-smoke.md
skills/payr-create-invoice/SKILL.md
src/app/(dashboard)/app/invoices/[id]/page.tsx
src/app/api/invoices/[id]/publish/route.ts
src/app/api/invoices/[id]/publish/route.test.ts
src/app/api/jobs/invoice-outbox/route.ts
src/app/api/jobs/invoice-outbox/route.test.ts
src/app/api/mcp/route.ts
src/app/api/mcp/[token]/route.ts
src/app/api/v1/[operation]/route.ts
src/app/dev/emails/preview.test.tsx
src/app/invoice/[slug]/page.tsx
src/app/invoice/[slug]/page.test.tsx
src/app/openapi/publish.json/route.ts
src/app/openapi/publish.json/route.test.ts
src/components/activity.tsx
src/components/invoice-document.tsx
src/components/invoice-pages.test.tsx
src/components/invoice-ui.tsx
src/components/invoice-ui.test.tsx
src/components/publication-actions.tsx
src/components/publish-and-send.tsx
src/components/publish-and-send.test.tsx
src/config/env.ts
src/lib/agent-api/http.ts
src/lib/agent-api/openapi.ts
src/lib/agent-api/openapi.test.ts
src/lib/agent-api/service.test.ts
src/lib/db/agent-combined-migrations.test.ts
src/lib/db/documents.ts
src/lib/db/documents.test.ts
src/lib/db/invoice-email.integration.test.ts
src/lib/db/outbox.ts
src/lib/db/publication.ts
src/lib/db/publication.test.ts
src/lib/db/publication.integration.test.ts
src/lib/discovery.ts
src/lib/domain/status.ts
src/lib/domain/status.test.ts
src/lib/email/invoice.ts
src/lib/email/invoice.test.ts
src/lib/email/invoice-runtime.ts
src/lib/email/invoice-runtime.test.ts
src/lib/email/outbox-contracts.ts
src/lib/email/outbox.ts
src/lib/email/receipt.ts
src/lib/invoices/approval-input.ts
src/lib/invoices/lifecycle.ts
src/lib/invoices/lifecycle.test.ts
src/lib/invoices/publication.ts
src/lib/invoices/publication.test.ts
src/lib/invoices/publication-contracts.ts
src/lib/invoices/publication-http.ts
src/lib/invoices/publication-links.ts
src/lib/invoices/publication-runtime.ts
src/lib/invoices/service.ts
src/lib/mcp/runtime.ts
src/lib/mcp/server.ts
src/lib/mcp/server.test.ts
supabase/migrations/202609090011_invoice_email.sql
tests/e2e/invoice-page.spec.ts
tests/e2e/publication.spec.ts
tests/e2e/publication-fixture.ts
```
