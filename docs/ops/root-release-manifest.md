# Root Release Execution

User-approved clean replay, 9 September 2026. Base `aebcd154810c234ade8f59cf2a451aa161ce11ff` (`v1.6.0`); replay commit `0be2fb9`. Original branch `integration/root-updates` remains at `72629a31bc3eb7fe22c4d91e45e00e4d1f453fa4`. The release-history dry run now accepts minor `1.7.0` without changing the gate.

## Ownership

| Ticket | Branch / Worktree | Base | Scope / Ownership | Verification / Return |
| --- | --- | --- | --- | --- |
| R10-RU01 | `agent/root-release-hardening` / `.worktrees/root-release-hardening` | `0be2fb9` | Balance API admission and sender completeness; new migration `202609090010_root_dashboard_hardening.sql`, new regression files, route and narrowly related server helpers. No historical SQL edits, manifests, shared fixture changes, or live DB writes. F1/F2/F3 contracts retained. | Focused red/green units; SQL regressions for coordinator's isolated DB gate; exact commit/files/results. |
| R10-RU02 | `agent/root-release-test-isolation` / `.worktrees/root-release-test-isolation` | `0be2fb9` | Configurable local-only Supabase project/ports/container identity, test launchers and fixture consumers, package script plumbing if necessary. No application/domain changes, migrations, credential copying, or operations against existing projects. Existing CI defaults preserved. | Launcher fail-closed regression tests; exact commands for isolated release DB start/reset/lint/tests; exact commit/files/results. |
| R10-RU03 | `integration/root-updates-v1.7.0` / `.worktrees/root-updates-v1.7.0` | `0be2fb9` | Coordinator owns wallet no-JavaScript fallback, release/status documentation, integration, reviews, version, push/PR/merge and tag verification. | Full DB/build/browser/release gates, three fresh review lanes, protected merge and tag/postmerge CI readback. |

Every agent reads AGENTS.md and relevant installed Next documentation, uses apply_patch for manual edits, and leaves user diagrams and all other worktrees untouched. No agent pushes, creates PRs, changes version, or accesses hosted credentials. Database fixtures run only after the coordinator establishes an owned disposable project; database and browser fixtures remain serial.
