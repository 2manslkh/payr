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

## Hackathon Guidance Deployment - 10 September 2026

User-authorized production deployment: `dpl_77Y4LM4sQGypHkQSUuoBPrV1smPd`,
`https://payr-2er5tjco4-kenks-projects.vercel.app`, promoted to `payrlink.xyz`.
Source is `ac4188438693429f90414838fbf4888eb0c04c4c` plus the 17-file
hackathon guidance/error-response delta and `.vercelignore` exclusion of
`.supabase/`. No commit, migration, environment change or Bazantic reimport was
performed. The health SHA alone does not identify this uncommitted source delta.

Before upload, the previous production source matched local source except for
the intended delta. After promotion, 544 compared uploaded entries matched local
bytes with zero mismatches. `.env.example` and the retained
`supabase/.branches/_current_branch` marker were not content-read; `.supabase/`
contents were excluded. Sorted uploaded path/NUL/SHA-1 manifest SHA-256:
`725c78044135f62a224f08235e556ec2aa9cc44b9e173d033fe9f14b92c423db`.
This deployment record was added after the upload.

Verification: 2,639 unit tests passed with two workers (13 existing skips),
typecheck/lint passed, four desktop/mobile install browser checks passed, and
35 compiled document-package checks passed. Public `/api/health` returned `ok`;
`/install` exposed the demo warning; `/openapi/agent.json` exposed 12 operations
with consent/body-credential guidance. Previous production recovery target:
`dpl_9Ao3oguP3QUTB1huJDzGDt7sPAFp`. Bazantic catalog reimport and authenticated
client `get_account` acceptance remain separate; no business writes were tested.

## Historical public gateway check - 10 September 2026

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

## Approved Hackathon Credential Exception

The live generated schemas expose `accountCredential` under `requestBody`.
Password/write-only annotations do not make model-visible arguments private.
The user confirmed Bazantic does not forward `Authorization`. Codex bearer/OAuth
configuration is not this body-credential path; client configuration does not
automatically inject body credentials. Do not invent forwarding or body-injection
configuration support.

Prefer an operator-configured private credential path if available. As an explicit
hackathon exception, only with informed per-user consent, use a short-lived,
least-privilege raw account credential for a dedicated demo workspace in generated
gateway `requestBody.accountCredential` beside `input`. Upstream it is top-level
`accountCredential` beside `input`, not inside `input`, and has no `Bearer ` prefix.
For a read-only `get_account` check, the generated argument shape is:

```json
{"requestBody":{"accountCredential":"<raw demo account credential>","input":{}}}
```

This is a placeholder, not a real credential or client configuration. Explain
before consent that the model sees this secret and model/tool history and gateway
traces may retain it. Never use service keys, wallet private keys, seed phrases or
browser cookies in this path. Keep secrets out of source control, shared examples,
screenshots and recordings; revoke the credential after the demo. Redaction and
revocation cannot erase retained copies. Without a private path or this explicit
consent, stop at "Workspace access pending".

This changes guidance only, not authentication plumbing or action approvals.
Private per-user injection and live authenticated MCP-client execution remain
unverified. Adding the public URL does not sign the user in. The historical HTTP
gateway test used a body fallback; it does not establish private generated-MCP
authentication or authenticated Claude/Cowork/Codex execution. See `bazantic-agent-api.md`.

## Claude/Cowork acceptance

With an approved test workspace and either a private credential path or informed
per-user consent to the dedicated demo exception above:

1. Add the public gateway in Claude/Cowork's custom-connector UI; load no plugin.
2. Confirm initialization and discovered tool names in that client.
3. Configure one short-lived, least-privilege account credential privately if available; otherwise use the consented demo body path above.
4. Read `get_account`, confirm the expected workspace, and verify that a second
   isolated account cannot access the first account's invoices.
5. Exercise missing fields, sender setup if opted in, drafting, exact review,
   explicit Publish & Send with both literal approvals, same-input retries and
   canonical status using separately approved fixtures/recipients and mail enablement.
6. Revoke the test credential and confirm denial. Record client version,
   redacted outcomes and the actual private-injection or model-visible body mechanism.

Do not mark workspace access verified solely because the server URL was added,
the tool list appeared, or the setup prompt was copied. Publication remains a
separately approved action, not part of the public connection check.

## Historical local implementation verification (Donor, 10 September)

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
