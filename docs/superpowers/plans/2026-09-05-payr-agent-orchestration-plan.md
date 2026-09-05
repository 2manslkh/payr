# Payr Agent Orchestration Plan

**Status:** Approved execution runbook

**Goal:** Deliver the Payr MVP through isolated GPT-5.6 Terra xhigh worktrees while preserving frozen interfaces, reviewable release tranches, protected `main`, and one annotated version tag per merge.

The product and acceptance contract lives in `docs/superpowers/specs/2026-09-04-payr-framing-design.md`. The technical sequence lives in `docs/superpowers/plans/2026-09-04-payr-mvp-implementation-plan.md`. This document owns only multi-agent execution and integration mechanics. Release commands and invariants live in `docs/ops/versioning.md`.

## Source Precedence

Use one explicit hierarchy instead of allowing an implementation ticket to silently redefine the product:

1. Newer dated entries in `DECISIONS.md` override older prose only for the decision they record.
2. `PROJECT.md` owns product scope, users, non-goals, and the demo promise.
3. The framing design owns behavior and acceptance criteria.
4. `DESIGN.md` owns visual and interaction rules.
5. The implementation plan owns technical decomposition and verification.
6. This orchestration plan owns branches, worktrees, integration, and release flow.

When two sources conflict, stop the affected ticket and reconcile the authoritative documents before implementation continues.

## Release Tranches

| Tranche | Scope | Parallel lanes | Required gate | Expected version |
| --- | --- | --- | --- | --- |
| R00 | Hardened baseline, plans, release governance, brand assets | Coordinator and independent reviewers | Existing shell, release-tool tests, desktop/mobile smoke | `v0.1.1` |
| R01 | External preflight and Vercel health proof | Evidence agent and human live operator | Every prerequisite is verified, blocked, or not configured | `v0.1.2` |
| R02 | Domain and database kernel | Domain, token-security, and schema lanes; repository lane follows schema | Unit, hostile DB, reset, and direct-access denial tests | `v0.1.3` |
| R03 | Identity and console foundation | Auth, profiles/connectors, and design-foundation lanes | Replay/authz tests and responsive accessible shell | `v0.2.0` |
| R04 | Draft and revision lifecycle | Schema/service, SQL mutation, and projection lanes | Strict input, concurrency, idempotency, and dashboard tests | `v0.3.0` |
| R05 | Crash-safe publication | Publication worker, status/void/Gmail, and invoice UI lanes | Lease/fence crash matrix and no premature link exposure | `v0.4.0` |
| R06 | Immutable documents and protected surfaces | Renderer, storage, and protected-route lanes | Stored/served byte equality, decoded QR, CSP, private storage | `v0.5.0` |
| R07 | Arc settlement authorization | Foundry, TypeScript authorization, and deployment lanes | Adversarial contract suite and one real operator payment | `v0.6.0` |
| R08 | Reconciliation, receipt, and durable delivery | Reconciler, receipt, outbox, and proof-UI lanes | Race matrix, worker recovery, real idempotent delivery | `v0.7.0` |
| R09 | Client payment and Claude MCP | Payment UI and MCP lanes | Desktop/mobile payment simulations and deployed Claude smoke | `v0.8.0` |
| R10 | Production proof and submission | Evidence, documentation, and rehearsal lanes | Full acceptance matrix and two rehearsals | `v0.8.1` |

Expected versions are planning labels after R00. The release coordinator selects the actual SemVer bump from the merged behavior under `docs/ops/versioning.md`.

## Worktree Topology

- The primary worktree owns `integration/rNN-<name>` and release coordination.
- Agent branches use `agent/rNN-<ticket>`.
- Agent worktrees use sibling paths such as `../payr-worktrees/r02-domain` so they never appear as repository content.
- Every agent starts from a recorded integration-branch SHA.
- At most four implementation agents run concurrently. More lanes increase shared-contract and integration risk without shortening the critical path.
- Agents commit atomic changes on their branches. The coordinator alone pushes integration branches, opens release PRs, changes versions, and creates tags.
- Worktrees remain until the release tag and post-merge `main` CI are green.

The coordinator records this manifest before dispatch:

| Field | Required value |
| --- | --- |
| Tranche and ticket | Stable `RNN-TNN` identifier and short name |
| Branch and path | Exact branch and sibling worktree path |
| Base | Integration branch and full starting SHA |
| Scope | One outcome with explicit exclusions |
| Ownership | Writable files/directories and coordinator-owned files |
| Contracts | Freeze identifier and exact types/schemas consumed |
| Verification | Focused test commands and completion gate |
| Return | Commit SHA, changed files, tests, assumptions, blockers |

## Exclusive Ownership

