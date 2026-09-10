# Publish and Send Implementation

## Approved Scope

Publishing a newly approved invoice must queue separate Resend messages for the
frozen client and sender addresses, with the frozen PDF attached and private
document links. Equal normalized addresses receive one combined-role message.
Reuse the existing email design and outbox retry/fencing protections. Dispatch
immediately after publication commits, with Supabase Cron recovery every minute.
Do not send old publications, enable pending receipt delivery, send live test mail,
or deploy as part of implementation. Publication is not inbox-delivery proof.

## Worktree Manifest

- Ticket: R10-PUBLISH-SEND.
- Branch: `integration/r10-publish-and-send`.
- Worktree: repository-root `.worktrees/publish-and-send`.
- Main base: `e419959` (latest fetched `origin/main` at worktree creation).
- Approved prerequisite: diff `e419959..f030878`, the committed gateway integration,
  applied without making a commit. No Privy work or root-worktree edits are included.
- Coordinator owns dependency/config/CI/tracing integration and this manifest.
- Core lane owns transactional queueing, canonical publication/outbox contracts,
  status, runtime/API integration, and their tests.
- Template lane owns `src/lib/email/templates.ts`, `templates.test.ts`, and
  `src/app/dev/emails/page.tsx` only.
- Template seam: extend `InvoiceEmailInput` with optional `audience`
  (`client | issuer | both`), optional `clientBusinessName`, and optional `network`
  (`Arc | Arc Testnet`). Existing callers remain valid; invoice dispatch explicitly
  supplies its audience and `Arc Testnet`. Preserve receipt behavior.
- Verification: focused unit tests, typecheck/lint/build/PDF package checks,
  disposable-only database/browser testing, independent security and spec review.
- No commits, pushes, migrations on retained/hosted databases, credential changes,
  live sends, or deployments are authorized by this implementation step.

## Implementation

The canonical publication request now requires `approval:true` and
`deliveryApproval:true` for new work. The dashboard reviews the exact invoice
version, defaults, client-profile changes, and both email addresses. Matching
approved retry requests survive refresh in session storage without storing email
addresses or document links. Legacy finalized no-send requests can read their
authorized replay but cannot acquire email delivery retroactively.

`202609090011_invoice_email.sql` adds immutable email approval/configuration and
transactional outbox enqueueing. All recipients, PDF bytes, link origin and
version facts are frozen. Distinct addresses get separate messages with their own
provider idempotency keys; equal normalized addresses get one combined-role copy.
No historical queue backfill exists. Receipt delivery remains independently gated.

The existing branded HTML/plain-text templates now have client, issuer-copy and
combined-role variants. Only the actual PDF-attaching Resend preparation opts
into attachment wording; historical link-only Gmail packages remain truthful.
Actual invoice email explicitly labels Arc Testnet and verifies the existing PDF's
Keccak-256 hash without regenerating its bytes.

After publication commits, Next.js `after()` processes at most two deliveries for
that exact attempt. Recurring recovery uses `GET /api/jobs/invoice-outbox`,
authenticated by `CRON_SECRET`. Each bounded invocation can resume one unfinished
email-approved publication and then process up to eight eligible invoice deliveries.
It does not drain the historical no-send publication or receipt-email queues.
Send-start serialization shares settlement's invoice advisory lock; stale payment
requests cannot start after a settlement committed before the provider marker.
Retry fairness rotates attempted jobs behind waiting work. Ambiguous provider
outcomes use the original payload/key inside the finite retry window or stop for
manual review, never blind duplicate sending.

`invoiceEmail` reports per-recipient-role processing separately from settlement
and receipt email, without disclosing recipient addresses/provider identifiers.
`sent` means Resend acceptance, not guaranteed inbox delivery. Detailed contracts
and the core file manifest are in [`invoice-email-contract.md`](invoice-email-contract.md).

## Supabase Cron Setup

This is prepared operator tooling, **not an executed production configuration**.
No Vercel cron frequency or paid plan was changed.

