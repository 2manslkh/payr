# Agent and main integration

This branch contains the reviewed combined implementation with green local gates. It has
not prepared a release, changed the package version, pushed, merged, applied
hosted migrations, or deployed. Package version remains 1.7.0.

## Execution manifest

| Field | Value |
| --- | --- |
| Ticket | Agent/main combined release integration |
| Branch | `integration/agent-combined-v1.8.0` |
| Worktree | repository-root `.worktrees/agent-combined-v1.8.0` |
| Base | `e419959c69e483b547a2d5a84f796ca5bc483940` (v1.7.0 main) |
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
After the isolated reset, the local migration-history statement array also matched
the hosted array exactly, including the same `c031d837…3adf1` digest.
Migration `002` is immutable; any new database fix must follow `010`.
No `020` migration was needed. The combined local chain has 14 migrations; the
coordinator's hosted migration work still includes main's unapplied `010`.

## Local evidence and limits

| Gate | Result |
| --- | --- |
| Frozen dependency install | Passed; package and lockfile unchanged |
| Isolated start, reset, SQL lint | Passed; complete 14-migration chain |
| Complete database suite | **513 passed**, 15 files |
| Lint and typecheck | Passed, including final worker setting |
| Complete unit suite | **2,420 passed**, 117 files; 13 existing PDF skips |
| Release and fixture-harness tests | **22 passed** |
| Production build and native dependency tracing | Passed |
| Compiled-document gate | **35 passed**, covering the isolated PDF skips |
| Complete desktop/mobile browser suite | **94 passed**, normal build/start configuration with `PAYR_TEST_WORKERS=1` |
| Release preparation dry-run | Passed: **1.7.0 → 1.8.0**, including remote tag ancestry/uniqueness checks |

The initial focused API/repository gate passed 515 tests; the publication-deadline
and migration regressions passed 68 tests. Application verification ran from clean
commit `ed14a0a`; the later concurrency-only commit `a7ccefb` passed lint/typecheck
and the complete normal browser command from a clean tracked tree. Database and
browser fixtures were never run concurrently.

Three fresh, independent Codex CLI sessions reviewed `e419959...f030878` using
actual `gpt-6-astra`, high reasoning, read-only sandbox, with separate standards,
specification, and security prompts. Standards and specification found no
actionable issues. Security found one medium issue: the legacy publication body
reader lacked an absolute deadline. Stalled/trickling request regressions failed
before the fix; the reader now bounds reads to five seconds and returns sanitized
private 408 responses without awaiting cancellation. No SQL change is required.
Three fresh correction reviewers checked `e419959...ed14a0a` and reported no
remaining high, medium, or low findings. Separate fresh standards/spec/security
reviews also cover the final concurrency setting in `ed14a0a..a7ccefb`. Reviewer
findings at the final implementation head are zero across all three axes. Reviewer
logs and reports live under ignored `.supabase/review-*`,
`.supabase/review-correction-*`, and `.supabase/review-final-*`, outside
Playwright's cleared output directories. All reviewer sessions used actual
`gpt-6-astra` high with read-only sandboxes; no Terra execution is claimed.

The first full database gate passed 499/512 tests; 13 existing auth/settlement
fixture tests failed with nonce `INVALID_INPUT`. Isolated reruns passed the auth
test and all 14 settlement/receipt tests. A 400-request local nonce probe passed
with and without a 20 ms persistence delay. Clock skew was considered but not
established; no authorization check or fixture timing has been weakened. A clean
reset and complete rerun passed all 513 tests. The expanded gateway SQL suite passed
16 tests, including compatibility with main's overview, credential revocation,
and denial of owner-only wallet admission.

The first browser run used eight workers and passed 84/94 tests. Failures included
protected-document 404s, share controls and payment connection assertions, and
mobile screenshot/receipt timeouts. Other applications were consuming substantial
host CPU; they were left untouched. A focused build also exceeded Playwright's
existing 60-second startup deadline. After a fresh build, both protected-invoice
tests passed in isolation, and the complete 94-test suite passed with one worker.
The new optional `PAYR_TEST_WORKERS` setting then enabled a second complete
94-test pass through the normal `pnpm test:e2e` command, including its normal
build/start step. Use the environment below for coordinator release preparation.
No test assertions, production quotas, authentication checks, or timeouts were
relaxed. The evidence establishes the one-worker gate; it does not claim the
initial parallel failures were all conclusively diagnosed.

Gitleaks staged scan found one test-only candidate: a deterministic connector
HMAC fixture at `src/app/api/mcp/route.test.ts:13`, paired with a public sequential
byte fixture and a fixed test pepper. Manual review confirmed it is not a live
credential. A scan of all integration commits found only that same fixture;
subsequent staged correction scans were clean. Scanner output is fully redacted
and held under ignored `.supabase`.

Implementation commits:

- `f0308785e18d3b0dc157e734b925ce239433219e`: verified deployed source integration and provenance.
- `ed14a0ad71891055f248ed9e10c44fc7f13320c7`: body deadline and combined migration/authorization regressions.
- `a7ccefbe54ad353a1c03da24d51678b3060d7339`: optional browser concurrency for reproducible release gates.

Before starting the isolated stack, read-only container/volume and listening-port
checks confirmed no existing owner of the project or requested ports. Local gate
commands use this environment and run sequentially:

```sh
export PAYR_TEST_PROJECT_ID=payr-agent-combined-v180
export PAYR_TEST_API_PORT=60321
export PAYR_TEST_DB_PORT=60322
export PAYR_TEST_SHADOW_PORT=60320
export PAYR_TEST_PORT=3198
export PAYR_TEST_WORKERS=1
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

The isolated stack is left running for the coordinator's release gates. Release
preparation without dry-run, version changes, push, PR, merge, annotated release
tagging, hosted migrations, and Vercel production operations remain with the sole
coordinator. Forward fixes must preserve migration `002` and use a new migration
after `010` if a database change becomes necessary.
