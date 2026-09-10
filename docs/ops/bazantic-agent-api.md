# Bazantic Agent API

## Scope and Status

**10 September reconciliation:** the recorded imported public gateway catalog
has eleven Payr operations without context/void; local upstream now has twelve,
including `get_account_context`. Reimport and explicit account `wallet:read` plus
service-operation permission are required before gateway wallet discovery claims.
Private per-user injection into generated MCP and signed-in Claude/Cowork use
remain unverified. The archived optional plugin does not solve that boundary;
see `mcp-onboarding.md`. The user confirmed Bazantic does not forward
`Authorization`. Prefer a private credential path if available; the narrowly
consented model-visible hackathon exception is documented under Secret Handling.
It changes guidance only, not authentication plumbing or action approvals.

The 9 September production and HTTP gateway records at the end are preserved
from the newer root donor. They supersede the initial implementation's no-live-
operation status below, not the current both-approval Publish & Send contract.
That older test published without sending mail; it is not candidate email proof.
Fresh CI/review and operator-approved activation remain required for planned
`v2.0.0`; consolidation itself makes no live writes.

This is the initially free gateway catalog. It is separate
from the existing publication-only integration documented in
[`bazantic-publication.md`](bazantic-publication.md). That runbook is not replaced
by this implementation. Do not import the old publication-only spec for this flow.

Historical initial implementation checkpoint, before the dated deployment below:
this implementation adds the HTTP API, two-credential authentication, wallet-proof
registration, an additive database migration, the catalog, and operator tooling.
**No live operation was executed.** No production service/account key was provisioned,
live wallet challenge signed, hosted migration applied, invoice written or published,
gateway configured, payment made, or deployment performed. Automated signature and
database tests use fictional keys and disposable fixtures, not customer accounts.
Caller header forwarding through Bazantic and the authenticated Bazantic
end-to-end journey remain externally unverified. There is no claim of a verified
paid x402 flow, successful gateway activation, or completed prize qualification.

## Gateway Import

| Setting | Value |
| --- | --- |
| API Base URL | `https://payrlink.xyz` on the intended production configuration |
| Spec URL | `https://payrlink.xyz/openapi/agent.json` |
| Upstream operations | Twelve local `POST /api/v1/{operation}` routes; recorded public import still eleven |
| Pricing | All operations initially free; do not configure a paid requirement for initial acceptance |
| Private shared upstream header | `X-Payr-Service-Key`, containing the Bazantic service key |
| Per-account authentication | Private body injection if available; otherwise the explicitly consented demo body path below. Bazantic does not forward Authorization |

`GET /openapi/agent.json` is public, requires no credentials, and allows public
cross-origin retrieval. Its sole server URL comes from `discoveryOrigin()` and
the validated `NEXT_PUBLIC_APP_URL`, never the caller's Host or forwarded headers.
Public access to the spec does not make any upstream API operation public. The
local spec contains only the twelve POST operations, not its own GET route, health,
browser routes, document routes, or the legacy MCP endpoint.

Every generated operationId is identical to the snake_case operation name:

| Operation | Required account scope | Behavior |
| --- | --- | --- |
| `create_account_challenge` | None; account key forbidden | Issue a wallet/service-bound registration challenge |
| `register_account` | None; account key forbidden | Consume an approved local EOA signature and return an account key once |
| `get_account` | `invoice:status` | Read current workspace and credential metadata |
| `get_account_context` | `wallet:read`, plus allowed service operation | Local upstream only until gateway reimport; distinguish linked receiving wallet from payout |
| `revoke_current_credential` | `invoice:status` | Revoke only the authenticating account key with `approval:true` |
| `get_sender_profile` | `sender:read` | Read sender profile, missing fields and current revision |
| `save_sender_profile` | `sender:write` | Save explicitly approved fields using profile/revision CAS |
| `create_invoice_draft` | `invoice:draft` | Create or revise a draft with an idempotency key |
| `list_invoices` | `invoice:status` | Read a bounded page of summaries |
| `get_invoice` | `invoice:status` | Read invoice details and version history |
| `publish_invoice` | `invoice:publish` | Publish the exact approved draft version idempotently |
| `get_invoice_status` | `invoice:status` | Read canonical lifecycle, settlement, receipt and delivery status |

