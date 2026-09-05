# F2 Identity And Console Freeze

Base: `v0.1.3` / `8fb6df58a5e07d4650da60a51a4158de63b4cda5`.

This is the R03 integration contract. `PROJECT.md`, `DESIGN.md`, and Task 3 remain authoritative. Shared types and strict input schemas live in `src/lib/identity/contracts.ts`. All lanes start from the committed freeze, preserve F1, and report interface changes to the coordinator.

## Auth And Sessions

- Sign the exact UTF-8 login and payout message layouts in the framing design. Wallets are stored lowercase and displayed in messages with viem checksum casing. Date lines use `Date.toISOString()`; messages have no trailing newline.
- Login nonce input: `{purpose: "payr-login-v1", wallet}`. Payout nonce input: `{purpose: "payr-payout-change-v1", newPayoutWallet, expectedRevision}` with identity taken only from the current encrypted session.
- Nonce response: `{nonceId, message, expiresAt}`. Verification accepts only `{nonceId, signature}`; server reloads and reconstructs every signed fact. Signature verification supports externally owned wallets via viem; smart-account signatures are outside this MVP tranche.
- Nonces contain 32 random bytes encoded as unpadded base64url and expire after 300 seconds. The database atomically consumes them with workspace creation or payout mutation; exact expiry and replay fail as `NONCE_INVALID_OR_USED`.
- Unsigned nonce requests first pass atomic database-minute admission: 5/wallet, 30/IP, and 300 globally. Store purpose-separated keyed wallet/IP hashes only. Read IP only from Vercel's overwritten `x-vercel-forwarded-for` when `VERCEL=1`; other runtimes share one conservative local bucket rather than trusting caller headers. Admission prunes expired nonces and old limit windows; live nonce facts remain immutable. The grant remains service-role-only and direct nonce deletion remains forbidden.
- First successful owner login creates/loads one workspace and a skeletal sender profile. Its initial payout wallet is the authenticated owner wallet; no separate wallet is inferred. Later payout changes require the fresh owner-signed old/new-wallet message and the expected profile revision.
- Sessions are encrypted/authenticated JWE (`dir`, `A256GCM`) using jose and an exactly 32-byte decoded key. They bind issuer/origin, chain ID, workspace, owner, a random session ID, issue time, and expiry (8 hours). New login creates a new session token. Logout clears this browser cookie; global session revocation is not claimed.
- Cookie name is always `__Host-payr-session`, Secure, HttpOnly, SameSite=Lax, Path `/`, no Domain, including development. No test or development auth bypass is added.
- Cookie mutations and nonce/verify require exact configured Origin and Host. Do not trust forwarded-host headers. The deployment must preserve the configured Host; otherwise deny. Development origins may be explicit-port localhost or loopback HTTP, with no URL credentials/path/query/fragment.
- All private API responses use `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. Errors expose stable codes, never request bodies, signatures, tokens, provider errors, or credentials.

## Route Contract

| Route | Method/input | Result |
| --- | --- | --- |
| `/api/auth/nonce` | POST strict nonce input | Nonce response above |
| `/api/auth/verify` | POST `{nonceId, signature}` | `{session}` and a new cookie on login, `{session, profile}` after payout change |
| `/api/auth/logout` | POST, exact origin/host | `{ok: true}` and expired cookie |
| `/api/auth/session` | GET | `{session}` or authenticated failure |
| `/api/profile` | GET; POST `saveSenderSchema` | `{profile}` |
| `/api/clients` | GET; POST `saveClientSchema` | `{clients}` / `{client}` |
| `/api/connectors` | GET; POST `{expiresInDays: integer 1..30}` | `{connectors}` / `{connector, token, endpointUrl}` |
| `/api/connectors/[id]/revoke` | POST, UUID route parameter | `{connector}` |
| `/api/activity` | GET | `{events}` (at most 100, newest first) |

All ordinary mutation objects are strict, including nested addresses. Normal profile writes cannot contain payout or owner fields. Create-client requests use `id: null, expectedRevision: null`; updates require both values. Dashboard client provenance is persisted server-side as confirmed `user_provided` for each provided billing field, never accepted from request JSON. Default payment terms are integer days, 0..365, stored as canonical decimal text in `default_terms`.

## Connectors

- Fixed scopes remain exactly `invoice:draft`, `invoice:publish`, `invoice:status`, `invoice:void`. These authorize only future invoice tools, never payout/profile/connector changes.
- Wire credential: canonical lowercase UUID + `.` + 32 random bytes in canonical unpadded base64url. The database stores only UUID and `HMAC-SHA256(pepper, "payr:connector:v1:" + token)` as lowercase hex. List/status never return the raw credential or endpoint URL.
- IPs are validated and canonicalized, including equivalent IPv6/IPv4-mapped representations. Store only `HMAC-SHA256(pepper, "payr:connector-ip:v1:" + normalizedIp)`.
- `authenticateConnector` verifies the stored hash in constant time before admission. The admission RPC rechecks hash, revocation, expiry, and scope under locks so a race cannot use revoked credentials.
- Fixed database-time minute windows: 60 requests/token and 120/IP, with global IP buckets independent of token/workspace. Bounds are not caller parameters. A denied limit returns stable `RATE_LIMITED` and retry-after seconds; rejected counters cannot grow without bound. Token/IP lock ordering is consistent.
- Audit rows contain only workspace/token IDs, bounded action/outcome codes, and timestamps. Profile/auth/connector mutations write audit rows in their owning transaction. No caller-supplied audit payload RPC is exposed.
- The console shows credentials once in component memory, with copy/acknowledge and revoke. Warn explicitly about platform/CDN logs, browser/clipboard history, and Claude configuration retention. The MCP endpoint is not functional until Task 9 and the UI must say so.

## Database Interface

The new migration is `202609040002_auth_connector_functions.sql`. It may add nonce payout snapshot/revision fields, client provenance, and a separately keyed global IP-limit table. Do not rewrite the released core migration. Every new private table has RLS/default-deny grants. All RPCs are `SECURITY DEFINER`, fully qualified, empty search path, explicitly service-role-only execution; existing F1 privileges stay intact.

RPCs return JSONB using the camelCase DTOs in the shared contract; missing records return JSON null. SQL bigint/time fields must not lose precision. All workspace methods take both workspace ID and owner wallet, validate their relationship, and fail indistinguishably on cross-tenant targets.

| RPC | Exact named parameters |
| --- | --- |
| `payr_admit_nonce_issuance_v1` | `p_wallet_hash text, p_ip_hash text`; returns `{allowed: boolean, retryAfterSeconds: integer 0..60}` |
| `payr_issue_auth_nonce_v1` | `p_nonce jsonb` (AuthNonce shape); validates purpose/scope/old-new payout/revision and bounded expiry |
| `payr_find_auth_nonce_v1` | `p_nonce_id uuid` |
| `payr_complete_login_v1` | `p_nonce_id uuid, p_verified_wallet text` |
| `payr_apply_payout_change_v1` | `p_nonce_id uuid, p_workspace_id uuid, p_owner_wallet text` |
| `payr_get_sender_profile_v1` | `p_workspace_id uuid, p_owner_wallet text` |
| `payr_save_sender_profile_v1` | same scope plus `p_input jsonb` (SaveSenderInput) |
| `payr_list_clients_v1` | scope |
| `payr_save_client_v1` | scope plus `p_input jsonb` (SaveClientInput) |
| `payr_list_connectors_v1` | scope |
| `payr_create_connector_v1` | scope plus `p_id uuid, p_token_hash text, p_expires_at timestamptz` |
| `payr_revoke_connector_v1` | scope plus `p_id uuid` |
| `payr_find_connector_v1` | `p_id uuid` (returns stored hash for server verification only) |
| `payr_admit_connector_v1` | `p_id uuid, p_token_hash text, p_ip_hash text, p_action text` |
| `payr_list_activity_v1` | scope |

Issuing a payout nonce snapshots exact old/new payout and profile revision; completing it locks/rechecks those facts and consumes only once. Login consumption and workspace/profile creation share one transaction. Profile/client saves use compare-and-swap revisions. Authenticated runtime writes never use postgres or direct service-role table writes.

## Console

Mode: Operate, extending the already approved `Commit Ledger` world. Keep `Payr` capitalization, navy rail, cool ruled canvas, explicit states, and shallow routes. Use the documented Helvetica/Arial and system-monospace fallback stacks because no pinned redistribution-cleared font files are present. Preserve all brand reference files unchanged.

- `/login`: real injected-wallet login, signature rejection/retry and missing-wallet/configuration states; no simulated login or fake identity.
- `/app`: server-guarded workspace shell with truthful setup/empty state and `Open Claude` action to `https://claude.ai/new`. No invented invoices or verified settlement proof.
- `/app/settings`, `/app/clients`, `/app/connections`, `/app/activity`: functional API-backed forms and lists using the frozen routes.
- `/app/invoices`: truthful empty/future-publication state, no authoring form or fake payment data. Bills is omitted entirely.
- Desktop rail, collapsed tablet navigation, mobile Overview/Invoices/Clients/Activity bottom nav with Connections/Settings in account menu. Visible keyboard focus, semantic labels/status, 44px targets, and reduced motion.
- Every API remains independently session-authorized; a layout redirect is not an authorization boundary. Client components never import admin credentials or repository implementations.

## Verification And Ownership

Frozen public seams: auth message/session/origin, AuthService, connector credential/authentication service, IdentityRepository RPC adapter, HTTP route contracts, and dashboard interactions. The initial red tests anchor these seams; owning lanes extend them in vertical red-green cycles.

Four lanes: database steward (migration/adapter/DB tests), auth (auth modules/routes/runtime), profiles/connectors (services and profile/client/connector/activity APIs), console (dashboard/login/components/CSS/browser tests). The coordinator alone edits dependencies, environment schemas, shared contracts, Playwright/CI, freezes/status/version files, integrates, and releases. Only the database steward runs local Supabase during fanout.
