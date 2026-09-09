# R09 Direct Chat Setup

## Manifest

| Field | Value |
| --- | --- |
| Ticket | R09 sender-chat setup |
| Branch | `fix/mcp-sender-profile` |
| Worktree | `/Users/kenk/Desktop/coding-projects/eth-global-online-2026/.worktrees/mcp-sender-profile` |
| Base | `origin/main`, `51ce57e617877316b0b02cbd0ad5d4e7137894aa` |
| Ownership | Sole implementation/database steward for this task in the assigned worktree; no fanout or additional worktrees |
| Exclusions | Root worktree and user changes, package/dependency versions, environment copies, live writes, commits, pushes, payout authority |
| Decision | User-approved 2026-09-09 Direct Chat Setup overrides dashboard-only sender policy; payout stays owner-signed dashboard only |

## Contract Changes

- `CONNECTOR_SCOPES` remains the four invoice defaults. `SUPPORTED_CONNECTOR_SCOPES` adds `sender:read` and `sender:write`; metadata accepts a validated nonempty unique subset that must include `invoice:status` for MCP initialization and tool discovery. Null, unknown, duplicate, empty and missing-`invoice:status` scope lists fail closed. The schema reports `Scopes must include invoice:status for MCP initialization and tool discovery`; v2 mint and the table constraint enforce the same requirement through the shared SQL validator. No scope is silently added.
- `POST /api/connectors` accepts optional `scopes`. Omission uses the unchanged shipped `payr_create_connector_v1`; explicit scopes use `payr_create_connector_v2` with existing named arguments plus `p_scopes text[]`. The new RPC reuses v1 mint validation and creation audit in one transaction. No existing token or table default is widened.
- Connections has an unchecked Direct Chat Setup checkbox, granting both sender scopes in addition to invoice defaults. The UI states setup/update authority, explicit approval, no payout authority, and the need for a new credential. History displays actual granted scopes.
- `get_sender_profile({})` requires `sender:read`; returns `{profile, missingFields, guidance}`. Profile includes ID, revision, nullable saved fields and the existing read-only payout wallet. Missing fields include unset default terms and unsupported stored country codes.
- `save_sender_profile` requires `sender:write` and strict `businessName`, `contactName`, `contactEmail`, `billingAddress`, `invoicePrefix`, `defaultPaymentTermsDays`, `expectedProfileId`, `expectedRevision` (1..2147483647), and literal `approval:true`. Uses the existing sender normalization/address/prefix/terms schema. It can complete the skeletal profile created at owner login and later update it. It cannot create a workspace or change payout.
- `payr_connector_get_sender_profile_v1(p_workspace_id uuid,p_connector_id uuid)` and `payr_connector_save_sender_profile_v1(p_workspace_id uuid,p_connector_id uuid,p_input jsonb)` are service-role-only, empty-search-path security-definer RPCs. They use the existing token-first authorization lock and recheck expiry after profile lock waits. Save compares ID/revision and updates only permitted fields atomically; read/save success audits carry the connector token ID. Admission retains bounded allowed/denied/rate-limit audits. Rejected RPC transactions roll back; no false success audit is persisted.
- Actor is derived by transport from authenticated workspace/token IDs with `ownerWallet:null`; sender services reject owner actors. RPCs do not accept an owner-wallet argument. Discovery lists capabilities, not granted authority; protocol admission needs `invoice:status`, so sender-only credentials are rejected at mint. Invoice defaults plus `sender:read` initialize, discover and read sender profiles, but cannot save sender profiles.
- Safe conflicts are `PROFILE_CONFLICT` and `REVISION_CONFLICT`. A repeated save deliberately conflicts rather than replaying. Read again and obtain fresh approval; never auto-increment revisions. SQL unauthorized access returns `NOT_FOUND`; transport scope denial remains generic `CONNECTOR_INVALID`/HTTP 401 without data disclosure.
- Draft schemas remain unchanged and prohibit sender/payout input. Missing-fields guidance directs opted-in users to the sender tools, otherwise Settings/new Connections, and preserves the original draft request/key after setup. No draft/version/client/publication/idempotency write occurs for missing fields (existing auth audits are separate).
- Owner sender and signed-payout RPC behavior is unchanged. Sender revision increments invalidate concurrently reviewed owner/payout or publication facts under existing checks.

Migration: `supabase/migrations/202609090001_connector_sender_profile.sql`. Apply before deploying the new application code, only through an approved migration operation. No migration was applied during implementation.

## Verification

Commands run in the assigned worktree, without environment copies:

```bash
git status --short --branch
git rev-parse HEAD origin/main 51ce57e
pnpm install --frozen-lockfile
pnpm test:unit src/lib/mcp/server.test.ts
pnpm test:unit src/components/console.test.tsx
pnpm test:unit src/lib/mcp src/lib/db/identity.test.ts src/lib/connectors src/components/console.test.tsx
pnpm test:unit src/lib/mcp src/app/api/mcp src/lib/db/identity.test.ts src/lib/connectors src/components/console.test.tsx
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:unit --project unit --maxWorkers=1
pnpm test:db src/lib/db/identity.integration.test.ts
git diff --check
```

The synthetic ETHGlobal-shaped invoice regression was observed red at MCP `get_sender_profile` (`INVALID_INPUT` before implementation), then green: fixed 2030-01-01 clock, five missing sender fields, zero draft writes, approved save, unchanged payout, original same invoice/key yielding `DRAFT_READY`. UI tests were observed red before adding the checkbox, then green for unchecked defaults and both-scope opt-in.

