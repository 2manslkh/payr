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
admission and retains that action alongside `invoice.deliver` in unreleased `011`.
The original private source snapshot remains unchanged. Historical `003` and main's
gateway/hardening SQL remain byte-identical. Unit and database tests first failed
at these two seams, then passed with the combined repair.

`scripts/test-privy-db.mjs` now rehearses the released v1.8.0 schema, then restores
the historical hosted Privy overlay and applies the invoice-email upgrade. It
checks retained workspace/payout/credential rows, a pre-existing wallet audit event
and no automatic mail backfill before running the linking/scope/grant fixtures.
CI runs this in a fresh network-isolated PostgreSQL container. The complete fresh
Supabase migration replay remains a separate gate.

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