1. Review and apply the new forward migration in the intended project, then deploy
   the verified application. Keep `PAYR_INVOICE_EMAIL_ENABLED=false` and receipt
   delivery disabled until the activation checklist is complete. Do not backfill
   existing invoices or reset any retained database.
2. Verify the existing Resend API credential and verified `RESEND_FROM_EMAIL`.
   The From identity is distinct from the invoice sender's contact address, which
   receives its own copy. Preserve the same Resend account and retained document
   keys during retries.
3. Verify `pg_cron`, `pg_net`, and Supabase Vault are enabled in the selected project.
   Extension activation is a separate operator action; the installer refuses to
   silently create them.
4. In Vault, create exactly one `payr_invoice_email_origin` entry with value
   `https://payrlink.xyz`, and one `payr_invoice_email_cron_secret` entry containing
   the existing production `CRON_SECRET`. Never store a raw secret in checked-in
   SQL, job-command text, screenshots or logs. Duplicate names fail closed.
5. Execute `supabase/ops/install-invoice-email-cron.sql` as the persistent `postgres`
   role. It verifies prerequisites, installs a private wakeup function and creates
   or updates the single `payr-invoice-email-outbox` job at `* * * * *`.
   The job retrieves its credential from Vault at execution time. Client/API roles
   cannot invoke the wakeup function directly.
6. Verify the named job is active and that HTTP worker responses and durable queue
   progress are healthy. A successful cron execution only proves that `pg_net`
   queued a request; it does not prove the worker ran or that Resend accepted mail.
7. Refresh/reimport Bazantic's changed publication schema and update existing MCP
   clients before enabling `PAYR_INVOICE_EMAIL_ENABLED=true`. The catalog remains
   eleven resources; there is no separate agent send action and no invoice void
   resource. Do not enable the receipt gate as part of this rollout.
8. With separately approved real recipient and sender test addresses, publish one
   new test invoice, inspect both messages/PDFs/links, and retry publication to prove
   no duplicate sends. Only after provider read-back should delivery be reported
   as accepted; inbox verification is a separate check.

To stop recovery, execute `supabase/ops/disable-invoice-email-cron.sql` as the same
role. It removes only that role's named job, preserving queued work and Vault
entries. Disable the invoice-email flag to pause immediate and recurring dispatch;
this also makes fresh Publish & Send unavailable. Do not delete delivery records,
reset provider keys, or undo already accepted emails as rollback.

## Verification

All checks below passed on this worktree; no production operations were performed.

| Gate | Result |
| --- | --- |
| Unit suite | 2,516 passed; 13 existing isolated-PDF skips |
| Migration chain and SQL lint | All 15 migrations and lint passed in a fresh disposable private daemon |
| Full DB integration suite | 536 passed across 16 files |
| Invoice-email rerun on the same used DB | 24 passed, no reset required |
| Desktop/mobile browser suite | 94 passed |
| Typecheck and lint | Passed |
| Production build and native dependency tracing | Passed, including the new recovery endpoint |
| Compiled-document package | 35 passed; covers the isolated-PDF checks |
| Release/test-isolation tooling | 22 passed |
| Independent security/spec and compatibility review | Findings fixed and re-reviewed; no remaining findings |

The disposable runner had no host socket, bind mounts or published ports; external
networking was disconnected before tests. Both email flags stayed off, and provider
operations used mocks. The runner and its data volume were removed. Retained
Supabase containers, data and startup state remained unchanged. The production
cron installer was not executed. Safe desktop/mobile email previews were reviewed;
real Gmail/Outlook inbox rendering remains a live acceptance task.

Review fixes include settlement/send lock ordering, fair retry claims, recovery
without the original browser tab, truthful legacy attachment wording, recipient
status redaction, and preserving the approved link origin during reserved,
rendering and stored publication recovery. No original invoice bytes or legacy
v1 SQL DTO contracts were rewritten.

Outstanding: commit/release review, production migration/deployment, Vault/Cron
provisioning, Resend activation and the approved live inbox test. This worktree
contains no production credentials and remains uncommitted.
