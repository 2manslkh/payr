# R04 Draft And Revision Evidence

Evidence recorded `2026-09-06`. Base: `v0.2.0` / `400fe13841cef8d54d0f7cd4ee11d92146ccdb4c`.

## Delivered Scope

- Strict partial draft input, recursively prohibited authority fields, confirmed provenance, exact native-USDC arithmetic, real calendar dates, and bounded request parsing.
- Structured omissions with no invoice/version/idempotency write; paired draft/version revision, profile rechecks, and atomic compare-and-swap append.
- Stable idempotent results reconstructed from the original immutable version, including races with revisions, profile changes, and client alias changes.
- Authoritative sender snapshots and pending client proposals without premature client-profile writes, invoice numbering, publication attempts, or links.
- Workspace/owner-or-connector-scoped repository operations, private read APIs, and server-rendered overview, invoice ledger, and read-only version detail/history.
- Shared ISO-country validation, readable/editable older F2 country values with actionable draft omissions, and consistent normalized provenance URLs.
- Ephemeral local database-backed browser verification without a production auth/data bypass.

R04 covers Task 4.1/4.2 and the read-only projection slice. R05 owns publication, voiding, status/Gmail response reconstruction, and worker crash recovery. R06 supplies actual document/storage/protected-route implementations. The released `0001` and `0002` migrations and the four brand references remain unchanged.

## Lane Manifest

F3 baseline: `6453b4c99edccfd64adaceae675bcf3035d5a16e`.

| Lane | Worktree | Initial implementation commit |
| --- | --- | --- |
| Schema/service/POST | `.worktrees/r04-service` | `e51ee627fe2b12633f2593b69ad18e65839099a3` |
| SQL/repository | `.worktrees/r04-database` | `66b83e4d541c3b385a1c5d0a501d1713382d5fb9` |
| Projection/SSR | `.worktrees/r04-projections` | `e476722f1366c4d272a2ef8c2523453ac5aa41ac` |

All lanes were integrated with merges. The database lane received coordinator contract updates and produced targeted repairs `55c80281be3d7a8da3a0ac6b0231a89ddcdfb169` and `d2370a3e08b4b51d9cc5d858d904742b1a9a72e0`. The sole new migration is `202609040003_draft_functions.sql`.

## Verification

| Gate | Local result |
| --- | --- |
| Lint / typecheck / production build | Passed |
| Unit tests | 739 passed across 30 files |
| Database integration | 306 passed across 6 files, including all prior tests |
| Release tooling | 10 tests passed |
| Production desktop/mobile browser | 36 passed, no skipped authenticated or SSR cases |
| Reset / SQL lint | Three migrations apply cleanly; no SQL lint errors |
| Secret scan | Gitleaks over R04 history: no leaks found |
| Preserved artifacts | No changes to released migrations or brand references |
| Clean GitHub runner | Draft PR #5 run `33996615769` passed `web`, `browser`, and `database`; version metadata was deferred until the final release commit |

The service/database flow uses actual route handlers and the real Supabase adapter. It proves missing-key non-consumption, no-op confirmation, cancelling pending changes without saving clients, original-version replay after profile changes, deterministic same-key races, renamed-client races, normalized URL provenance, and recovery of legacy country values. Raw-RPC tests separately exercise malicious JSON-null discriminants, authorization, snapshot consistency, precision, immutability, and rollback.

Browser tests seed isolated local workspaces and use real scoped RPCs for invoice data. They verify content in server-rendered HTML, search/state/pagination against actual rows, separate commercial/payment labels, exact large amounts, pending defaults/provenance, escaped hostile text, cross-tenant denial, independent page guards, and absence of authoring or bearer-link controls. Older console interaction mocks remain for their own UI tests; they are not used to fake SSR invoice data.

The `browser` CI job now provisions its own local Supabase stack. Locally, `pnpm test:e2e` and `pnpm test:db:local` share `scripts/run-local-tests.mjs`; run them serially because database fixtures can reset shared records. The launcher captures only local test credentials without logging or writing them.

## Review Repairs

- Rechecked replay after a resolution/CAS failure so identical concurrent requests do not return false stale-version or renamed-selector errors.
- Canonicalized no-op proposals and restoration of saved values to align service, adapter, and SQL diff/provenance rules.
- Closed SQL three-valued-logic holes in snapshot/provenance discriminants and required scalars, with direct-RPC zero-write regressions.
- Aligned profile-entry ISO validation and legacy read/recovery behavior without rewriting old records or released migrations.
- Normalized URL spellings before fingerprinting and aligned SQL registered-name/port acceptance.
- Corrected browser selectors and awaited committed SSR filter navigation rather than interacting with the outgoing page.

Standards, specification, and targeted transaction-security review have no remaining high/medium findings. Bounded desktop/mobile visual review passed with no confirmed defects. The inherited Helvetica detector warning is accepted under the approved system-font fallback; no external font request or visual redesign was introduced.

## Remaining Boundaries

The public deployment remains the earlier health shell. No hosted migration, live publication, invoice PDF, protected payment link, funded-wallet payment, Claude connection, or receipt delivery is claimed. Hosted Supabase, provider configuration, wallet funding, and the authenticated submission deadline remain operator gates.

The release PR must pass `web`, `browser`, `database`, and `release-metadata`; trusted CI then tags the exact merge as `v0.3.0`. Its PR and post-merge run supersede this pre-release evidence snapshot. R05 must freeze its additional publication RPCs and consume the immutable R04 draft contract rather than replacing it.