Database tests cover scoped/default mint, malformed scopes and payloads, profile/revision conflicts, repeated saves, setup/update, unchanged owner behavior/payout, token-attributed audit, workspace isolation, invoice-only/read-only denial, revoked/expired/null tokens, concurrent saves, token lock races, and service-role-only execution. The old draft authorization fixture no longer drops/recreates the retired fixed-scopes constraint.

Database gate unavailable: the assigned worktree has no `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY`; `pnpm test:db` stops at configuration validation. `docker ps` confirms shared Payr instances, so no reset, migration or test writes were attempted. The identity suite truncates fixtures and must run only against an explicitly disposable, approved instance with all migrations applied. Do not run it against the user's retained demo database.

### Final Results (2026-09-09)

| Gate | Result |
| --- | --- |
| Focused MCP/route/repository/connector/Connections | Review follow-up: 8 files, 310 tests passed, including missing-baseline mint rejection and a minted sender-read credential exercising real cryptographic transport authentication, initialize, tools/list, sender read and sender-write denial |
| Non-PDF unit project, one worker | 95 files, 1,950 tests passed |
| Lint | Passed |
| Next type generation and TypeScript | Passed |
| Whitespace/diff check | Passed |
| Full unit suite, including native PDF project | Review follow-up passed with `pnpm test:unit --maxWorkers=1 --no-file-parallelism`: 99 files passed, 2,005 tests passed, 13 skipped (2,018 total), 172.81s. This clears the earlier PDF stress timeout blocker without changing tests, timeouts, packages or unrelated processes |
| Database | Blocked at configuration validation; migration and database tests unexecuted, shared instances untouched |
| Browser | Existing desktop/mobile Connections assertions updated for six-tool availability and unchecked opt-in; not run because their fixture setup needs the approved local database. UI behavior is covered by component tests, not claimed as browser visual proof |
| UI detector | Ran on Connections and global CSS; only warning was the pre-existing, explicitly preserved Helvetica font |
| Review | In-thread standards/spec/security review against the recorded base and user requirements; no fanout. Corrected the stale discovery assertion, allowed omitted arguments for the empty read schema, kept sender conflict guidance separate from invoice/client conflicts, and guarded multidimensional SQL scope arrays |

### Scope Review Follow-Up Commands

All commands ran only in the assigned worktree:

```bash
pnpm test:unit src/lib/connectors/service.test.ts --maxWorkers=1
pnpm test:unit src/lib/mcp src/app/api/mcp src/app/api/profile/route.test.ts src/lib/db/identity.test.ts src/lib/connectors src/components/console.test.tsx --maxWorkers=1
pnpm lint
pnpm typecheck
pnpm test:unit --maxWorkers=1 --no-file-parallelism
git diff --check
```

The first command was the pre-fix regression: 4 expected failures (sender-read only, sender-write only, both sender scopes, invoice-draft only), 20 passed. After the schema/SQL fix, all remaining commands passed. SQL regressions now reject missing-baseline lists at both mint and constraint boundaries; valid sender fixtures retain invoice defaults, including the sender-read-only authorization case. SQL tests remain unexecuted under the database blocker above; no database operation was attempted in this follow-up.

Deployed Claude smoke and browser-wallet/live operations remain outside this task's authorization. No commit or push was made. Apply the migration and rerun database/browser gates only in an approved isolated verification environment before release.

## Release Review Follow-Up (2026-09-09)

The subsequent user request authorizes committing, pushing, and a release PR from this worktree only. The earlier no-commit/no-push exclusions describe implementation, not this release attempt. Live writes, environment copying, and changes to the root worktree remain prohibited.

- Reviewed all implementation changes and the new service, migration, and operations document. Latest fetched main is `923ef3f` (`v1.4.1`); its landing-copy changes do not overlap this implementation. Select a minor bump, provisionally `v1.5.0`, for additive opt-in capabilities.
- Corrected the draft authorization fixture to retain mandatory `invoice:status` when adding `invoice:draft`. The identity suite already tests rejection of missing-baseline scope arrays.
- Corrected the migration to extend `audit_events_bounded_codes` with the two sender actions while retaining every existing action/outcome. Without this, real sender admission and successful profile operations would roll back. Added explicit admission/audit coverage for both sender actions; existing profile tests cover successful read/save audits.
- `pnpm verify` passed before the audit follow-up: lint, types, 99 unit files / 2,005 passed / 13 skipped, 10 release-tool tests, production build, function traces, and 35 packaged-document tests. Database regressions are not unit tests and remain unexecuted.
- Docker is available, but the running `payr` project is shared. `scripts/run-local-tests.mjs`, database fixtures, and browser fixtures hardcode API 57321, database 58322, and `docker exec supabase_db_payr`. A different Supabase project ID and port cannot isolate these prescribed gates without changing the harness or providing a separate Docker daemon/network environment. No shared stack was started, reset, migrated, stopped, or written to.
- Required DB reset/lint/integration and desktop/mobile browser gates remain blocked. Independent reviewer dispatch is also unavailable in this agent's toolset; in-thread review is not claimed as the prescribed fresh parallel reviewer gate. Keep the PR draft and do not create the final version commit or merge until these gates pass.
- Resume with an isolated verification environment, run DB and browser fixtures sequentially with a unique `PAYR_TEST_PORT`, refresh main, rerun the complete gates, then use `release:prepare -- minor` and `release:verify`. Record the actual selected version and evidence before marking ready. Apply this additive migration before application deployment only through a separately approved operation. After release, use forward-fix patch PRs rather than moving tags or reverting shared data.
