# Bazantic Agent API

## Scope and Status

This is the new, initially free, eleven-operation gateway catalog. It is separate
from the existing publication-only integration documented in
[`bazantic-publication.md`](bazantic-publication.md). That runbook is not replaced
by this implementation. Do not import the old publication-only spec for this flow.

This implementation adds the HTTP API, two-credential authentication, wallet-proof
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
| Upstream operations | Exactly eleven `POST /api/v1/{operation}` routes |
| Pricing | All operations initially free; do not configure a paid requirement for initial acceptance |
| Private shared upstream header | `X-Payr-Service-Key`, containing the Bazantic service key |
| Per-account authentication | Private bearer header if verified, otherwise trusted body injection as described below |

`GET /openapi/agent.json` is public, requires no credentials, and allows public
cross-origin retrieval. Its sole server URL comes from `discoveryOrigin()` and
the validated `NEXT_PUBLIC_APP_URL`, never the caller's Host or forwarded headers.
Public access to the spec does not make any upstream API operation public. The
spec contains only the eleven POST operations, not its own GET route, health,
browser routes, document routes, or the legacy MCP endpoint.

Every generated operationId is identical to the snake_case operation name:

| Operation | Required account scope | Behavior |
| --- | --- | --- |
| `create_account_challenge` | None; account key forbidden | Issue a wallet/service-bound registration challenge |
| `register_account` | None; account key forbidden | Consume an approved local EOA signature and return an account key once |
| `get_account` | `invoice:status` | Read current workspace and credential metadata |
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

- `Authorization: Bearer <pac_UUID.secret>`, privately injected on the upstream request.
- Top-level JSON `accountCredential`, containing the raw `pac_UUID.secret` string without `Bearer `, injected by a trusted caller when the header path is unavailable.

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

Never place service/account keys in prompts, URLs, recordings, screenshots, logs,
shared recipes, the public spec, or source control. Never ask a user for a seed
phrase, private wallet key, browser cookie, or account key in chat. Store the
one-time registration result directly in private credential storage and redact
authentication fields, request bodies and secret-bearing registration responses
from gateway traces before recording.

The body property is marked `writeOnly`, `format:password` and `x-sensitive` for
tooling, but these annotations **do not hide generated arguments**. If the
generated tool's arguments cannot be hidden from the model, the body fallback is
model-visible. Do not describe it as a private vault or ask the model to populate
it from chat. Prefer a trusted wrapper that injects it after model argument
generation. Use short-lived, least-privilege scoped account credentials, restrict
gateway callers, and verify trace/recording redaction. If no acceptable secret
path is available, stop activation rather than exposing a real workspace key.

Caller-to-upstream header forwarding has not been verified externally. Test with
distinct isolated accounts that the intended caller's credential, not a shared
demo account credential or Bazantic's own authentication token, reaches Payr.
Keep registration calls free of forwarded account headers. The body fallback
exists for this uncertainty, not as evidence that forwarding works. Charging a
caller, if added later, would still not grant workspace authority.

## Registration and Recipe

1. Use a caller-restricted gateway and an isolated workspace for acceptance. Obtain the wallet owner's approval for registration, requested scopes and lifetime. Account scopes must be unique, include `invoice:status`, and come only from `invoice:draft`, `invoice:publish`, `invoice:status`, `sender:read`, `sender:write`. Request only what the recipe needs. `expiresInDays` is an integer from 1 to 7, default 1; omitted scopes default to all five, so prefer an explicit minimum set.
2. Call `create_account_challenge` with the EOA wallet, scopes and lifetime inside `input`, using only the service header. Show the owner the exact returned challenge. Verify its purpose, wallet, service/domain/URI, chain and expiry before local signing. It is purpose-, scope- and lifetime-bound and single-use, not a browser login or spending authorization.
3. Have the owner sign locally in their EOA wallet, then submit `challengeId` and `signature` to `register_account`, again with only the service header. An existing wallet reuses its existing workspace and receives a new key once. Store that result privately; do not replay a consumed challenge to recover a lost key or assume a second workspace was created. Catalog examples use fictional IDs and a schema-valid dummy signature, not a cryptographically valid registration.
4. Read `get_account` and `get_sender_profile`. The account response contains `workspaceId`, `ownerWallet`, `credential` metadata and `senderSetupRequired`. The sender response is `{profile, missingFields, guidance}`, not a flat profile. Confirm all missing business/contact/address facts, invoice prefix and default terms with the user. Sender saves require explicit approval of the complete proposed values plus the returned `expectedProfileId` and `expectedRevision`.
5. Create a draft from confirmed facts. Use exact decimal USDC strings, not floating-point numbers. Client proposals require `confirmed:true` and `user_provided` or URL-bearing `web_source` provenance; Payr does not research facts for the agent. `MISSING_FIELDS` with `draftCreated:false` means no draft write. Resolve missing facts, never fabricate them or override sender/payout fields in the draft. A revision uses `draftId` and `expectedVersion` together.
6. Review the complete returned preview, defaults and proposed client-profile diff with the user. Obtain separate explicit approval of the exact draft ID/version before calling `publish_invoice` with `approval:true` and a publication idempotency key. Publication returns private invoice/PDF links and a structured Gmail package; it does not send email or move funds. Obtain separate approval before any sending through another service.
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
- Publication returns `gmailLinkPackage` as an object whose `to` field is an array, plus invoice/PDF links and `sendApprovalRequired:true`.
- Canonical status uses `payr.invoice-status.v1`; `receipt` and `receiptEmail` are structured objects and settlement/document data can be null. It is distinct from the detail response.

Canonical sources inspected for this catalog are `src/lib/agent-api/contracts.ts`,
`src/lib/identity/contracts.ts`, `src/lib/profiles/connector.ts`,
`src/lib/invoices/contracts.ts`, `src/lib/invoices/service.ts`,
`src/lib/invoices/publication.ts`, `src/lib/invoices/lifecycle.ts`, and
`src/lib/domain/status.ts`. The registration implementation is in
`src/lib/agent-api/service.ts`.

## Provisioning and Cutover

This section is a future operator checklist, not an execution record. The
additive migration **`202609090002_agent_gateway.sql`** is required before the
gateway runtime is activated. Its implementation and application belong to the
operator after review. Keep existing browser/session and document behavior intact.

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
No production CLI provisioning command was executed.

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

1. Review the runtime owner's migration and key CLI, apply the additive migration under a separately approved operations change, and keep `PAYR_AGENT_GATEWAY_ONLY=false`.
2. Provision the dedicated service key using the verified CLI interface and import this spec into Bazantic. Configure private service-header injection and restricted caller access. Verify the eleven generated tool IDs, free initial pricing and authentication handling before using a real account.
3. Pass authenticated Bazantic E2E in isolated accounts using the real secret-injection path. Record whether header forwarding actually works or whether the body fallback is used, and document its model/trace exposure. Do not enable cutover based on unit tests or a public spec fetch alone.
4. Pass the acceptance checks below, notify legacy direct-transport users, then enable `PAYR_AGENT_GATEWAY_ONLY=true` only through a separately authorized cutover. Confirm legacy direct rejection and unchanged browser/document behavior after the change.
5. If cutover fails, an operator may restore the flag to false to restore eligible legacy direct behavior while investigating. This does not make new account keys usable directly. Leave the additive migration in place; do not drop data or loosen the gateway's service/account authentication boundary as rollback.

## Acceptance Gate

- Import the canonical public GET spec and verify exactly eleven POST tools and matching operationIds. Confirm no client/admin/internal/payment/void action is generated and no credential is embedded in the spec, recipe or recording.
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
