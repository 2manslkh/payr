# Root Release Execution

**10 September supersession:** this is the historical root-updates execution
record, not the current lane manifest or remaining test gate. Use
`reconciliation-v2.md` for planned breaking `v2.0.0` consolidation and fresh CI.
The former pending-plugin statement below is superseded by the archive-only
decision; `/install` now follows the retained MCP-first guide in `mcp-onboarding.md`.
Later Privy deployment/migration evidence is preserved in `privy-onboarding.md`.
Do not repeat this record's migrations, releases or consumed live approvals.

User-approved clean replay, 9 September 2026. Base `aebcd154810c234ade8f59cf2a451aa161ce11ff` (`v1.6.0`); replay commit `0be2fb9`. Original branch `integration/root-updates` remains at `72629a31bc3eb7fe22c4d91e45e00e4d1f453fa4`. The release-history dry run now accepts minor `1.7.0` without changing the gate.

## Ownership

| Ticket | Branch / Worktree | Base | Scope / Ownership | Verification / Return |
| --- | --- | --- | --- | --- |
| R10-RU01 | `agent/root-release-hardening` / `.worktrees/root-release-hardening` | `0be2fb9` | Balance API admission and sender completeness; new migration `202609090010_root_dashboard_hardening.sql`, new regression files, route and narrowly related server helpers. No historical SQL edits, manifests, shared fixture changes, or live DB writes. F1/F2/F3 contracts retained. | Focused red/green units; SQL regressions for coordinator's isolated DB gate; exact commit/files/results. |
| R10-RU02 | `agent/root-release-test-isolation` / `.worktrees/root-release-test-isolation` | `0be2fb9` | Configurable local-only Supabase project/ports/container identity, test launchers and fixture consumers, package script plumbing if necessary. No application/domain changes, migrations, credential copying, or operations against existing projects. Existing CI defaults preserved. | Launcher fail-closed regression tests; exact commands for isolated release DB start/reset/lint/tests; exact commit/files/results. |
| R10-RU03 | `integration/root-updates-v1.7.0` / `.worktrees/root-updates-v1.7.0` | `0be2fb9` | Coordinator owns wallet no-JavaScript fallback, release/status documentation, integration, reviews, version, push/PR/merge and tag verification. | Full DB/build/browser/release gates, three fresh review lanes, protected merge and tag/postmerge CI readback. |

Every agent reads AGENTS.md and relevant installed Next documentation, uses apply_patch for manual edits, and leaves user diagrams and all other worktrees untouched. No agent pushes, creates PRs, changes version, or accesses hosted credentials. Database fixtures run only after the coordinator establishes an owned disposable project; database and browser fixtures remain serial.

## Integrated Repairs

- `f6a9c5d` adds the forward hardening migration, distributed balance admission, and regression coverage. Fixed-minute limits are 12 reads/owner, 60/IP, and 600 globally. The overview now requires saved default terms in range, including valid zero. Historically applied SQL remains unchanged.
- `c72c91d` makes database commands and every fixture consumer use validated project/port/container identity, with fail-closed regression coverage. Existing CI defaults remain supported; opt-in isolation cannot select retained `payr` or its ports.
- `1f68557`, `6a6769a`, and `019c778` add a readable initial wallet message, a non-streaming authorized overview at `/app?view=static`, delayed-read and compiled no-JavaScript regressions, corrected landing caveat assertions, and an eight-second RPC abort deadline covering headers and body consumption.
- Status/product/readme now distinguish the v1.6.0 base, opt-in sender capabilities, source integration, historical deployment evidence, and this release attempt. The user diagram blob matches the preserved integration branch; it was not edited.

## Review Evidence

Fresh independent standards, specification, and adversarial-security lanes reviewed `aebcd15...d261725` using Codex CLI `gpt-6-astra`, reasoning effort `high` (not the runbook's unavailable named Terra model). Original high/medium findings were repaired; follow-up reviews examined the complete candidate through `6a6769a`, and the final standards/specification delta through `019c778`. All lanes report no remaining findings.

The initial follow-ups identified three additional medium issues, all repaired: React streaming hid records without JavaScript; the landing browser assertion expected a removed heading; viem's internal timeout did not bound stalled response bodies. The body-stall unit test reproduced failure before repair. The first full browser run then exposed missing compiled `<noscript>` wallet text (82 passed, two failed). Replacing it with ordinary initial-state text passed both targeted cases and the subsequent complete browser run. Failed attempts were not treated as gate passes.

## Verification Before Preparation

Owned project `payr-root-release-v170` was created only after API 59321, Postgres 59322, shadow 59320, and browser 3197 were verified unused. Docker name, Supabase project label, generated workdir, bindings, and loopback status URLs were checked. Existing retained projects and private validation containers were not reset or reused. CLI printed the primary Git branch name during reset, but inspected container labels/workdir/bindings identify the isolated release project; fixture consumers use the validated container, not that informational branch string.

- Frozen dependency installation passed without credentials or lockfile changes.
- `pnpm db:start`, `pnpm db:status`, `pnpm db:reset`, and `pnpm db:lint` passed on the owned project. Reset applied all thirteen migrations, including dashboard, sender opt-in, and the new hardening migration.
- `pnpm test:db:local`: 14 files, 497 passed. Includes direct privilege denial, sender completeness, admission quotas, contention, and existing publication/receipt/identity transactions.
- `pnpm test:e2e`: all 84 desktop/mobile Chromium cases passed at `019c778`. The same stack remained running; no database fixtures ran concurrently with browser fixtures.
- Focused units and typecheck passed after each repair, including the delayed-record and stalled-response-body regressions. `pnpm test:release` passed 22 release/isolation tooling cases in the isolation lane.
- `pnpm test:contracts`: 15 passed, including 256 fuzz runs. `pnpm contracts:abi:check` passed. No contract changes, deployments, or transactions were made.
- Main was refreshed at `aebcd15`; the minor release dry run accepts `1.7.0`. The release script must still run complete `verify` and browser gates from a clean tracked worktree before the final package-only version commit. PR checks, merge SHA, annotation, and post-merge CI are recorded by GitHub and coordinator readback, not preclaimed here.

## Release Boundaries

This release includes additive migration `202609080003_dashboard_overview.sql` relative to main and new forward migration `202609090010_root_dashboard_hardening.sql`; `202609090001_connector_sender_profile.sql` is retained from main. The dashboard migration has separately dated hosted readback; the hardening migration is verified only in this disposable database. Apply missing migrations through an approved forward operation before application deployment. Do not edit hosted-applied SQL, reset retained data, move tags, or write corrective commits directly to main. A post-merge failure requires a patch-release PR.

No new hosted migration, application deployment, payment, email, or live Claude/external-wallet rehearsal is claimed. Receipt email remains disabled. The separate plugin prompt remains unavailable pending reviewed distribution metadata. Existing historical evidence and consumed live-operation approvals retain their limits.