There is no void tool or `invoice:void` account scope. Do not add client CRUD,
account administration, worker/internal actions, payment authorization/execution,
or payout changes to generated resources. Confirmed client proposals are part of
draft review, not separate client-management tools. The payout wallet is immutable
through the agent API; a change requires the existing owner-signed dashboard flow.

## Authentication

Every upstream POST requires the **private Bazantic service key**, whose prefix
is `pgw_`, in `X-Payr-Service-Key`. Inject it server-side from trusted secret
storage. It is never an operation input, user-supplied tool argument or substitute
for an account credential. Account credentials use the `pac_` prefix and have the
form `pac_UUID.secret`; the two credential types are not interchangeable.

Account operations additionally require **exactly one** of:

- `Authorization: Bearer <pac_UUID.secret>`, privately injected on the upstream request. This is upstream support, not Bazantic forwarding; the user confirmed Bazantic does not forward Authorization.
- Top-level JSON `accountCredential`, containing the raw `pac_UUID.secret` string without `Bearer `, privately injected or supplied through the consented demo exception below.

Supplying both is rejected, even if their values agree. Neither method may be
replaced by cookies, a workspace ID, a wallet address, gateway payment, or the
service key alone. Registration operations forbid both `Authorization` and
`accountCredential`; the service key is still required.

All requests require `Content-Type: application/json` and an envelope with an
object-valued `input`, including operations with no input fields. For example,
`get_account` using privately injected headers has this complete body:

```json
{ "input": {} }
```

With trusted body injection, an account-operation envelope is
`{accountCredential: <secret from private storage>, input: {...}}`. This is a
structural notation, not JSON to paste into a prompt. Registration bodies contain
only `{input:{...}}`. Do not flatten operation fields into the envelope or send
service keys in JSON. Even `get_invoice` and `get_invoice_status` use POST, not
GET, and put `invoiceId` inside `input`, not a URL or query string.

OpenAPI models header authentication as service key **AND** bearer, with an
alternative requiring the service key for body-authenticated calls. The latter
is valid **only when the body includes `accountCredential`**. OpenAPI has no body
security scheme and cannot express header/body mutual exclusion across a request.
Descriptions and `x-account-credential` document this conditional requirement;
the runtime must enforce it. Do not interpret the second alternative as permission
to call account operations with just the service key, or generate an anonymous
security alternative. The extension is documentation, not proof that a gateway
understands it.

### Secret Handling

Never place service keys, wallet private keys, seed phrases or browser cookies in
prompts or tool arguments. Keep all secrets out of URLs, recordings, screenshots,
shared recipes, the public spec and source control. Store one-time registration
results privately by default and redact authentication fields, request bodies and
secret-bearing responses before recording. Account credentials in model-visible
arguments are allowed only under the following explicit hackathon exception.

The body property is marked `writeOnly`, `format:password` and `x-sensitive` for
tooling, but these annotations **do not hide generated arguments**. Prefer a
private credential path if available, such as a trusted wrapper injecting after
model argument generation. Only with informed per-user consent may the model use
a short-lived, least-privilege raw account credential for a dedicated demo
workspace in generated gateway `requestBody.accountCredential` beside `input`.
Upstream this becomes top-level `accountCredential` beside `input`, never inside
`input`, without a `Bearer ` prefix. For read-only `get_account` verification:

```json
{"requestBody":{"accountCredential":"<raw demo account credential>","input":{}}}
```

The example is a placeholder, not a real secret or client configuration. Before
consent, explain that model/tool history and gateway traces may retain the secret;
this is not a private vault. Restrict gateway callers, avoid recordings, and
revoke the credential after the demo. Redaction and revocation do not erase
retained copies. Never substitute service keys, wallet private keys, seed phrases
or browser cookies. Without a private path or this explicit consent, stop at
"Workspace access pending". Verify with read-only `get_account` and ask the owner
to confirm the returned workspace before any separately approved writes.

The user confirmed Bazantic does not forward `Authorization`. Codex bearer/OAuth
configuration is not this body-credential path, and client configuration does not
automatically inject body credentials. Do not invent forwarding or configuration
support. Test with distinct isolated accounts that the intended caller's
credential, not a shared credential or Bazantic's own authentication token, reaches
Payr. Keep registration calls free of account credentials. Private injection and
live authenticated MCP-client execution remain unverified; historical HTTP gateway
evidence does not prove either. Charging a caller, if added later, would still not
grant workspace authority.

