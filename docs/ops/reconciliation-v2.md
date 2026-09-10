# Main Reconciliation

Status: implementation checkpoint, not a release or production-activation claim.
Approved on 10 September 2026: mandatory Publish & Send major-version cutover;
retain Privy and newer dashboard/MCP onboarding; archive the optional plugin.

## Baseline And Recovery

- Remote main: `cbcf7e28b9882d7ea3ee93599d2398381fe7938e`, tagged `v1.8.0`.
- Coordinator branch: `integration/r10-reconcile-v2.0.0`.
- Coordinator worktree: `.worktrees/reconcile-main`; approved isolation keeps the
  dirty primary worktree and all donors untouched.
- Recovery: ignored owner-only `.worktrees/reconciliation-archive-20260910/`.
  Its manifest SHA-256 is
  `53317f39d28e0906a1c611a5de4cdea7135a5f4764008412647fb3fd8e8719b3`.
  1,108 file snapshots cover nine dirty worktrees and the retained Privy deployment
  source. Staged/unstaged binary patches, refs and statuses are recorded separately.
  Every copied source hash was read back and checked against the untouched donor.
- `repository.bundle` verifies as a complete history bundle; `landing.bundle`
  preserves the standalone landing repository. Both historical stashes also have
  local `refs/archive/reconciliation-20260910/stash-*` recovery refs.
- No ignored environment, private deployment state, journal, database or volume
  was copied, reset or deleted. Those retained items remain cleanup blockers.
- The redacted archive secret scan flagged deterministic token-hash/UUID fixtures,
  prose and adjacent blank environment-template fields. It is not a certification
  of ignored private material or all historical Git objects.

## Selected Source

PR #19's SQL/test/provenance commits `b94ea86` and `51b4082` are replayed; its
version-only `7a2aba9` is excluded. Keep PR #19 until the replacement release lands.
Historical migration `202609090003_privy_identity.sql` is immutable, with full-file
SHA-256 `c864606e44a48cfff971553452af908d4fcb0de5ad95ea91ff621157e42afa27`.

The audited changed-file overlay from `publish-and-send-privy-deploy` is imported
onto main, not its entire tree. Its detached base is `b94ea86`; it retains main's
publication deadline, test isolation, wallet overview and gateway hardening.
The private `import-manifest.json` records each of 123 imported paths and hashes.
Shared configuration is reconciled centrally; package version stays at the base
until the final release preparation. Source migration `011` is a forward migration,
not permission to apply it to hosted or retained databases.

## Ownership And Freeze

All lanes start from the coordinator's committed combined-source checkpoint,
recorded by exact SHA in their dispatch. No lane writes a donor worktree.

| Ticket | Branch / worktree | Writable scope | Verification |
| --- | --- | --- | --- |
| R10-RECON-UI | `agent/r10-reconcile-ui`, `.worktrees/reconcile-ui` | Dashboard/login/install routes; public homepage and sitemap; UI components/tests; global CSS; browser tests; `src/lib/payr-connection.ts` and discovery copy/tests | Focused component tests, typecheck, desktop/mobile browser gate through coordinator |
| R10-RECON-BACKEND | `agent/r10-reconcile-backend`, `.worktrees/reconcile-backend` | Privy/auth/invoice/email/agent/MCP library and API code/tests, excluding DB repositories, migrations, config and UI | Focused unit tests and typecheck; review combined approval, identity and discovery boundaries |
| R10-RECON-DOCS | `agent/r10-reconcile-docs`, `.worktrees/reconcile-docs` | Charter/current-status docs, acceptance docs, skill playbook and demo/runbook prose, excluding this manifest and historical SQL provenance | Cross-check claims against source; retain dated evidence; no invented live results |

Coordinator exclusively owns dependency/lockfile/environment/CI/tracing files,
database repositories and migration numbering, release tooling/version/tags,
this manifest, final gate evidence and all external operations. User diagrams
and artwork are never overwritten. Maximum three implementation lanes; no shared
database fixtures run in agents. Return exact commit SHA, changed paths, checks,
assumptions and blockers. Reviewers must identify their actual model; this session
does not claim the unavailable GPT-5.6 Terra xhigh review requirement was met.

The contract freeze retains the imported schemas: both literal approvals for new
publication; finalized legacy read-only replay; immutable recipients/PDF/link
origin; no historical mail backfill; independently gated receipt delivery;
explicit `wallet:read` and service operation scope for account context. Privy is
not a payment signer. Freeze changes require coordinator review and consumer tests.

