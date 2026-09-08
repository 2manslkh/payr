# R09 Implementation

## Execution Manifest

- Ticket: R09-T01, client payment integration and canonical Claude MCP.
- Integration branch: `integration/r09-client-mcp`.
- Worktree: repository-root `.worktrees/r09-client-mcp`.
- Base: `v1.2.0`, `8a87a76898badfc03dd9dc506ea3c3637e74a9dc`.
- Execution: one sequential implementation lane, not implementation-agent fanout. Root remains untouched; no snapshot commits or release actions are implied.
- Scope: selectively port the root browser-payment implementation onto released R08, consume complete protected F5 status, add the four-tool stateless MCP endpoint and portable workflow.
- Exclusions: dashboard/install/branding redesign, root cleanup, retained-database resets, schema changes, live transactions, email sends, deployment, version changes, pushes, and release PRs.
- Ownership: the implementation lane owns R09 application files and focused tests in this worktree. Dependency, configuration, protected routing, and documentation changes remain coordinated within this single lane. Existing R08 repositories, receipt/outbox workers, migrations, and the user diagram are read-only.
- Contracts: committed F4 settlement authorization; F5 `2026-09-08-f5-settlement-workers.md`; canonical invoice schemas and service approval fields. Paid requires persisted settlement; receipt readiness and provider acceptance remain distinct.
- Verification: focused payment/MCP tests, lint, typecheck, complete unit/release tests, production build and compiled-document trace tests; isolated browser and DB gates only where fixtures cannot damage retained local data.
- Return: exact changed files, commands/results, assumptions, blockers, and remaining live gates. The user subsequently authorized commit, deployment, and release; see the release authorization below.

## Preservation Boundary

`integration/root-updates` is a read-only donor, not the integration baseline. Do not bulk-copy its older reconciliation, status, proxy, dependency, or cron files over R08. Preserve released fairness/jitter fixes and all worker schedules. The root dashboard migration shares `202609080001` with released publication fairness; dashboard integration and migration-history reconciliation are outside R09.

## Completion Evidence

Local implementation and regression verification completed on 8 September 2026. This evidence describes the pre-release implementation at package version `1.2.0`; release preparation selects `v1.3.0`. It is not live Claude or external-wallet proof. Deployment and release outcomes are recorded separately in `docs/ops/r09-release.md` and the protected PR.

| Gate | Result |
| --- | --- |
| `pnpm verify`, macOS and isolated Linux | Passed: lint, typecheck, 1,948 unit/PDF tests, 10 release-tool tests, production build, trace checks, 35 compiled-document tests |
| Unit-phase skips | 13 compiled-package cases intentionally skipped before build; the post-build 35-case package gate runs without skips |
| Fresh isolated Supabase reset and SQL lint | Passed all ten released migrations; no new migration |
| `pnpm test:db:local` in isolated Linux | 467 tests passed across 13 files, including five real-repository MCP endpoint admission cases |
| `PAYR_TEST_PORT=3099 pnpm test:e2e --workers=2` in isolated Linux | 72 tests passed across desktop/mobile, including four payment success/no-write simulations and existing receipt/publication/private-surface regressions |
| Independent specification and standards/security reviews | Findings repaired and follow-up reviews report no unresolved findings |
| `git diff --check` | Passed |

The latest Linux run includes the final browser-test selectors and CSP assertions. The host verify passed the same application source; browser-test-only changes were subsequently typechecked/linted in Linux. Foundry was not rerun because contracts and ABI were unchanged. Protected CI/release checks are not substituted by local evidence.

## Implemented Boundaries

- Payment uses the root wallet adapter as a selective donor, with exact signed-data validation, account/network/balance/gas checks, replacement recovery, and bounded status polling. It consumes released R08 status and workers, not the older root reconciler.
- A committed successful receipt and exact matching `InvoicePaid` event may show `Payment final; syncing receipt`; only canonical persisted settlement shows Paid. Receipt readiness and provider acceptance remain separate. A reconciliation endpoint failure does not block status reads, and a stale response cannot erase an observed settlement after manual retry.
- MCP uses the pinned SDK's request-scoped stateless Web Standard transport, four canonical tool adapters, existing token/workspace/rate-limit boundaries, explicit approvals, generic failures, and sanitized SDK request URLs. Total request-body read time is bounded to five seconds and size to 68 KiB. Admission still atomically rechecks lifecycle and charges the actual action once.
- The user explicitly approved the narrow WalletConnect CSP exception in `DECISIONS.md`. Only admitted unpaid/unexpired published invoice HTML receives relay/verification destinations; PDF/status/receipt/error surfaces retain the narrower policy. No telemetry, remote QR image service, or protected invoice metadata is introduced.
- Next 16.3.4 Turbopack lazy external chunks have no nonce attribute. Browser assertions match the unchanged policy: actual document nonce equality for inline scripts, same-origin external scripts, and no script/style CSP violations. No unsafe-inline/eval or wildcard was added to fix a test.
- The portable workflow and redacted live-smoke procedure are in `skills/payr-create-invoice/SKILL.md` and `docs/ops/mcp-claude-smoke.md`.

## Test Isolation

Runner: `payr-r09-gate-20260908`, Node 22 Bookworm, private Docker daemon and anonymous Docker data volume, no host socket, no bind mounts, and no published ports. Supabase's familiar local API/Postgres ports resolve inside that runner only. The root retained stack and all R08 agent stacks were not reset or modified. A tracked/nonignored source export excluded local environment files, journals, dependencies, and test artifacts. Slow registry downloads were recovered by copying only package/browser caches and public base images from the earlier runner; no credentials or database state were copied.

The dedicated runner is stopped after verification and retained for deliberate reruns. Temporary bootstrap/export scripts reside under the approved OS temporary `opencode` directory, not the application tree. A new verification snapshot is required after further source changes.

## Remaining Gates

1. Review and commit the isolated R09 changes when authorized, then use protected CI and the versioning runbook for any requested release. Root's 138 pending paths were left untouched and still require their separate reconciliation.
2. Obtain deployment approval and check the combined production snapshot so existing functionality is not removed. Preserve the published origin, R08 worker schedules, and intentionally disabled production-wide receipt delivery.
3. Run the deployed Claude connector lifecycle smoke, including discovery, missing fields, draft/revision, explicit publication, replay, canonical status, separate void, and post-revocation denial. Claude availability and compatibility remain unverified.
4. Run a separately approved full external-wallet/mobile rehearsal and verify the real WalletConnect flow under the approved CSP. Simulated browser success and historical QR evidence do not establish this gate.

Existing R08 and root live evidence does not establish R09 completion. Existing payment/email approvals must not be reused. No new live transaction, email send, contract deployment, or hosted migration was performed.

## Release Authorization

On 8 September 2026 the user requested commit, deployment, and release, then explicitly selected **Release With Recorded Limits** after being told that deployed Claude and external-wallet acceptance remained unverified. This authorizes releasing the locally verified implementation as `v1.3.0`, not claiming full live R09 acceptance or performing payments/email sends. Preserve the published origin and production secrets; keep receipt email disabled. Protected CI, merge topology, immutable tagging, and post-merge checks remain required.