## Registration and Recipe

1. Use a caller-restricted gateway and an isolated workspace for acceptance. Obtain the wallet owner's approval for registration, requested scopes and lifetime. Account scopes must be unique, include `invoice:status`, and come only from `invoice:draft`, `invoice:publish`, `invoice:status`, `sender:read`, `sender:write`, `wallet:read`. Request only what the recipe needs. `expiresInDays` is an integer from 1 to 7, default 1; omitted scopes default to the five non-wallet scopes, so prefer an explicit minimum set. Existing service/account credentials do not gain context authority automatically.
2. Call `create_account_challenge` with the EOA wallet, scopes and lifetime inside `input`, using only the service header. Show the owner the exact returned challenge. Verify its purpose, wallet, service/domain/URI, chain and expiry before local signing. It is purpose-, scope- and lifetime-bound and single-use, not a browser login or spending authorization.
3. Have the owner sign locally in their EOA wallet, then submit `challengeId` and `signature` to `register_account`, again with only the service header. An existing wallet reuses its existing workspace and receives a new key once. Store that result privately; do not replay a consumed challenge to recover a lost key or assume a second workspace was created. Catalog examples use fictional IDs and a schema-valid dummy signature, not a cryptographically valid registration.
4. Read `get_account` and `get_sender_profile`. The account response contains `workspaceId`, `ownerWallet`, `credential` metadata and `senderSetupRequired`. The sender response is `{profile, missingFields, guidance}`, not a flat profile. Confirm all missing business/contact/address facts, invoice prefix and default terms with the user. Sender saves require explicit approval of the complete proposed values plus the returned `expectedProfileId` and `expectedRevision`.
5. Create a draft from confirmed facts. Use exact decimal USDC strings, not floating-point numbers. Client proposals require `confirmed:true` and `user_provided` or URL-bearing `web_source` provenance; Payr does not research facts for the agent. `MISSING_FIELDS` with `draftCreated:false` means no draft write. Resolve missing facts, never fabricate them or override sender/payout fields in the draft. A revision uses `draftId` and `expectedVersion` together.
6. Review the complete preview, defaults, client-profile diff and snapshot client/sender email addresses. Obtain explicit Publish & Send approval of that exact draft ID/version, then call `publish_invoice` with `approval:true`, `deliveryApproval:true` and a stable idempotency key. Payr queues one distinct-address message each with the frozen PDF and private invoice/PDF links; inspect `invoiceEmail` per-recipient states. Do not send a duplicate through Gmail. `sent` is provider acceptance, not inbox delivery; no funds move. Refresh clients and reimport the changed body schema before activation. Older no-send requests and historical publications are not upgraded or backfilled. Invoice email defaults disabled independently of receipt email; fresh publication rejects while disabled.
7. Use `list_invoices` for summaries, `get_invoice` for facts/history, and `get_invoice_status` for canonical status. A transaction hash or wallet callback alone does not establish payment. Keep persisted settlement, commercial state, receipt readiness and email provider acceptance separate; provider acceptance is not inbox delivery.
8. When the user explicitly approves revocation, call `revoke_current_credential` with `{input:{approval:true}}`. It targets only the key authenticating that call, never an arbitrary key ID. Subsequent authentication with that key fails; an uncertain revocation cannot be assumed to replay successfully.

### Retries and Bounds

- Draft creation and publication are idempotent with the same key and unchanged input. Keep keys and input stable after timeouts. After missing sender setup is completed, retry the original draft input with its original key. A changed request must not reuse a recorded key; an intentional revision needs its current version and a new key.
- For `PUBLICATION_IN_PROGRESS` or `PUBLICATION_RETRYABLE`, back off and retry the unchanged publication request. Honor `Retry-After` on 429. Do not generate a new key to bypass failures. Version/profile conflicts require review and fresh approval; durable publication failures may require owner intervention. A successful replay can return an invoice that is no longer payable.
- Sender saves are **non-idempotent revision CAS**, not idempotency-key writes. After an uncertain result, timeout or conflict, read the profile again, compare the saved facts, and obtain fresh approval before saving with the current ID/revision. Never retry blindly.
- Invoice listing returns at most 50 `items` and `hasMore`. `offset` defaults to 0 and is bounded at 10000. There is no input `limit`. Advance by 50 only within that bound; narrow search when the bound is reached. Search is at most 200 characters without control characters; optional `state` is a commercial-state filter.
- Zod input conversion preserves types, required fields, strict object boundaries and representable limits. The catalog also preserves scope uniqueness/mandatory status and paired draft revision fields. Runtime refinements remain authoritative for real dates, date ordering, country codes, provenance URLs and decimal/atomic amount bounds. A schema-valid example is not proof that the workspace has the required saved facts or that the request is authorized.

