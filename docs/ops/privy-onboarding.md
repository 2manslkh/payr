# Privy Business Wallet Onboarding

## 10 September Reconciliation Scope

Privy onboarding and receiving-wallet discovery are selected core scope for the
planned `v2.0.0` candidate. The production record below is preserved from the newer
root donor, not a deployment or test performed during docs reconciliation. Its
health base does not identify the complete deployed source; do not promote an
older checkout over it. The guarded local-testnet payment attestor remains
distinct from the Privy receiving wallet. No agent signing/spending is introduced.

Use `mcp-onboarding.md` before public gateway setup: its recorded imported catalog
has eleven Payr operations without `get_account_context` or `void_invoice`; local
upstream has twelve including context. The context instructions below apply only
where that operation is actually exposed and both account `wallet:read` and
service-operation permission are present. Private per-user generated-MCP
credential injection is still unverified; neither public discovery nor an archived
plugin establishes it. Secrets stay out of chat.

The live checklist's fresh publication now requires both `approval:true` and
`deliveryApproval:true`, approved real client/issuer recipients and separately
authorized mail enablement under `publish-and-send.md`. Disabled invoice email
blocks fresh publication; finalized legacy replay stays read-only without send.
Payment, verified receipt and independently gated receipt delivery remain required.
Source consolidation authorizes none of these live writes or policy administration.

## Scope

PAYR sign-in uses Privy authentication. The server provisions one Ethereum receiving wallet per verified Privy user, with that user as its sole owner and no additional signers. The wallet is linked to a PAYR workspace. Agents can discover public addresses with explicit `wallet:read` permission; no agent signing, payment, export, wallet creation, or administration API exists.

New workspaces use the provisioned wallet as their initial invoice payout address. Existing workspaces retain their owner-wallet anchor, sender profile, payout address, invoices and connector credentials. Server-side wallet creation does not mean server ownership.

This release is testnet-only. The receiving policy permits purpose-bound PAYR payout-setting messages and denies all other methods by default, including transaction signing and key export. PAYR does not provide withdrawals or a production business account. A public address, an owner relationship and a valid policy ID are not sufficient evidence of a live policy denial; record the actual tests below before making prize claims.

## Configuration

- `PRIVY_APP_ID` or `NEXT_PUBLIC_PRIVY_APP_ID`: non-secret Privy application ID. The public-prefixed variable takes precedence; do not configure differing IDs. The server passes it to the login and dashboard provider only, not protected invoice/receipt pages.
- `PRIVY_APP_SECRET`: backend-only secret. Never provide it to an agent.
- `PRIVY_WALLET_POLICY_ID`: explicit receiving-wallet policy ID.
- `PRIVY_ACCEPTED_WALLET_POLICY_IDS`: comma-separated approved historical policy IDs, if rotating to a new policy. Retain old IDs until their wallets are deliberately migrated. This is an allowlist, not permission to skip ownership checks.
- Existing identity, database, chain and connector-pepper settings remain necessary. Do not rotate the connector pepper as part of this rollout.

Configure email and/or Google authentication and the application's allowed origins in the Privy Dashboard. Client automatic wallet creation is disabled deliberately: the server fixes the wallet owner, policy and unique external ID.

The browser must reach `https://auth.privy.io`. If initialization cannot finish within 15 seconds, the login page offers a reload action and explains the connection failure instead of leaving an unexplained disabled button. Check network/content-blocker restrictions before treating this as an invalid credential. Backend preflight succeeding does not prove browser authentication endpoints are reachable.

Run `pnpm exec tsx scripts/privy-preflight.ts` to verify API credentials and policy access. With no policy configured, `pnpm exec tsx scripts/privy-preflight.ts --create-policy` creates the origin-bound receiving policy and prints its non-secret ID. It never signs or moves funds and does not create users or wallets. Policy administration remains an operator responsibility: isolate its credentials, secure the Privy Dashboard and review changes.

Changing PAYR's canonical origin requires a compatible policy because allowed payout-setting messages contain that origin. Do not swap the policy ID and lock existing wallets out without a migration plan.

## Database Rollout

Apply `202609090003_privy_identity.sql` only after the existing migrations, including `202609090002_agent_gateway.sql`. The latter was existing work in progress when this integration began; verify its deployment status rather than assuming it is live.

The migration adds `privy_accounts` and `privy_link_challenges`, restricted to security-definer RPCs. It does not modify existing owner addresses, invoices, payouts, credential hashes or granted scope arrays. Back up and review the target database before applying migrations. No production or retained local database is migrated by the test scripts.

### Applied to Local and Hosted (2026-09-09)

The user authorized migration of both environments. The targeted rollout is complete:

| Target | Applied | Preserved records |
| --- | --- | --- |
| Local API `http://127.0.0.1:57321`, database container `supabase_db_payr` | `202609090002_agent_gateway`, `202609090003_privy_identity` | 67 workspaces, 153 invoices, 10 credentials, 25 settlements |
| Hosted project `grutkfsoekcpwdksgasm` | `202609090003_privy_identity` only | 4 workspaces, 4 invoices, 3 credentials, 2 settlements |

