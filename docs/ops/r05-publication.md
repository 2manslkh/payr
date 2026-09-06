# R05 Publication And Recovery Evidence

Evidence recorded `2026-09-06`. Base: `v0.3.0` / `57638dcbfc34342ea680d42acfba9b3988ee2ad6`.

## Delivered Scope

- Authorized publication replay lookup before current configuration, permanent sequence allocation, immutable attempt binding, inactive link reservation, and active-attempt draft revision exclusion.
- Worker claims with random identity, increasing decimal-text fences, live 60-second leases, stored-state recovery, and independent PDF magic/length/type/hash/ABI-commitment/QR verification.
- Atomic finalization or durable terminal failure without partial client/profile/link/invoice effects. Approved provenance survives saved-client reads; old draft snapshots/replays remain immutable.
- Canonical status and exact six-field link-only Gmail packages; explicit Share/Copy; replay-safe voiding; bounded expiry; shared settlement/authorization/void serialization.
- Default SSR/RSC props exclude bearer URLs, salts, storage keys, and verifier metadata. No browser publication form or automatic email send was added.

`202609040004_publication_functions.sql` is additive. Released migrations `0001-0003` and all four brand references are unchanged. The deterministic document adapter is test-only. New production publication/claim paths fail closed until R06 installs the real adapter; read-only replay of finalized records does not depend on it.

## Lane Manifest

Freeze baseline: `0484e71bc2a5c66f7c95ee4c36c5b5e75acdadd2`.

| Lane | Worktree | Implementation commit |
| --- | --- | --- |
| Publication worker | `.worktrees/r05-worker` | `70ba36427782b4cd8bd5c64e023c3667b86cb34c` |
| Lifecycle/Gmail | `.worktrees/r05-lifecycle` | `1b97cd558935bbd9e384695ae63c678983fcf626` |
| Invoice controls | `.worktrees/r05-ui` | `62f339547456d3205da8b474149e6bdf7876ecac` |
| Publication database | `.worktrees/r05-database` | `e4c6c03eca8624be827acd5d55239c46d5104e65` |

The database dispatch lost its API connection. Its partial work was preserved, synced with the integration branch, and completed rather than restarted. It later added the authorized replay RPC at `160be03ff4c03e6480aedbec81c026f69e1b03b6`. All lanes were integrated with merges for ancestry-safe cleanup.

The concurrent local-configuration edit selecting Postgres `58322` was preserved and propagated through launchers/fixtures. The previously running Payr container on a temporary port was reconciled to committed configuration. API remains `57321`, shadow port `57320`; other projects were untouched.

## Verification

| Gate | Local result |
| --- | --- |
| Lint / typecheck / production build | Passed |
| Unit tests | 1,278 passed across 40 files |
| Database integration | 406 passed across 7 files, including all previous suites |
| Release tooling | 10 tests passed |
| Production browser | 40 desktop/mobile tests, including actual local publication/share/void endpoints and canonical draft fixtures |
| Reset / SQL lint | All four migrations apply cleanly; no SQL lint errors |
| Secret scan | R05 Git history clean; no production credentials committed |
| Clean GitHub runner | Draft PR #6 run `34012831924` passed `web`, `browser`, and `database`; version metadata was deferred until the final release commit |

The SQL suite verifies reserve/claim/store/finalize/fail, lease expiry/reclaim/stale fences, original metadata replay, permanent number consumption, profile/client rollback, web provenance, active revision blocking, inactive link behavior, terminal immutability, tenant/scope/privilege denial, void/settlement races, and bounded expiry. Integrated worker/lifecycle tests use real Supabase transactions and deterministic test documents, not a production renderer.

Replay tests cover invalid current binding/active-key configuration with retained original keys and an unavailable provider. Active recovery uses only retained keys and documents. Void and void replay remain usable without link/explorer configuration. New reservations continue to require valid current binding, active material, and a real adapter.

Browser tests validate real SSR/RSC exclusion of credentials, explicit sharing, copy/hide/navigation cleanup, exact-version void confirmation, revocation, refresh completion, and post-void focus. Actual share responses are checked in Node memory with non-value-bearing assertions, then credential values are replaced with noncredential fixture URLs before the browser receives them. Trace/video/automatic screenshots are disabled for those scenarios; explicit screenshots are taken before sharing or after links are cleared. This preserves real endpoint verification without retaining usable fixture bearer URLs in failure evidence.

## Review Repairs

- Decoupled authorized replay from current reservation configuration and document selection; made link configuration lazy and irrelevant to voiding.
- Added the scoped replay RPC and early returned-invoice/version validation before any worker claim.
- Shared strict approval-body parsing between publish and void, rejecting duplicate decoded approval/version/key fields before service access.
- Updated browser fixtures to use the actual canonical draft service and await committed navigation.
- Protected credential-bearing test responses from trace/DOM artifact capture.
- Completed refresh feedback and moved successful-void focus/announcement outside permission-keyed controls.

Standards, specification, worker/lifecycle security, and SQL locking/atomicity reviews found no remaining high/medium publication findings. The bounded visual pass accepted the established design; its two feedback/focus findings were corrected and verified with unit and browser assertions. No new visual language or unlicensed assets were introduced.

## Pre-Release Timing Risk

A later local reset/run returned `400` for login nonce issuance; its isolated rerun returned `400` for payout nonce issuance. The second failure's redacted PostgreSQL context identifies the combined timestamp guard in released migration `0002` (`payr_issue_auth_nonce_v1`, function line 46). This is consistent with transient application/database clock differences, but the earlier clock delta and exact failing predicate were not captured. The auth implementation is unchanged from `v0.3.0`; the risk is pre-existing, not a demonstrated R05 regression.

Code-only assertion diagnostics were added without logging challenges, signatures, or cookies. One isolated run followed by 20 fresh-process auth-flow runs passed without production changes. Another complete reset, SQL lint, and all 406 database tests then passed. Independent review accepted these diagnostics and fresh gates under the existing strict timing contract, while retaining clock sensitivity as an unresolved availability risk. No sleeps, test retries, backdating, or relaxed expiry/future-issued checks were introduced. A recurrence during release gates must stop release preparation for failure-time timing evidence and an additive, reviewed repair if needed.

## Remaining Boundaries

R05 does not perform a hosted rollout, real PDF delivery, live payment, MCP connection, Gmail send, or receipt email. R06 must implement actual PDF/QR/storage and protected surfaces; later tranches retain the live chain/connector/delivery gates.

The preserved `.env.example` RPC default uses `rpc.testnet.arc.network`, which this tranche did not verify. Current official documentation lists `https://rpc.testnet.arc.io` and documented provider alternatives. Recheck the selected endpoint with `pnpm verify:arc` before live chain work; no R05 test relies on the unverified example.

The release PR must pass `web`, `browser`, `database`, and `release-metadata`, then trusted CI tags the exact merge as `v0.4.0`. The merged PR and post-merge run supersede this pre-release evidence snapshot.
