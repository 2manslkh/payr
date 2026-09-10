# MCP-first Payr onboarding

## Current Scope: 10 September Reconciliation

Preserved from the newer root onboarding donor. Its read-only public check and
local verification below are dated evidence, not checks run by this docs lane.
The candidate retains the newer dashboard login and MCP guide under
`reconciliation-v2.md`; the optional direct-MCP plugin is archive-only and excluded
from active distribution. It is neither a gateway authentication mechanism nor an
installation prerequisite. The historical plugin-validation observation below
does not approve packaging or activation.

For new invoice publication, the 10 September decision supersedes the donor's
publication-only wording: review exact version/defaults/client changes and both
frozen email addresses, obtain Publish & Send consent and submit `approval:true`
with `deliveryApproval:true`. Disabled invoice email blocks fresh publication.
Finalized legacy no-send replay stays read-only, with no backfill or duplicate
Gmail send. Initial email, verified payment/receipt and independently enabled
receipt-delivery proof remain core acceptance, not part of a read-only setup check.
No live operation or new deployment is authorized by source consolidation.

## Implementation

The primary onboarding path is a remote MCP connection, not a plugin download.
`/install` separates adding the server, configuring private workspace access, and
verifying that access with a read-only account call. It includes a public,
credential-free setup prompt and distinguishes Claude/Cowork UI instructions from
Claude Code terminal commands. Copy success never changes workspace status.

Public configuration and the prompt live in `src/lib/payr-connection.ts`; the
homepage quick start and install guide share the gateway endpoint.

The root checkout did not contain the newer deployed `/install` route. Its page
structure and Commit Ledger styling were inspected in the retained deployment
snapshot `.worktrees/privy-vercel-deploy-20260909/` and adapted into this checkout.
No deployment snapshot or production settings were modified. When releasing,
reconcile these scoped changes with the current production source rather than
deploying this older root checkout wholesale; see `privy-onboarding.md` for the
composed production snapshot.

## Public gateway check - 10 September 2026

Endpoint: `https://api.payrlink.xyz/mcp`.

Read-only protocol checks, without credentials or plugin installation:

- `initialize` returned HTTP 200 with SSE-framed JSON-RPC, negotiated protocol
  `2025-03-26`, server name `Payr`, and gateway version `v0.17.2`.
- `tools/list` returned eleven Payr operations plus the gateway's `info` tool:
  `create_account_challenge`, `register_account`, `get_account`,
  `revoke_current_credential`, `get_sender_profile`, `save_sender_profile`,
  `create_invoice_draft`, `list_invoices`, `get_invoice`, `publish_invoice`, and
  `get_invoice_status`.
- The live catalog did not include `get_account_context` or `void_invoice`.
  The local twelve-operation upstream specification is therefore newer than
  this imported gateway catalog. Do not promise wallet discovery in onboarding.
- A `tools/call` request for `get_account` with only
  `{requestBody:{input:{}}}` returned `isError:true` and upstream 401
  `AUTH_REQUIRED`. No workspace facts were returned.
- The gateway preserves substantial workflow descriptions but adds a
  `requestBody` wrapper and gateway-specific fields. Agents must use its actual
  discovered schemas rather than the direct MCP schemas.

These checks prove public reachability, discovery, and missing-account denial.
They do not prove signed-in Claude/Cowork compatibility or authorized workspace
access. No account was registered and no invoice/profile/payment was mutated.

## Remaining authentication dependency

The live generated schemas expose `accountCredential` under `requestBody`.
Password/write-only annotations do not make model-visible arguments private.
The gateway's generated generic API-key/Bearer environment-variable advice is not
evidence that Claude/Cowork can privately forward an individual Payr credential.
Do not tell users to supply an operator service key or paste an account key in
chat to work around the missing integration.

An operator must configure and verify per-user private credential injection in
the chosen client/gateway integration. The public guide labels this step as still
needing verification, rather than claiming that adding the public URL signs the
user in. The existing live HTTP-gateway test used a body fallback; it does not
establish private generated-MCP authentication. See `bazantic-agent-api.md`.

## Claude/Cowork acceptance

With an operator-provided private credential path and an approved test workspace:

1. Add the public gateway in Claude/Cowork's custom-connector UI; load no plugin.
2. Confirm initialization and discovered tool names in that client.
3. Configure one short-lived, appropriately scoped account credential privately.
4. Read `get_account`, confirm the expected workspace, and verify that a second
   isolated account cannot access the first account's invoices.
5. Exercise missing fields, sender setup if opted in, drafting, exact review,
   explicit Publish & Send with both literal approvals, same-input retries and
   canonical status using separately approved fixtures/recipients and mail enablement.
6. Revoke the test credential and confirm denial. Record client version,
   redacted outcomes and the real credential-injection mechanism.

Do not mark workspace access verified solely because the server URL was added,
the tool list appeared, or the setup prompt was copied. Publication remains a
separately approved action, not part of the public connection check.

## Local implementation verification (Donor, 10 September)

- 35 focused tests passed across the install prompt, quick start, public discovery
  and homepage suites. Coverage includes delayed clipboard completion, denied or
  unavailable clipboard fallback, client selection and keyboard focus, sitemap
  inclusion, and separation of setup from authenticated workspace status.
- Typecheck and focused ESLint passed; the Impeccable detector reported no findings.
- A production build and eight Chromium browser checks passed on desktop and
  mobile, including 320px overflow checks, clipboard read-back, tab keyboard
  navigation, and useful instructions with JavaScript disabled.
- Desktop/mobile install-page screenshots were reviewed. The optional plugin ZIP
  was rebuilt with its clarified direct-MCP scope and passed strict manifest
  validation.

These are local source/build/UI checks, not a production deployment or an
authenticated Claude/Cowork invoice smoke test. The later archive decision above
supersedes the plugin's distribution status; fresh candidate CI remains required.