Hosted already had the gateway prerequisite and additional dashboard migrations `202609080003` and `202609090010`; these were preserved, not replayed or repaired. The definitions replaced by Privy were inspected before application. Do not use a broad migration push from a checkout missing those historical migration files.

Separate owner-only custom-format backups of `public` and `supabase_migrations`, plus migration-history and count snapshots, are retained outside Git at:

`/var/folders/_r/65qcktj96mgb6y7948nn9g9m0000gn/T/opencode/payr-privy-migration-backups-20260909/`

- `local-before.dump`: 521147 bytes; SHA-256 `da50e836c1e40565933de3a5dd9e9720bab696df1b1c198c2843c8a540784966`.
- `hosted-before.dump`: 460716 bytes; SHA-256 `76aef6db70f062b17de576309c84a4a60a3c891becf26cdbf714b1c5c0af0641`.

Archive contents were checked with PostgreSQL 17 `pg_restore --list`; a full restore rehearsal was not performed. These are scoped database backups, not Storage object or whole-project backups. Keep them private and move them to durable secure storage if needed; their current location is temporary storage.

Each target's migration body and history entries committed atomically with bounded lock/statement timeouts. The transaction locked existing public tables and compared sorted row fingerprints before/after, aborting on any difference; every existing public-table row remained unchanged. PostgREST received a schema reload notification. The new Privy tables remained empty; no account linking, wallet provisioning, credential minting, or payment occurred.

Post-migration checks passed for migration history, row-level security, service-role RPC access, blocked anonymous/authenticated access to privileged functions, blocked direct service-role mapping updates, wallet-discovery scopes, and gateway operation validation. The account-lookup RPC returned HTTP 200/null for a nonexistent probe identity in both environments using each environment's current service credential; anonymous requests were denied.

**Local configuration follow-up:** the existing `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` does not match the current local stack and returns HTTP 401. The key reported by the local Supabase CLI successfully calls the new RPC. The migration did not replace or rotate that pre-existing credential; synchronize the local backend configuration before testing local sign-in. Hosted RPC verification passed with the hosted service credential.

## Existing Users

The reconciled server bounds verification before any Privy key lookup: at most five
verification attempts per trusted IP per minute and five provisioning requests per
verified subject per minute. A successful two-stage request uses two shared global
admissions. Signing-key caches are process-local; admission remains database-backed.
After a rate-limit response, honor its retry delay rather than opening more tabs.

1. Sign in through Privy. Wallet creation is idempotent through a deterministic, app/user-scoped external ID and Privy idempotency key; a timeout is recovered by external-ID lookup.
2. Select **Link existing workspace** rather than creating a new workspace.
3. Sign the fresh challenge using the original Ethereum owner wallet. The challenge binds the Privy user, workspace, original owner, origin, chain, nonce and expiry. Linking consumes it atomically.
4. Subsequent sign-ins open the same workspace. Existing connector credentials retain their old scopes and expiration.

Only EOA signatures are accepted for legacy linking. Do not infer identity from an email, payout wallet, agent credential, or browser-provided Privy user ID. The backend derives the Privy subject from a verified access token.

Creating a new workspace requires explicit confirmation that the user is not recovering an existing business. Once linked, the workspace association cannot be replaced automatically, even if it appears empty: in-flight writes could otherwise strand data. Wrong-account recovery requires an operator to verify both identities and coordinate sessions/in-flight operations; no automated recovery or merge is supplied. This release supports one active workspace link per Privy user, not a multi-workspace selector.

Existing encrypted browser sessions survive for their original eight-hour lifetime. When Privy is configured, new legacy wallet-login requests are disabled; payout-change signatures remain supported. Privy-backed sessions recheck their active database link on each server authorization. PAYR sessions have their own bounded lifetime; this is not an implementation of Privy session-revocation webhooks.

## Agent Connections

In Connections, explicitly opt into **Wallet address discovery**. Ask the agent to call `get_account_context` immediately after connecting. The result separates `businessWallet.address` from `invoicePayoutAddress`; the latter can still be the original external wallet for migrated users. A null business wallet means no active Privy wallet link is present.

Existing credentials do not silently gain wallet discovery. Create a new appropriately scoped credential. This does not require revoking existing connections.

`wallet:read` gates the dedicated linked-wallet lookup, not secrecy of all wallet addresses: existing account metadata includes the historical owner address, sender reads include the payout address, and invoices can contain payout addresses. For new workspaces these addresses initially coincide. Those existing API responses are preserved for compatibility.

For a REST gateway, select **REST gateway connection** and the operator-registered service ID. PAYR creates a show-once `pac_` credential with a maximum seven-day lifetime after owner authentication. The agent never signs an owner-wallet registration challenge. The gateway still needs its separately managed service key, and that key must explicitly permit `get_account_context`. Existing service keys are not broadened automatically. If `PAYR_AGENT_GATEWAY_ONLY=true`, use this gateway path rather than a legacy MCP URL.

