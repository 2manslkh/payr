# Agent and main integration

This branch prepares the combined implementation for coordinator review. It has
not prepared a release, changed the package version, pushed, merged, applied
hosted migrations, or deployed. Package version remains 1.7.0.

## Execution manifest

| Field | Value |
| --- | --- |
| Ticket | Agent/main combined release integration |
| Branch | `integration/agent-combined-v1.8.0` |
| Worktree | repository-root `.worktrees/agent-combined-v1.8.0` |
| Base | `e419959` (v1.7.0 main) |
| Scope | Verified deployed agent source, compatibility fixes, provenance, independent reviews, local gates |
| Ownership | This worktree only; no other worktree/index changes |
| Contracts | Eleven-operation Bazantic API and legacy publication runbooks; main dashboard/wallet/install/roadmap and optional sender behavior |
| Verification | Frozen install; isolated DB reset/lint/full tests; verify; browser E2E; three fresh read-only CLI reviews |
| Release owner | Sole coordinator; integration executor runs only release preparation dry-run |

## Source evidence

Read-only Vercel deployment inspection confirmed
`dpl_33iBWZ4T9QgV6UkKFFEa7vMKX8Mn`, URL
`payr-oxgi44fsn-kenks-projects.vercel.app`, Ready, production target, project
`prj_R4DxZQB45pzsJXipvcpmwa2xPni4`, under `kenks-projects`.

The `/v6/deployments/<id>/files` response contains separate `src` and `out`
trees. All **444 uploaded source files** under the source root match the donor
`.worktrees/bazantic-agent-deploy` by SHA-1, with **zero deviations**. Build-output
entries are not uploaded source. The sorted path/NUL/SHA-1 entries joined by
newlines produce SHA-256
`41206ae1ed3c81a8795ec6bcf2b86818771f5a1512ba354298ca4bcce38ae960`,
exactly the operator runbook manifest.

Replay uses the committed delta from common ancestor
`aebcd154810c234ade8f59cf2a451aa161ce11ff` through donor
`fcf63658e354b74ff31a87fb01fa404a7324da0c` (commits `fba7a1f`, `e650581`,
`fcf6365`), plus a 32-file explicit allowlist of verified dirty/untracked gateway
source and documentation. Every allowlisted file is in the uploaded manifest and
matches it. A temporary separate index under this worktree's ignored `.supabase`
created the replay patch without changing the donor index or worktree. The
already-present dashboard migration `003` is retained from main. No ignored
credentials, dependencies, generated metadata, or primary dirty work was imported.

The homepage import conflict preserves both main's Roadmap and deployed public
agent tools. Main's dashboard, wallet, install route, test harness and sender
defaults remain. Gateway fixtures now use `fixtureDatabaseContainer()`; default
CI uses its explicit disposable opt-in on a fresh hosted runner.

## Hosted migration evidence

The pinned Supabase CLI 2.116.0 queried only migration history using
`db query --linked --project-ref grutkfsoekcpwdksgasm`. Hosted history contains
13 migrations through `202609090002`, including dashboard `202609080003`, and
does not contain `202609090010`.

All **36 stored statements** of hosted gateway migration `202609090002` are exact
ordered byte slices of the donor SQL; gaps contain only statement separators and
whitespace omitted by CLI parsing. There is no unmatched SQL. The donor and
imported file SHA-256 is
`e519c7ef96ea161530a1e0e05f628ab028ad01f66a563ec3948a7a12e9e1b07c`.
SHA-256 of the hosted statement array joined with NUL is
`c031d8374fe01febd4a2355dbb422efecf498e0c80af35a35c17d1fc2ad3adf1`.
Raw SQL responses were compared in memory, never printed or written to logs.
Migration `002` is immutable; any new database fix must follow `010`.

## Local evidence and limits

Frozen installation and typecheck passed; the initial focused API/repository gate
passed 515 tests. Full local gates and reviews are in progress.

Gitleaks staged scan found one test-only candidate: a deterministic connector
HMAC fixture at `src/app/api/mcp/route.test.ts:13`, paired with a public sequential
byte fixture and a fixed test pepper. Manual review confirmed it is not a live
credential. Scanner output is fully redacted and held under ignored `.supabase`.

Before starting the isolated stack, read-only container/volume and listening-port
checks confirmed no existing owner of the project or requested ports. Local gate
commands use this environment and run sequentially:

```sh
export PAYR_TEST_PROJECT_ID=payr-agent-combined-v180
export PAYR_TEST_API_PORT=60321
export PAYR_TEST_DB_PORT=60322
export PAYR_TEST_SHADOW_PORT=60320
export PAYR_TEST_PORT=3198
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm test:db:local
pnpm verify
pnpm test:e2e
pnpm release:prepare -- minor --dry-run
```

No retained project or private daemon is operated on. No hosted schema, key,
account, invoice, payment, email, or worker writes are performed. Payment/send and
legacy cutover flags are preserved. Existing production evidence belongs to the
primary runbooks; local verification does not establish new live gateway, MCP,
payment, email, or prize-qualification evidence.
