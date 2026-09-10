# MCP Claude Smoke

## 10 September Transport Boundary

This runbook covers direct Payr MCP, not the public generated gateway. Use
`mcp-onboarding.md` for the newer MCP-first public guide and its still-unverified
private per-user credential injection. The recorded gateway has eleven Payr
operations without account context or void; local upstream has twelve including
context. The optional direct-MCP plugin is archive-only, not required here.
Privy login/receiving-wallet onboarding is retained with separate live ownership,
linking and policy-denial gates; it does not replace the local-testnet attestor.
Old R09 test counts below remain dated evidence; fresh combined CI and approved
authenticated-client, initial-email, payment and receipt acceptance remain gates.

## Scope And Preconditions

R09 adds a stateless Streamable HTTP endpoint at `/api/mcp/[token]` using the pinned official MCP SDK. Each request uses existing connector credential verification and atomic database token/IP admission. Protocol discovery consumes the existing read-only `invoice:status` action; tool calls consume their actual canonical action once. Direct Chat Setup adds opt-in `sender:read` and `sender:write`, without expanding existing/default credentials. There is no session registry, SSE resume, or cookie authorization fallback. Unsupported methods and resume headers are rejected explicitly.

Direct MCP retains the four invoice tools `create_invoice_draft`, `publish_invoice`, `get_invoice_status`, and `void_invoice`, the two opt-in sender tools, and `get_account_context` gated by `wallet:read`. The portable workflow is `skills/payr-create-invoice/SKILL.md`. Tool calls delegate to canonical services, including both publication/delivery approvals, version checks, separate invoice/receipt delivery status and connector-scoped sender/context reads. Existing credentials gain no scopes. Payout changes remain owner-signed dashboard actions. See `docs/ops/mcp-sender-profile.md` before enabling sender setup.

Before any live smoke, confirm operator approval for deployment, fixture publication, and connector creation/revocation. Confirm Claude custom-connector availability and compatibility with a credential-bearing URL and stateless POST transport. Local SDK tests do not prove Claude compatibility. No production credential, payment, email send, or deployment is authorized by this runbook.

Use the immutable application origin already recorded for published invoices. Keep R08 workers and delivery policy unchanged. A wallet UI deployment needs the verified public WalletConnect project ID, RPC, and attestor settings in `.env.example`; inspect the intended deployment's secret-free configuration readiness without copying secrets into this document.

## Local Gates

Run from the isolated R09 worktree:

```bash
pnpm exec vitest run --config vitest.config.ts src/lib/mcp src/app/api/mcp
pnpm verify
```

On an explicitly disposable local database with the released migrations, run the endpoint's real-repository admission matrix and payment browser simulations. These commands do not themselves prepare an isolated database; inspect the fixture guards and local environment first. The broader existing suites can truncate data and must not run against retained demo fixtures.

```bash
pnpm test:db:local src/lib/mcp/transport.integration.test.ts
PAYR_TEST_PORT=3099 pnpm test:e2e tests/e2e/payment-page.spec.ts --workers=1
```

The browser suite uses simulated wallet/RPC/authorization/status responses, not live payments. The endpoint database matrix checks independent token/IP limits and recovery, expiry/revocation, non-dispatch on denial, and persisted audit redaction.

## Approved Live Sequence

1. Verify the approved deployment and preserved application origin. Confirm there is no body/path capture in application telemetry and that hosting/access-log controls protect bearer URLs. The route strips credentials before handing the request to the SDK and returns generic errors, but cannot control upstream access logging. Disable traces, video, screenshots, and network exports that could retain connector or document bearers.
2. In Payr Connections, create a fresh short-lived demo connector. Enter its secret URL directly in Claude's connector settings. Record only its token ID and expiry in private operator records, never the raw URL or credential. Load the portable workflow where the host supports skills.
3. Prove direct-MCP discovery returns the four invoice, two sender and one account-context tool names. An invoice-only connector must be denied sender/context calls. With separate approval, create appropriately scoped connections and verify sender access and `wallet:read` context, including cross-workspace denial. Record client and negotiated protocol versions without copying credential-bearing requests. Do not impose this seven-tool catalog or void step on the public gateway.
4. Submit a synthetic invoice with an incomplete sender. Expect structured `MISSING_FIELDS`, `draftCreated: false`, and no invoice mutation. With an opted-in connection, read the sender, review and explicitly approve all setup fields, then save with the returned ID/revision. Verify payout is unchanged, repeat-save conflict is clear, and the original invoice payload/key now returns `DRAFT_READY`. Never put sender fields into draft input. Record its ID/version without protected links.
5. Revise using `create_invoice_draft` and its actual expected version. Show the complete preview, defaults, payout, and client-profile diff. Confirm that a missing/false approval cannot publish. Obtain explicit operator approval before publishing the reviewed fixture.
6. Refresh/reimport discovery, review the exact version/default/client diff and both snapshot email addresses, and obtain explicit Publish & Send approval. Use `approval:true`, `deliveryApproval:true` and one stable idempotency key. Reconnect and retry unchanged input: links reconstruct without re-enqueueing. Inspect `invoiceEmail` separately from `receiptEmail`; do not send a duplicate Gmail message. Live sends require separately authorized real test addresses and operator enablement; while invoice email is disabled, fresh publication must fail before writes. Historical v1 finalized replay remains no-send.
7. Query canonical status. Verify separate commercial, settlement, receipt, and delivery axes. A complete payment-to-receipt rehearsal needs separate approval and a new approved unpaid fixture. Never repay an existing paid demo invoice or reuse consumed email/payment approvals.
8. On a separate approved unpaid fixture, request and explicitly approve void. Verify the returned state and explain that valid late settlement is still recorded. A void is not a refund.
9. Revoke the demo connector in Payr Connections. Verify subsequent initialize, discovery, and tool calls are denied. Revoke it even if earlier smoke steps fail. Report any inability to revoke immediately as an operator blocker.

## Evidence Ledger

Status: live smoke not performed by this implementation session.

The local/disposable Linux gates passed on 8 September 2026, including 467 database tests and 72 browser simulations. See `docs/ops/r09-implementation.md` for complete evidence and isolation details; these passes do not complete the live sequence above.

Record deployment SHA/ID, date, client/protocol versions, exact discovered names, structured missing-field result, draft/revision IDs and versions, approval checks, replay equality, status axes, separate void result, and post-revocation denial. Record pass/fail/blocked for each step. Keep recipient details, payloads, protected URLs, token material, provider IDs, and wallet keys out of public evidence.

R09 is not release-complete until isolated regression gates, independent review, and the separately approved deployed Claude smoke are accounted for. Provider acceptance and a rendered WalletConnect QR are not substitutes for human inbox or full external-wallet proof.
