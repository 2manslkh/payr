# R02 Domain And Database Evidence

Evidence date: `2026-09-05`. Base release: `v0.1.2`, commit `7b49d404659bec59e8c8a58a55d96c478346a66d`.

## Implemented Scope

- Exact positive native Arc USDC decimal/bigint conversion and canonical JSON serialization.
- Separate commercial/payment state, effective expiry, settlement-after-void derivation, receipt-email aggregation, and explicit nested public status redaction.
- Deterministic, purpose-separated, versioned bearer tokens with strict encoding and constant-time verification.
- All 18 core records, composite tenant foreign keys, four state enums, database-enforced immutability, and default-deny public access.
- Atomic idempotent invoice-sequence allocation, scoped authorization persistence, and immutable settlement recording with receipt/link/delivery follow-ups.
- Runtime-only Supabase client and workspace-scoped adapters for all three privileged RPCs.
- A migration-created private `documents` bucket restricted to PDF and 10 MiB objects.
- Reproducible local reset/lint/test commands and an independent CI `database` job.

These are local kernel capabilities. No authentication route, publication worker, contract deployment, live settlement, rendered PDF, receipt email, or Claude connector is claimed by R02.

## Integration Manifest

| Lane | Worktree | Base SHA | Agent implementation commit |
| --- | --- | --- | --- |
| F1 coordinator | Root integration branch | `7b49d404659bec59e8c8a58a55d96c478346a66d` | `1de53302a607b4f97e41dd935cd47f206588c350` |
| Domain/status | `.worktrees/r02-domain` | `1de53302a607b4f97e41dd935cd47f206588c350` | `4d911e08ecf2260771d240fbe6c208ede385771b` |
| Token security | `.worktrees/r02-token-security` | `1de53302a607b4f97e41dd935cd47f206588c350` | `cfb6e59418bf3f3f5b3e662e520b33bbf299821e` |
| Schema/security | `.worktrees/r02-schema` | `1de53302a607b4f97e41dd935cd47f206588c350` | `3f44ee3df989f287d330cd98bbee841e7b204791` |
| Repository | `.worktrees/r02-repository` | `88e0cd630e5902330f24daa561ab8b5f2dcc775d` | `d0198d732788178253008a03737f3bf83be228d4` |

The first three lanes were integrated before repository dispatch. The interrupted repository dispatch left partial owned-file changes; the resumed lane preserved and completed them. Schema repair was based on the centrally updated F1 contract at `70682aaaac685f92d511ee4447c7d44882ec7b25`, producing agent commit `549637f386f604e4b803be48a49b8952e69cfe81`.

## Verification

| Gate | Local result |
| --- | --- |
| Lint and typecheck | Passed |
| Unit tests | 93 passed across 8 files |
| Release-tool tests | 10 passed |
| Production build | Passed; no product runtime credentials required by the shell |
| Desktop/mobile production smoke | 4 passed with `CI=1 PAYR_TEST_PORT=3122 pnpm test:e2e` |
| Migration reset and SQL lint | Passed on PostgreSQL 17 using pinned Supabase CLI `2.116.0` |
| Database integration | 64 passed: 56 hostile/schema cases and 8 repository cases |
| Launcher isolation | Hosted-looking inherited Supabase values ignored; local credentials selected instead |
| Launcher failure | Refused execution outside the running local Payr project with a sanitized error |
| Secret scan | Gitleaks over R02 history found one reviewed false positive: the deterministic UUID fixture in `src/lib/security/keyed-token.test.ts:6`; no real credential was identified |
| GitHub clean runner | Draft PR #3 run `33970592493` passed `web`, `browser`, and `database`; release metadata was intentionally deferred until the final version-only commit |
| Required database check | Active `main` ruleset `22322911` now requires `database` alongside `web`, `browser`, and `release-metadata`, with strict up-to-date checks and no bypass |

Reproduce the database gate with `pnpm db:start`, `pnpm db:reset`, `pnpm db:lint`, then `pnpm test:db:local`. Only the active database steward runs the shared stack. API/Postgres/shadow ports are `57321`/`57322`/`57320`; other projects' occupied ports were left untouched.

Owner-level fixture/catalog setup uses local Postgres only. Production mutations under test cross the actual Supabase RPC interface; hostile callers cross Data API, Auth, and Storage. Denial evidence includes `anon`, `authenticated`, and direct service-role writes, plus trigger-level mutation tests independent of grants.

## Review Repairs

- Rejected fractional/nonfinite block inputs before PostgreSQL numeric coercion.
- Closed SQL CHECK-null holes in complete PDF artifact groups.
- Restricted descriptor labels and PDF basenames so bearer URLs/slugs cannot fit their allowed shapes.
- Enforced one finalized publication per logical invoice across versions.
- Returned sequence values as decimal text and used text projections for exact monetary/block read-back.
- Replaced nested reference forwarding in public status with explicit field projections; enriched private-field regression failed before the fix and passed afterward.

## Remaining Gates

R02 must still pass GitHub's release PR checks and receive an annotated tag on its exact merge commit. The release PR and Actions runs provide the authoritative post-merge evidence rather than this pre-release snapshot.

A hosted Supabase project, funded Arc operator/payer wallets, Resend sender verification and inbox proof, Claude account connector UI, and the exact authenticated ETHGlobal deadline remain external gates. The R01 ledger in `docs/ops/preflight.md` is historical; its local-Supabase configuration blocker is superseded by this verified R02 setup, not by a hosted deployment.

Local Supabase uses development credentials and binds services to all network interfaces. It is not a production deployment and must not be exposed to an untrusted network. No credential values, funded wallet addresses, real bearer URLs, or receipt inbox addresses are stored in this evidence.