### Response Contracts

The `get_account` schema follows the new `AgentAccount` contract, including
credential metadata rather than a raw token. Other success/error schemas remain
open objects with service-output descriptions, deliberately avoiding invented
nested response types or an assumed universal wrapper. In particular:

- Challenge issuance returns `challengeId`, `message`, `expiresAt`, `scopes`, and `expiresInDays`. Sign the exact returned message locally.
- Registration returns `{account, accountCredential}`. `account` is metadata; `accountCredential` is the one-time secret.
- Errors use `{error:{code,...}}`. Missing draft facts are under `error.missingFields`, with `error.draftCreated:false`; safe version-conflict details and rate-limit retry headers are retained.
- Draft success returns `code:DRAFT_READY`, `draftCreated:true`, `draftId`, `version`, `preview`, `previewText`, `canonicalInvoiceJson` and `approvalInstruction`.
- List success returns `items` and `hasMore`, not a fabricated total or cursor.
- Detail success returns `invoice`, `version` (a `DraftVersion` object or null, not a number), and `history`.
- Publication retains the six-field `gmailLinkPackage` with array-valued `to`, plus invoice/PDF links. New Publish & Send returns `sendApprovalRequired:false` and redacted `invoiceEmail` per-recipient progress; `true` describes an authorized finalized legacy no-send replay only, not a new send instruction.
- Canonical status uses `payr.invoice-status.v1`; `invoiceEmail`, `receipt` and `receiptEmail` are separate structured objects and settlement/document data can be null. It is distinct from the detail response; provider acceptance is not inbox delivery.

Canonical sources inspected for this catalog are `src/lib/agent-api/contracts.ts`,
`src/lib/identity/contracts.ts`, `src/lib/profiles/connector.ts`,
`src/lib/invoices/contracts.ts`, `src/lib/invoices/service.ts`,
`src/lib/invoices/publication.ts`, `src/lib/invoices/lifecycle.ts`, and
`src/lib/domain/status.ts`. The registration implementation is in
`src/lib/agent-api/service.ts`.

## Provisioning and Cutover

This section is an operator checklist, not permission to repeat recorded writes.
Migration **`202609090002_agent_gateway.sql`** is a prerequisite already recorded
as hosted-applied below; inspect target history before applying only missing
forward migrations under new approval. Preserve historical SQL, existing sessions
and document bindings. The Privy and invoice-email additions have their own gates.

The operator CLI is **`scripts/gateway-key.ts`**. Inject the intended target's
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the secret store. These are the
only required CLI environment variables for creation and revocation; neither needs
the application origin, chain ID, session encryption key, or connector pepper.
Do not export or rotate production identity secrets for this CLI. The script
deliberately does not load environment files automatically, and requires explicit
confirmation. The application runtime still needs its existing identity configuration.

```sh
pnpm exec tsx scripts/gateway-key.ts create bazantic --confirm
pnpm exec tsx scripts/gateway-key.ts revoke bazantic <key-id> --confirm
```

Creation emits a `pgw_` service credential once. Use a private, unrecorded terminal;
store the credential directly in Bazantic's private upstream configuration and
retain only the key ID/service ID as ordinary operator metadata. The database
stores only `SHA256("payr:agent-gateway:service:v1:" + fullToken)` for service keys.
The full `pgw_UUID.secret` token includes a cryptographically random 32-byte secret;
its domain-separated hash is independent of the account pepper. Account credential
hashing remains unchanged (connector HMAC), and IP/wallet hashes remain peppered HMACs.
Never paste the secret into a recipe or chat.
Revocation requires the key ID and service ID, not the lost secret or old pepper.
An ambiguous creation response requires administrative inspection of
`gateway_service_keys` metadata before retrying, so no unknown active key is left
behind. Rotate by creating another key under the same `bazantic` service ID,
switching Bazantic to it, verifying admission, and revoking the old key. Existing
account credentials remain bound to the stable service ID across this rotation.
No production CLI provisioning command was executed at the initial checkpoint;
the later production administrative-wrapper provisioning is recorded below.