Credential issuance is intentionally show-once and non-replayable. If the response is lost, inspect the credential list and revoke the unknown credential before minting another. Do not put tokens in chat, URLs or recordings.

## Verification

### Vercel Deployment (2026-09-10)

The user authorized production deployment. Privy is live at `https://payrlink.xyz/login`.

- Deployment: `dpl_GLDNXmDkssP7DFaFJWBNcNYs9zXV`, `https://payr-4vajkiydd-kenks-projects.vercel.app`.
- Production aliases verified: `payrlink.xyz`, `payr-sandy.vercel.app`.
- Rollback deployment: `dpl_3VwyXCNunStit6v7LjmxHLzTQnXY`.
- Source: production v1.8.0 commit `cbcf7e28b9882d7ea3ee93599d2398381fe7938e` plus the uncommitted Privy implementation. This is a composed snapshot, not a new tagged release. Health reports the base commit; deployment metadata records the complete snapshot digest.
- Snapshot SHA-256: `a7b93764ac8e9232d5a43fb305b0f77a6f7dd73f2514fdd2d7318fce40f08840` (280 uploaded source files).
- Reviewed source retained under `.worktrees/privy-vercel-deploy-20260909/`. It preserves the newer production dashboard, install guide, gateway and publication paths rather than deploying the older root checkout wholesale. Login/connection copy conflicts were reconciled; Next build/tracing roots were pinned to the staging directory to prevent parent-checkout dependencies.
- Only production Privy variables were added. Hosted Supabase, session and connector credentials, deployment policy, and cron schedules were preserved. The production-origin receiving policy is `l9kzom8jzihbb2izbc3kh52g`; the local policy remains separate.
- Combined-snapshot verification: 124 test files passed, 2,453 tests passed, 13 skipped; lint and build passed; all 35 PDF verification tests passed with valid native function traces.
- Candidate checks passed before promotion. Live health, login, install guide, gateway/publication specifications, missing-session denial and invalid-Privy-token denial passed after promotion.
- The real Privy login sheet opened on desktop (1440x1000) and mobile (390x844), with visible email inputs, no horizontal overflow and no browser runtime errors.

No real user login credentials were submitted during deployment verification. Authenticated wallet provisioning, existing-workspace linking and a genuine policy-denial demonstration still require the approved user's sign-in. No funds moved and no commits or version tags were created.

### Implementation Evidence (2026-09-09)

- Full unit/component suite: 117 files passed; 2,390 tests passed and 13 skipped.
- Lint, TypeScript checking and production build passed.
- Disposable PostgreSQL migration/fixture checks passed. No retained or hosted database was migrated.
- Live Privy app credentials verified; receiving-only policy created and its ID configured in the local ignored environment. Subsequent API read-back found one rule.
- Production-build browser smoke passed at 1440x1000 and 390x844: the Privy email input and wallet-login action were visible after opening the login sheet, with no horizontal overflow.
- A transient network failure initially prevented the browser and curl from reaching Privy. A 15-second initialization recovery state now has regression coverage. Connectivity subsequently recovered and the real login sheet opened.
- No user login credentials were submitted, no user wallets were provisioned, no funds moved, and no deployment was performed. The authenticated wallet/ownership/policy-denial/payment checks below remain required.

- `pnpm exec vitest run --maxWorkers=4`: unit and component suite. Resource-heavy PDF tests can need an isolated rerun when a production build is running concurrently.
- `node scripts/test-privy-db.mjs`: creates and removes only its own network-isolated PostgreSQL container, applies every migration and checks new defaults, linking, replay, scopes, gateway binding and grants. Storage tables are schema stubs; this is not a Supabase Storage integration test.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.

Before recording the prize demo, complete these live checks with an explicitly approved test user:

1. Sign in through the actual Privy UI and verify the server-created wallet is accessible to its owner in the client SDK.
2. Repeat sign-in and use concurrent tabs; confirm one wallet address and one workspace.
3. Link an existing test workspace and confirm unchanged invoice IDs, payout settings and an existing working credential.
4. Create a scoped agent credential and retrieve the correct wallet address; prove a credential without `wallet:read` cannot call the dedicated context endpoint and a different workspace credential cannot select another workspace.
5. Sign a valid payout-setting message as the owner. Submit an out-of-policy message with otherwise valid owner authorization and capture an actual Privy policy rejection. Separately prove app credentials alone cannot sign for the user. Do not label an authentication error or insufficient-funds simulation error as a policy denial.
6. Publish a fresh invoice, pay through the existing Arc checkout and verify the settlement-derived receipt. This requires a funded payer wallet, not a funded receiving wallet.

Do not claim live wallet provisioning, policy denial or payment evidence from mocks or the configuration preflight. No migration, real user wallet provisioning or settlement is performed by preflight.