Lane freeze: `e76807a952b291dca0747977338b7f33d3bdca5e`. Integrated lane commits:
backend `628ebec`, UI `0daa60c`, documentation `8176ab0`, replayed without changes.
Coordinator regression repair permits explicitly scoped `wallet:read` in gateway
admission. It initially retained that action alongside `invoice.deliver` in what
was then believed to be unreleased `011`; the later hosted read-back below
supersedes that migration approach without losing the repository repair.
The original private source snapshot remains unchanged. Historical `003` and main's
gateway/hardening SQL remain byte-identical. Unit and database tests first failed
at these two seams, then passed with the combined repair.

`scripts/test-privy-db.mjs` rehearses the released v1.8.0 schema, then restores
the historical hosted Privy and invoice-email overlays before applying the new
audit repair. It checks retained workspace/payout/credential rows, a pre-existing
invoice-delivery audit event, new wallet admission and no automatic mail backfill
before running the linking/scope/grant fixtures. It does not seed historical
published invoices or receipt deliveries; populated-document preservation remains
an additional upgrade-evidence gate, not a claim made by this fixture.
CI runs this in a fresh network-isolated PostgreSQL container. The complete fresh
Supabase migration replay remains a separate gate.

## Review Repairs

Fresh independent standards, specification and adversarial-security reviewers
examined `cbcf7e2...6b8f9c75e94c5c23b60cf50e7b424b24072abff0` with gpt-6-astra.
Standards found no code violation; spec found terminal dashboard publication
recovery missing; security found uncached/unthrottled pre-verification Privy key
fetches and multiline business names producing invalid invoice-email subjects.
No reviewer claimed live acceptance or the unavailable Terra model.

The following bounded repair lanes start at the exact reviewed SHA above. They
inherit the same immutable invoice/identity/approval freeze and return commits,
focused regression evidence and blockers. Other ownership remains unchanged.

| Ticket | Branch / worktree | Writable scope | Gate |
| --- | --- | --- | --- |
| R10-RECON-RECOVERY | `agent/r10-reconcile-recovery`, `.worktrees/reconcile-recovery` | Publication action UI, invoice detail projection/types and colocated tests | Fresh explicit approval/new key after terminal failure; no consent reuse or in-flight attempt takeover |
| R10-RECON-AUTH | `agent/r10-reconcile-auth`, `.worktrees/reconcile-auth` | Privy provider, auth route and tests | Cached app-scoped verifier, bounded trusted-IP admission before verification, retained verified-subject admission |
| R10-RECON-EMAIL | `agent/r10-reconcile-email`, `.worktrees/reconcile-email` | Email preparation/template/adapter and tests | Single-line subject and valid prepared payload before provider marker, unchanged frozen facts and CR/LF rejection |

Current combined checks at `6b8f9c7`: 2,588 unit/component tests passed, 13 existing
packaged-PDF skips; 543 DB tests passed in 17 files on owned `payr-reconcile-v200`
(API/DB/shadow `62321/62322/62320`). The first full DB invocation hit the terminal's
120-second process limit; a non-competing 600-second invocation completed in 263
seconds without changing assertions or suite timeouts. These results precede the
review repairs and do not certify their final combined source.

Repair commits: recovery `d832d7f`, authentication `4dc239d`, email `5a4a64d`,
replayed on the coordinator as `a5137fc`, `ff4fcf4`, `253e89d`. The auth repair
deliberately reuses the existing DB quota API: five verification attempts per
trusted IP per minute, five per verified subject, and two global admissions per
successful two-stage request. This conservative capacity is not the old 30/IP
limit; increasing it requires a separately reviewed two-phase quota API.
Independent specification and security re-review at `253e89d` closed all three
findings without identifying new actionable defects; external acceptance gates
remain separate. The later forward-migration correction retains the same tested
constraint while preserving applied history.

The first combined browser run passed 94 of 96 checks. Both failures were the same
stale narrow-screen link label after the approved dashboard-login change; the
assertion now checks the visible dashboard link and its `/app` target. No product
behavior or accessibility assertion was removed to pass this gate.

## Concurrent Work And Hosted History