| Environment | Cutover rule |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS application origin used by discovery; verify the imported spec advertises the intended host |
| `PAYR_AGENT_GATEWAY_ONLY` | New server-side flag; defaults to `false`. Keep it false until authenticated Bazantic E2E and regression acceptance pass |

The flag controls the legacy direct-credential transport cutover, **not** whether
new account keys are gateway-only. Every newly registered `pac_` account key is
gateway-only regardless of the flag: it must use the gateway API with a valid
service key and cannot be used as a direct legacy MCP/publication credential.
Do not mint or use new account keys to bypass that restriction.

With the flag false, preserve the shipped behavior of existing eligible direct
MCP credentials and the existing bearer publication route while E2E is pending.
When the flag becomes true, existing direct MCP and bearer-authenticated
publication requests will reject. This deliberately breaks those direct agent
entry points; notify their users and migrate their clients before enabling it.
Browser session-authenticated dashboard operations and protected invoice/receipt
document links must retain their existing behavior; they are not migrated to
service-key authentication.

This disables direct machine-credential entry points, not automation of a human
dashboard session by its wallet owner. It is not an anti-bot or browser paywall.
The canonical `NEXT_PUBLIC_APP_URL` remains `https://payrlink.xyz`; do not change
it to the Bazantic hostname, since it also owns wallet challenges and document
links. The API origin check expects Bazantic to call that upstream origin and
omit `Origin` (or send the canonical Payr origin).

1. Review target migration history and the key CLI; apply only missing forward migrations under a separately approved operations change, and keep `PAYR_AGENT_GATEWAY_ONLY=false` until its separate acceptance gate.
2. Inspect the already provisioned service key's scope before any approved rotation or new provisioning. Import the reviewed twelve-operation upstream spec, configure private service-header injection and restricted caller access, and verify actual generated tool IDs, free pricing and per-user authentication before using a real account. The recorded eleven-operation import is not evidence that this reimport occurred.
3. Pass authenticated Bazantic E2E in isolated accounts using the actual private-injection or consented demo body path. Bazantic does not forward Authorization; record the body mechanism and its model/trace exposure. Do not enable cutover based on unit tests or a public spec fetch alone.
4. Pass the acceptance checks below, notify legacy direct-transport users, then enable `PAYR_AGENT_GATEWAY_ONLY=true` only through a separately authorized cutover. Confirm legacy direct rejection and unchanged browser/document behavior after the change.
5. If cutover fails, an operator may restore the flag to false to restore eligible legacy direct behavior while investigating. This does not make new account keys usable directly. Leave the additive migration in place; do not drop data or loosen the gateway's service/account authentication boundary as rollback.

## Acceptance Gate

- Import the canonical public GET spec and verify twelve POST tools and matching operationIds, including scoped context. Confirm no client/admin/internal/payment/void action is generated and no credential is embedded in the spec, recipe or recording. The dated public eleven-operation check does not satisfy this candidate gate.
- Verify every operation, including both registration steps, rejects absent/invalid/revoked service keys. Account calls must also reject missing/invalid/expired/revoked account credentials and insufficient scopes. Confirm both account credential locations work individually and supplying both fails. Registration must reject either account credential location.
- Verify caller-to-upstream account isolation with two wallets/workspaces, including cross-workspace invoice IDs and attempts to target another credential for revocation. Confirm the service key alone cannot read or write either workspace.
- Verify local EOA registration, expired/consumed challenge rejection, wrong wallet/service/purpose rejection and exact scope/lifetime binding. An existing wallet must reuse its workspace, issue the new key once and keep it gateway-only with the flag both false and true.
- Verify sender save approval and revision/profile conflicts, including read-after-timeout handling. Verify missing draft facts cause no write, draft/publish unchanged retries preserve identity, changed-input key reuse fails, stale draft versions fail, and publication never infers user approval.
- Verify listing bounds (50 rows, offset at most 10000), details versus status shapes, private document links, canonical settlement interpretation, and approved current-key-only revocation.
- Before and after cutover, verify browser login/session operations and protected invoice/receipt documents retain their behavior. With the flag false, existing eligible direct credentials retain shipped access; with it true, direct MCP and bearer publication reject. New account keys must reject on those direct transports in both modes.
- Capture non-secret Bazantic gateway/recipe references and redacted evidence only after real execution. Do not claim header forwarding, paid x402 verification or authenticated E2E based on this catalog implementation.

