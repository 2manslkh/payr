# Repository Cleanup

Historical checkpoint: 9 September 2026. The baseline, inventory, and verification below describe that cleanup snapshot, not current branch state. This was local consolidation, not a new release, deployment, payment, email, or database-mutation approval.

## Current Integration Note

`main` is now at repository baseline `v1.4.1` / `923ef3f` (PR #14 merged). Root `integration/root-updates` retains unique discovery/roadmap commits and uncommitted dashboard/install/docs follow-up being integrated through user-approved feature-group commits and one combined PR into `main`. This note does not claim completed integration, final tests/PR results, release, or deployment of that work; R09 deployment evidence remains separately dated in [R09 release](r09-release.md).

The later [approved migration read-back](dashboard.md) records all eleven repository migrations applied with matching names locally and on hosted Payr, with unchanged recorded counts and no application deployment. It supersedes the historical pending collision/hosted-migration warnings below. Cleanup itself did not mutate either database; reset and fixture protections still apply.

## Historical Verified Baseline

- `v1.3.0` / `2dfa8db159c19f95a5af9e99cb4a5a428b2c2e2a`, merged through [PR #12](https://github.com/2manslkh/payr/pull/12). The remote annotated tag, current remote `main`, and successful [post-merge CI](https://github.com/2manslkh/payr/actions/runs/34242942628) were independently checked.
- Both public health routes returned reviewed release head `328fcdc26e5a817ded1a648771f301472637a240`; its tree matches the tagged merge. Deployment evidence and live limits are in [R09 release](r09-release.md).
- Root `integration/root-updates` was fast-forwarded from `4decffb` to that release. No new source commit, version bump, tag, push, or PR was created.
- The unoccupied local `main` branch was also fast-forwarded to the remote release; the active root remains on `integration/root-updates`.

## Preservation And Recovery

The complete pre-cleanup tracked and non-ignored untracked root changes were saved using `git stash push --include-untracked` with message `cleanup-2026-09-09-root-before-v1.3.0`. Stable stash object: `d8b9351cb799c3e6a1f8b95fd2e7cfd763e02d3e`. Its first parent is the old root baseline; its third parent contains the formerly untracked files. The earlier `root updates before v0.5 reconciliation` stash is also retained. Do not drop either stash as part of routine cleanup.

Inspect a specific original file without applying the whole stale snapshot:

```bash
git show d8b9351cb799c3e6a1f8b95fd2e7cfd763e02d3e:path/to/original-tracked-file
git show d8b9351cb799c3e6a1f8b95fd2e7cfd763e02d3e^3:path/to/original-untracked-file
```

Do not blindly `stash pop` onto the released baseline: the snapshot includes superseded payment, receipt, configuration, and dependency versions. Full reconstruction belongs in a separate recovery worktree based on `4decffb`, with explicit ownership and under repository-root `.worktrees/`.

Ignored environment files, production settings, operator journals, retained local/hosted databases, and frozen demo documents were not copied, reset, or modified. The user-owned architecture SVG and unique source artwork were restored byte-for-byte. The source banner is reference material, not approval to claim a live financing product.

## Retained Follow-Up

- Dashboard/selected-wallet balance and independent invoice loading: overview components, wallet balance route, exact-number motion, canonical overview DTO/repository, and their unit/DB/browser tests.
- Public `/install` guide and navigation: the separate plugin prompt remains disabled until distribution metadata is reviewed. Released MCP is not disabled by this placeholder.
- Dashboard SQL moved byte-for-byte to `202609080003_dashboard_overview.sql`, after released fairness/jitter migrations. Local applied history is not reconciled by this rename; see [dashboard operation](dashboard.md).
- Unique demo guides, architecture SVG, source mascot sheet/banner, deployment README, and explicit Foundry remapping remain available. No unique source file was discarded merely because its contents were not release-ready.
- Current status/product/README and release checkpoints now distinguish implementation, release, deployment, and live proof. Historical operator/payment observations retain their dates.
- The existing R09 worktree's connector-copy fixes were manually incorporated alongside dashboard changes without modifying that donor worktree. Landing copy now reflects released capabilities and operator-mode limits, preserving released artwork and short-screen behavior.

Released contract, signer, payment, MCP transport, reconciliation, receipt/outbox, protected-access, CI, dependency, and scheduling implementations were retained instead of overwriting them with older root copies. `package.json` stays at `1.3.0`; the follow-up diff is uncommitted and not deployed.

## Historical Worktree Inventory

| Path | Disposition | Reason |
| --- | --- | --- |
| Root | Active | `integration/root-updates` at `v1.3.0` plus retained follow-up |
| `.worktrees/r06-integration` | Removed | Clean released ancestor; only generated build/dependency/test artifacts |
| `.worktrees/review-fixes` | Removed | Clean released ancestor; only generated build/dependency/test artifacts; merged branch `integration/review-fixes-v1.0.0` also deleted |
| `.worktrees/r07-finish` | Retained | Operator-payment journal and deployment linkage |
| `.worktrees/r08-reconciliation` | Retained | Operator-payment journal and private local tooling state |
| `.worktrees/r08-deployment` | Retained | Dirty deployment snapshot and deployment linkage |
| `.worktrees/r09-client-mcp` | Retained | Nine uncommitted connector-copy files; no donor changes removed |

Keep `fix/r09-connector-copy` and branches attached to retained worktrees. Remove a merged branch only after its worktree is safely removed. No Docker containers, volumes, provider resources, journals, or environment files are cleanup targets.

Concurrent work observed during verification: the R09 donor switched to `fix/r09-connector-copy` at the release merge while retaining the same nine-file copy diff. New `src/components/landing/skill-install.{tsx,test.tsx,module.css}` files and landing integration also appeared. They were left untouched, are not part of the original root stash, and are not claimed as implemented or fully verified by this cleanup.

## Historical Verification

- Frozen dependency installation passed without lockfile changes.
- `pnpm verify` passed on the consolidated root: lint, typecheck, 1,981 unit/PDF tests (13 pre-build package-case skips), 10 release-tool tests, production build, all six PDF-entry trace assertions, and 35 compiled-document tests without skips.
- `git diff --check` passed. Independent read-only integration review found no actionable findings.
- `PAYR_TEST_PORT=3199 pnpm exec playwright test tests/e2e/landing.spec.ts tests/e2e/install.spec.ts tests/e2e/smoke.spec.ts --workers=2` passed all 28 desktop/mobile cases after updating the stale receipt-copy assertion. Landing/install screenshots were inspected on both viewports. This ran public routes directly, without the database-fixture launcher; it does not replace full dashboard/payment/receipt browser coverage.
- The design detector reported only the existing Helvetica/system-stack warning; the explicitly approved typography was preserved.
- Diagram, source artwork, and renamed dashboard SQL Git blob hashes matched the original stash. Released payment/MCP/receipt/security/dependency/schedule paths and the staging area had no diff.
- Retained database history was queried read-only. DB/browser fixture suites must use a disposable private daemon; the retained demo was not reset or used as a fixture target.

The full unit/verify counts above describe the cleanup snapshot before the concurrent skill-install additions. Its separate unit tests and installation behavior require their own verification. Re-run the complete gate from stable, intended source before the next release.

This cleanup verification was not live Claude, external-wallet, human inbox, unattended-delivery, or hosted forward-migration evidence. Hosted migration read-back was subsequently recorded in [dashboard operation](dashboard.md), not established by these cleanup tests. The other live acceptance gates remain R10/operator work, along with the final diagram, video, rehearsals, and submission confirmation.