| Area | Owner |
| --- | --- |
| `package.json`, `pnpm-lock.yaml`, dependency versions | Tranche coordinator |
| `.env.example`, `src/config/env.ts` | Configuration steward |
| `.github/workflows/**`, Playwright ports | CI steward |
| `supabase/migrations/**`, migration numbering | Database steward |
| `src/lib/db/**` | Repository lane after schema freeze |
| `src/app/globals.css`, root layout, app navigation, production brand files | Design-foundation lane |
| `src/proxy.ts`, CSP, nonce propagation, private response headers | Protected-surface security lane |
| `contracts/**`, ABI generation | Contract lane |
| `contracts/deployments/**` | Release coordinator after authoritative live read-back |
| Root status, planning, and version documents | Release coordinator |
| Package version and annotated tag | Release coordinator |

Dependency, environment, and migration requests are collected before fanout. If a new shared dependency becomes necessary, the lane stops while the coordinator updates the integration branch and distributes the new freeze SHA.

## Interface Freezes

| Freeze | Required before | Contract |
| --- | --- | --- |
| F0 | R00 | Source precedence, routes, brand ownership, release invariant |
| F1 | R02 fanout | State, time, money, status DTOs, token format, SQL/RPC signatures |
| F2 | R03 fanout | Auth message/cookie/origin, UI routes, projections, visual tokens, font delivery |
| F3 | R04-R06 fanout | Draft schemas, errors, publication descriptor, document port, storage rules |
| F4 | R07 fanout | EIP-712 fields, chain/contract binding, ABI, deployment metadata |
| F5 | R08-R09 fanout | Event verifier, receipt/outbox states, public status redaction, retry timing |

A freeze is complete only when its types, schemas, and failing contract tests are committed to the integration branch. If it changes after fanout, pause consumers, commit the correction centrally, merge the updated integration branch into each affected agent branch, and rerun focused tests. Do not rewrite shared branch history.

## Agent Ticket Contract

Every implementation prompt must tell the agent to:

1. Read `AGENTS.md`, the assigned acceptance section, the active freeze, and relevant installed Next.js documentation before changing framework behavior.
2. Work only in the assigned worktree and owned files.
3. Use red-green-refactor at the named seam and run focused checks regularly.
4. Keep external credentials and live writes in the coordinator/operator lane.
5. Leave package versions, tags, shared manifests, environment schemas, CI, and migration numbering to their designated owners.
6. Finish only after the requested tests pass and return the exact commit SHA, changed files, test results, assumptions, and blockers.

An implementation agent does not open a PR to `main`. The unit of review and release is the integration tranche, not the individual worktree.

## Integration Gate

Integrate agent commits in dependency order. After each integration, run the focused consumer tests for that lane. Before release:

1. Run all tranche-specific unit, database, browser, contract, and build checks.
2. Dispatch fresh GPT-5.6 Terra xhigh reviewers for specification and repository-standards review.
3. Add an adversarial security review for R02, R03, and R05-R09.
4. Resolve every high and medium finding. Fix or explicitly record low findings.
5. Run the complete release gate from a clean tracked worktree.
6. Prepare the version as the final integration-branch commit.
7. Update the draft PR title/body and mark it ready only after every gate is green.

The PR body records the base tag/SHA, included tickets, migrations, contract or schema changes, automated evidence, live evidence, known blockers, and forward-fix strategy.

## Resource Isolation

- Each Playwright worktree receives a unique `PAYR_TEST_PORT`; the configuration derives the server URL from it.
- Only the database steward runs the shared local Supabase instance during schema work. Other lanes use domain fakes until the integration DB gate.
- Foundry artifacts remain local to the contract worktree.
- Ignored environment files are not copied between worktrees. The coordinator injects only the values a local verification command requires.
- Live Arc, Vercel, Resend, DNS, wallet, and Claude operations remain serialized human/operator steps.

## Failure Protocol

- Interface contradiction: stop affected lanes and reconcile the source documents and freeze.
- Agent scope escape: keep valid owned-file commits, discard no user work, and reassign shared changes to the steward.
- Integration conflict: resolve in the integration worktree, then rerun both producer and consumer tests.
- Red release gate: keep the PR draft and dispatch a focused repair ticket from the current integration SHA.
- Failed post-merge CI: preserve the immutable tag and create a patch release PR.
- Failed live prerequisite: record authoritative evidence and continue only through the implementation plan's explicit fallback gate.

## Bootstrap Sequence

1. Preserve the current local hardening commit and dirty approved work on `integration/r00-bootstrap-v0.1.1`.
2. Reconcile the governing documents and add PR-first release tooling.
3. Run the complete R00 gate and independent reviews.
4. Disable squash/rebase merges and enable automatic branch cleanup in repository settings.
5. Create annotated baseline tag `v0.1.0` at the current remote `main` baseline, then protect version-tag creation/update/deletion with a GitHub Actions release bypass.
6. Prepare `v0.1.1`, push the integration branch and baseline tag, and open the R00 PR.
7. After the PR's check names exist, protect `main` with strict required PR checks before merging R00.
8. Merge through GitHub with a merge commit, let CI tag that merge `v0.1.1`, and verify the tag and post-merge CI.
9. Begin R01. Product worktree fanout starts only after R00 is complete.