Local verification:

```sh
pnpm test:unit src/lib/agent-api src/lib/db/agent-gateway.test.ts --maxWorkers=2
pnpm typecheck
pnpm lint
```

Database fixtures are destructive. Use a verified isolated project with the
environment and sequential commands in
[`agent-combined-release.md`](agent-combined-release.md). The fixtures use main's
validated `fixtureDatabaseContainer()` handoff. The default project is allowed
only on a fresh disposable CI/private runner with this additional opt-in:

```sh
PAYR_TEST_DISPOSABLE_DB=agent-gateway pnpm test:db:local
```

Never set that opt-in for the retained root stack. The GitHub database job sets
it explicitly on its fresh hosted runner. Do not relax fixture guards to make a
local retained stack pass.

The complete 12-migration chain and SQL lint passed in a new disposable private
daemon. All 488 database integration tests passed, including 15 gateway tests.
This covers nonce replay/expiry, service/account isolation, lost-key revocation,
scope enforcement, durable denied/rate-limit audit events, and existing database
behavior with the new tables. The runner and its data volume were removed; the
retained root database was untouched. This is not live Bazantic acceptance.

Final application verification on 9 September 2026 passed lint, typecheck, the
production build, native dependency tracing, all 35 compiled-document checks,
and 10 release-tool tests. The complete unit run passed 2,352 tests across 110
files, with 13 existing isolated-PDF skips covered by the compiled-document gate.
Independent security/spec and standards/compatibility review findings were fixed
and re-reviewed with no unresolved findings. Browser E2E and external Bazantic
acceptance were not run. Production migration, service-key provisioning,
deployment, and the gateway-only cutover remain separate operator steps.

## Historical Production Deployment: 9 September 2026

- Production: `https://payrlink.xyz`, deployment `dpl_33iBWZ4T9QgV6UkKFFEa7vMKX8Mn` (Ready).
- Unique URL: `https://payr-oxgi44fsn-kenks-projects.vercel.app`.
- Pre-deployment rollback target: `dpl_GnnvJ8eigvWSVGkq48t4rdmBooJA`, `https://payr-fwjsojnpg-kenks-projects.vercel.app`.
- Base commit: `fcf63658e354b74ff31a87fb01fa404a7324da0c`; this is an uncommitted gateway snapshot, not a new tagged release. Health reports the base, not a complete source digest.
- Source manifest SHA-256: `41206ae1ed3c81a8795ec6bcf2b86818771f5a1512ba354298ca4bcce38ae960`, using sorted uploaded path/NUL/SHA-1 entries joined by newlines.
- Isolated deployment worktree: `.worktrees/bazantic-agent-deploy`. Unrelated diagrams/demo/discovery edits were excluded. Generated Supabase CLI metadata is now excluded from uploads.

Hosted project `grutkfsoekcpwdksgasm` already contained migration
`202609080003_dashboard_overview.sql`, absent from the root checkout. Its original
SQL was recovered from `.worktrees/root-updates-v1.7.0`, matched against hosted
history, and included only in the deployment worktree to preserve that history.
It was not replayed, repaired away, or overwritten. Dry-run proposed only
`202609090002_agent_gateway.sql`; that migration was applied with `--skip-vault`,
without seeds/reset/role updates. Subsequent dry-run reported up to date.

Existing counts stayed at 3 workspaces, 3 invoices and 2 settlements. New account
and registration-challenge counts remain zero. Registration RPC execution was
verified denied to `anon` and allowed to `service_role`.

The initial candidate exposed an operational provisioning dependency on write-only
production identity secrets. Before any service key was issued, service-key
hashing was separated from account hashing: SHA-256 with a fixed domain prefix
over a full credential containing 32 random secret bytes. Account/IP/wallet HMACs
and all existing production secrets are unchanged. Applied migration SQL was not
modified. Focused tests/typecheck/lint and build/package checks passed again.