The user explicitly kept the agreed v2 scope when a final audit found newer Privy
payment-wallet changes in the root and `.worktrees/invoice-privy-deploy-20260910`.
They are preserved, not reverted or imported. A second owner-only recovery archive,
`.worktrees/reconciliation-archive-20260910-supplement/`, contains 1,262 source
snapshots from the now-28-worktree inventory, including 11 dirty worktrees. Its
manifest SHA-256 is
`af06c5907bb5bcd8a24e9b26108d4f45c2892778ebe4164f82a4b00b5a8e1a6a`.
The first archive remains unchanged. Later donor changes require another snapshot;
neither archive permits deleting active worktrees or private operator state.

Read-only hosted inspection of project `grutkfsoekcpwdksgasm` on 10 September
confirmed migration `202609090011_invoice_email` is applied. All 29 stored statements
match the archived source byte-for-byte in order, with only statement delimiters,
whitespace and comments between them. Source SHA-256:
`4d19f667bd49212a1a6e29955ccedddeef8c8bc06dfe7727d880cbccf7859d67`.
The newline-joined hosted statement SHA-256 is
`8ce08e7f258051d57bc1dd236131dba0c96cc45024e830143e2d69b23902c6c5`.
The installed audit constraint permits `invoice.deliver` but not `wallet:read`.
One read timed out; its standalone retry completed. No history repair or migration
application was performed during these checks.

Accordingly, `011` is restored to its exact applied bytes. The constraint fix is
now `202609100001_wallet_discovery_audit.sql`, after `011`, with bounded locks and
no row, credential, permission or scope-array mutations. Fresh installation and
already-applied-`011` upgrade are verified separately. A different target that has
Privy wallet-audit rows but has not applied historical `011` needs a separately
reviewed migration path: that historical constraint cannot accept those rows.
Do not delete audit rows or edit/replay historical SQL to force such a target through.

Vercel read-back now reports production deployment
`dpl_7MBVDhVtipHj1DkzDRfWg955V6sD`, Git production branch `main`, and automatic custom
domain assignment enabled. This is newer than the original deployment evidence.
There is no verified production-promotion hold. Keep the v2 PR draft and do not
merge or promote over the concurrently deployed payment-wallet work without an
explicit operator cutover decision. Keeping new source outside v2 does not
authorize removing its live behavior.

## Source Disposition

The independent final source audit found no missing feature in the original frozen
archive: all 123 imported paths exist, and only five of 544 unique archived paths
are intentionally absent. Three are optional plugin files/packaging, one is the
zero-byte root architecture placeholder, and the dedicated dashboard-login browser
test was adapted into `tests/e2e/console.spec.ts` and page-guard component coverage.
The real user-owned diagram and brand assets remain unchanged.

| Original branch group | Disposition |
| --- | --- |
| R07 settlement, R08 reconciliation, R09 connector copy, sender profile, AEO | Already released; older dirty overlays superseded, operational material retained |
| Root hardening, test isolation, root v1.7, combined agent v1.8 | Already in main; preserve their released protections |
| Local main, privy-history-v1.8.1 | Older/equal baseline, no missing feature |
| root-updates, agent-readiness | Useful committed behavior replayed earlier; uncommitted source selectively reconciled, not whole-branch merged |
| privy-reconcile-fresh | SQL/test/provenance replayed; pending v1.8.1 version commit excluded; PR #19 retained until replacement lands |
| r10-publish-and-send and its deployment variants | Audited feature delta integrated and repaired; later live evidence retained separately |

Actual remote extras remain `integration/agent-readiness`, `integration/root-updates`
and `integration/privy-reconcile-fresh`. The v1.7/v1.8 remote-tracking refs are stale,
not additional remote features. No branch, worktree, stash, database or volume has
been deleted. New payment-wallet work and all private operator state remain held.

## Release And Cleanup Gates

Run isolated DB reset/lint/integration, full unit/component, release tooling,
typecheck/lint/build/package verification, browser, contracts and ABI checks on the
combined committed source. Database and browser fixtures must be sequential.
Complete fresh specification, standards and adversarial security review.

Before pushing or merging, verify automatic production-promotion settings: recorded
production includes Privy beyond main and health only identifies its base SHA.
Do not silently replace it or enable email. Gateway schema import, private per-user
authentication, genuine Privy linking/policy denial and approved live inbox/payment
evidence remain operator gates. Missing gates are blockers, not inferred successes.

After green release checks, use `pnpm release:prepare -- 2.0.0` and
`pnpm release:verify`; a protected merge-commit PR and immutable annotated tag are
required. Retire donors only after tag/post-merge CI and operational preservation
checks. Never drop the two historical stashes or reset retained data during cleanup.
