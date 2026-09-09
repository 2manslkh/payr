# Root Updates Release Checkpoint

Historical checkpoint, 9 September 2026. **The original ancestry was blocked; not released, pushed, or deployed by that attempt.**

The user subsequently authorized a clean replay onto current main, preserving `integration/root-updates` unchanged. `integration/root-updates-v1.7.0` starts at `v1.6.0` / `aebcd15` and replays the integrated tree without the old package-version ancestry. The release dry run now passes without modifying the validator. See [current execution](root-release-manifest.md); findings and verification below describe the original attempt, not the final release gate.

## Integration

- Authorized branch: `integration/root-updates`, isolated at `.worktrees/root-updates-release`.
- Preserved starting local head: `365bd21163d223494670d15cd74dc4340e96bf79`; the older remote branch was `45b02b5`.
- Fetched base: `origin/main` at `aebcd154810c234ade8f59cf2a451aa161ce11ff`, annotated release `v1.6.0`.
- Merge commit: `f53871a950abf942b78b7cb0a8317707692255ce` (`merge: reconcile root updates with v1.6.0 sender setup`).
- Resolved conflicts in Connections, discovery source/tests, and console browser tests. Main's sender scopes remain opt-in and unchecked; discovery documents both sender tools. Root dashboard/wallet/install/roadmap changes remain. Patch-equivalent discovery history was not rewritten.
- The dirty primary `integration/agent-readiness` worktree, ignored credentials, existing databases/containers, and user-owned diagrams were not modified.

## Release Blocker

`pnpm release:prepare -- minor --dry-run` fails before verification or a version change:

```text
The package version may change only in the final release commit; cba78a3df1e42a85c4a6efdf454dfa738af6a536 contains 1.4.1, expected 1.6.0
```

`scripts/prepare-release.mjs` checks full package history in `origin/main..HEAD`. The historical baseline merge remains in that range and records the old version. A forward commit cannot change that historical fact. Merely restoring HEAD to `1.6.0` does not satisfy the gate. The coordinator did not weaken the validator, rewrite history, amend commits, force-push, or substitute the older remote branch.

Continuing requires an explicit decision reconciling preservation of this branch's ancestry with the release-history invariant. A separately authorized clean release branch could replay the unique feature changes onto current main while preserving this integration branch as evidence; that would not merge the requested ancestry and has not been performed. Expected minor release is `1.7.0`, but no version was prepared.

## Verification

- Frozen dependency installation passed in the isolated worktree, without manifest/lockfile changes or credential copying.
- Focused typecheck and four unit files passed: 87 tests covering Connections, discovery, MCP server, and connector service.
- `pnpm verify` passed at `f53871a`: lint, typecheck, 105 unit files / 2,049 passed / 13 pre-build package-case skips, 10 release-tool tests, production build, function trace checks, and 35 packaged-document tests without skips.
- `git diff --check` passed after conflict resolution.
- No DB start/reset/lint/integration or full browser gates were run in this attempt. The host has retained `supabase_db_payr` and two existing private validation containers. Their ownership was not assumed. The harness hardcodes local API 57321, database 58322, and `supabase_db_payr`; an isolated worktree alone is not database isolation. Use a separately owned disposable daemon/network runner, not the retained database.
- No PR exists for this branch at the checkpoint. No release verification, new tag, merge, or post-merge CI result is claimed.

## Independent Reviews

Fresh parallel read-only standards, specification, and adversarial-security reviews completed through Codex CLI using actual model `gpt-6-astra`, reasoning effort `high`. They are not claimed as the runbook's named Terra model. Earlier xhigh review attempts timed out and are not counted as completed reviews. All reviews used base `aebcd15` and integrated head `f53871a`.

All findings below remain open; this is not a green review gate:

- **Standards, high:** historical package-version invariant blocks release, as reproduced above.
- **Standards, medium:** `src/components/wallet-balance.tsx:80-82` leaves a skeleton and hidden checking text when JavaScript is disabled. `DESIGN.md` requires readable content without JavaScript. Add a visible no-JavaScript explanation and regression coverage.
- **Specification, medium:** `supabase/migrations/202609080003_dashboard_overview.sql:24` excludes default payment terms from `senderComplete`. An otherwise complete legacy profile with unset terms can hide setup despite the sender-tool requirement that missing fields include unset terms. This omission is inherited from v1, not a new regression. The migration has recorded hosted application: do not edit its SQL in place. Any correction needs a new forward migration and DB regression coverage, coordinated with concurrent migration owners.
- **Security, medium:** `src/app/api/wallet/balance/route.ts:20` dispatches two upstream RPC reads per authenticated request without server-side admission limits. A signed-in caller can exhaust shared RPC/application resources. Add reviewed distributed admission limits before dispatch and abuse regression coverage. Deployment-level rate limits were not verified.

Reviewers found no additional concrete exploitable issues in the focused authorization, workspace/grant, stale-wallet-response, or installation credential flows. This is static review, not live security evidence.

## Remaining Gates

Resolve the history/policy decision and all medium findings; repeat independent review after repairs. Then provision owned disposable database isolation and run `pnpm db:start`, `pnpm db:reset`, `pnpm db:lint`, `pnpm test:db:local` serially, keeping that stack for browser tests. Refresh main, run the complete `release:prepare` gate and `release:verify`, push normally, and open the versioned PR with migration and evidence details. Merge through GitHub with a merge commit only after required checks pass on the current branch. Verify the annotated tag, tagged package version, merged PR, and post-merge main CI. Keep this worktree until that outcome is green.

Existing diagrams, retained demo data, consumed payment/email approvals, live configuration, and unrelated primary-worktree work remain outside this release attempt's write scope.