One long-lived key was issued for service ID `bazantic`, key ID
`60c1e081-a3a5-493a-9a29-7f8562a41e2a`. Its raw value is stored only in the
owner-readable ignored `.vercel/bazantic-service-credential.json` and is intended
for Bazantic's private `X-Payr-Service-Key` configuration. It is not an individual
account credential and has no `Bearer ` prefix. The operator wrapper obtained
only the intended production database URL/admin credential in memory; it did
not export account pepper or session encryption secrets. Clipboard history may
retain the service credential when it is transferred to the dashboard.

Live verification passed:

- Public health, new 11-operation specification, old publication spec and health-only spec returned 200.
- All eleven upstream operations rejected absent service credentials with 401 and private/no-store responses.
- With the real service credential, empty signup input returned 400 `INVALID_INPUT`, proving service admission without creating a challenge/account.
- The same service credential without an account key returned 401 `AUTH_REQUIRED` for `get_account`.
- Homepage/login and legacy MCP denial checks passed. Node 22, disabled Git-triggered deployments and all three daily cron schedules were preserved.
- `PAYR_AGENT_GATEWAY_ONLY=false` and `PAYR_RECEIPT_EMAIL_ENABLED=false` were explicitly retained on the production deployment.

Remaining: replace Bazantic's old stored user credential, import
`https://payrlink.xyz/openapi/agent.json`, retain only the eleven `/api/v1/`
resources at zero price, verify per-caller credential handling and execute the
wallet-registration/invoice recipe with approval. Keep the marketplace listing
and legacy cutover unchanged until acceptance. No claim of live paid x402,
successful agent registration/publication, or final prize qualification is made.

## Historical Live Bazantic Invoice Test: 9 September 2026

The user explicitly requested invoice creation through the Bazantic wrapper.
All eleven resource operations were exercised via `https://api.payrlink.xyz`,
using a newly generated, unfunded test wallet and fictional sender/client details.
The client supplied no service credential; Bazantic injected its configured
service credential upstream. Account-scoped calls used the POST-body
`accountCredential` fallback, not caller Authorization-header forwarding.

Verified operations:

- Wallet challenge issuance, exact domain/service/purpose/scopes/lifetime validation, local EOA signing, and registration all succeeded.
- Account inspection, sender-profile read, and explicitly approved sender setup succeeded.
- Draft creation and an identical retry returned the same draft ID/version.
- Explicit publication and identical retries returned the same invoice identity, document links, PDF hash, and commitment.
- Invoice list/detail/status calls succeeded; the isolated account contained exactly one invoice.
- The recipient PDF returned 200 with `application/pdf`, valid PDF magic, and 19,009 bytes. Its Keccak-256 hash matched `pdfContentHash`.
- Current-account-credential revocation succeeded through Bazantic. A subsequent account read was rejected with 401.

Result: invoice `BAZTEST-2026-000001`, ID
`457d67ea-a9c7-424d-b536-36dc3e5d78f5`, version 1, amount **1 USDC**, published and
unpaid. The memo explicitly says `AUTOMATED INTEGRATION TEST - DO NOT PAY`; no real
goods/services are represented and both email addresses use `example.invalid`.
No payment, email send, void, or existing-account mutation was performed. The
test workspace and published invoice remain as labeled test artifacts; the
one-day account credential was revoked immediately after verification.

The first PDF assertion used SHA-256 in the temporary test harness, whereas Payr's
document contract uses Keccak-256. Correcting that harness assertion made the
check pass; no application change was needed. Reruns reused the same recorded
idempotency keys and did not create duplicate invoices or artifacts.

Private recovery state, the test wallet key, revoked account credential, and
private document links are held in the owner-only ignored file
`.vercel/bazantic-invoice-smoke-20260909.json`. Do not copy that file into the
repository, screenshots, or submissions. Only the non-secret result above belongs
in public evidence.

This proves live invoice creation through the free HTTP gateway, not generated
MCP-client execution, cross-account isolation through Bazantic, or paid x402.
Legacy cutover remains off. Service-key rotation remains outstanding because the
user's earlier editor selection attached the key to the conversation; coordinate
replacement in Bazantic before revoking it so the working gateway is not broken.
