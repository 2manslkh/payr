# Payr

Payr helps independent developers turn confirmed work into an invoice, then reconcile verified USDC settlement into a linked receipt.

## Status

**10 September reconciliation:** planned breaking `v2.0.0`, based on released
`v1.8.0` main `cbcf7e2`, selectively retains Privy onboarding/business-wallet
discovery, newer dashboard login/MCP setup and mandatory Publish & Send. New
publishes require both `approval:true` and `deliveryApproval:true`; disabled
invoice email blocks fresh publication. Finalized legacy no-send replay is
read-only with no historical mail backfill. The optional direct-MCP plugin is
archived, not an install prerequisite or pending public package.

Recorded production is `cbcf7e2` **plus an uncommitted Privy snapshot**, not main
alone and not this reconciliation candidate. Preserve the [10 September deployment
evidence](docs/ops/privy-onboarding.md#vercel-deployment-2026-09-10): no real login
credentials were submitted; ownership, linking and genuine policy denial remain
unproven. [Current execution](docs/ops/reconciliation-v2.md) requires fresh CI and
review; source consolidation neither releases/deploys this candidate nor authorizes
live writes. [STATUS.md](STATUS.md) tracks the remaining acceptance gates.

The public gateway's recorded catalog has eleven Payr operations without account
context or void; local upstream has twelve including context. [MCP onboarding](docs/ops/mcp-onboarding.md)
separates discovery from private workspace access. Per-user private credential
injection into generated MCP remains unverified; never paste account/service
secrets in chat. Initial-email, verified payment/receipt and separately enabled
receipt-delivery proof are required for core acceptance, not inferred from a tool
list, provider acceptance, old test counts or same-address email evidence.

### Historical Root-Updates Status (9 September)

The next two paragraphs preserve the older base and evidence limits. Their release
execution pointers are historical; the 10 September scope above controls this candidate.

This release candidate is based on `v1.6.0` at `aebcd15` ([PR #16](https://github.com/2manslkh/payr/pull/16)). Protected invoices/PDFs, Arc native-USDC payments, reconciliation, immutable receipts, durable delivery workers, public discovery, and Claude MCP are implemented. MCP retains four default invoice tools and separately opted-in sender read/save authority; payout changes remain owner-signed. This is distinct from the recorded R09 `v1.3.0` deployment evidence at `2dfa8db159c19f95a5af9e99cb4a5a428b2c2e2a` ([PR #12](https://github.com/2manslkh/payr/pull/12)). That record does not establish deployment of this candidate. See [R09 release evidence](docs/ops/r09-release.md) and [current release execution](docs/ops/root-release-manifest.md).

The release has explicit live limits: Claude connector and full external-wallet rehearsals remain unverified. One approved R08 receipt email was provider-verified as delivered, but human inbox opening and unattended delivery are not claimed; production receipt email remains disabled. [STATUS.md](STATUS.md) tracks the remaining proof/submission work. The user-approved clean replay on `integration/root-updates-v1.7.0` retains dashboard/wallet/install/roadmap changes while preserving the original `integration/root-updates` evidence. The [root cleanup inventory](docs/ops/repository-cleanup.md) is historical, not a current branch inventory. No release or deployment is implied before the required gates finish.

**PDF text limitation:** invoice fields support printable ASCII plus LF line breaks only. Accented text, Thai, emoji, and other unsupported characters fail closed. Payr does not silently drop characters, transliterate names, or invent legal details. Confirm accurate supported facts before publication; an invalid document after reservation can permanently consume an invoice number.

## Schedule and roadmap

The submission deadline is **13 September 2026, 12:00 EDT / 16:00 UTC**, with an internal 14:00 UTC upload target. The [implementation calendar](docs/superpowers/plans/2026-09-04-payr-mvp-implementation-plan.md#deadline-and-calendar-override) supersedes the original 44-hour availability assumption and September 15 freeze. The user is developing `docs/architecture.excalidraw.svg`; the final video will be recorded after the deployed product flow is complete and before submission.

[One-click mainnet deployment-readiness](docs/ops/mainnet-readiness.md) is a separate approved target due **30 September**, not a shipped capability. Marketplace settlement/escrow, invoice-history credit assessment, and undercollateralized USDC lending are the [post-MVP roadmap](PROJECT.md#future-credit-and-lending), not current features or claims of an existing Circle lending integration.

## Local development

Requires Node `>=22.13 <23` and pnpm `10.19.0`. Use the frozen lockfile; PDF/native dependency versions are pinned for the current producer and verification profile.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The local quality commands are:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:release
pnpm build
pnpm test:documents:package
pnpm test:contracts
pnpm contracts:abi:check
pnpm exec playwright install chromium
pnpm db:start
pnpm test:e2e
```

`pnpm test` aliases `pnpm test:unit`. Unit discovery covers `.test.ts` and `.test.tsx` while excluding integration tests. `pnpm verify` runs lint, typecheck, unit/release tests, build, then `pnpm test:documents:package`; the required CI `web` check also runs this post-build gate. Pre-build unit tests alone do not exercise the isolated traced-package/native/font cases.

Playwright runs separate desktop and mobile Chromium projects against a production build/start both locally and in CI; set `PAYR_TEST_PORT` to isolate concurrent worktrees. Browser tests require the local Supabase stack and exercise real compiled publication and protected routes. Run database and browser suites serially locally: they share test fixtures.

### Local database

Requires Docker and a PostgreSQL `psql` client. Use the pinned repository Supabase CLI, not a global installation:

```bash
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm test:db:local
pnpm exec supabase stop --no-backup
```

Payr defaults to API port `57321`, Postgres `58322`, and shadow port `57320`. Reset is explicitly local and recreates the private PDF-only `documents` bucket. Only the active database steward may reset the shared stack during parallel work. Database/browser fixtures can erase local data; use the explicit project and port configuration in [local test isolation](docs/ops/test-isolation.md) to preserve the approved demo during release checks. A different worktree alone does not isolate Docker containers. Supabase's local services bind to all interfaces and use development credentials: do not expose these ports outside a trusted development network or use these credentials in production.

**Retained database boundary:** the earlier 9 September observation of dashboard version `202609080001` colliding with publication fairness is historical. The later [approved migration read-back](docs/ops/dashboard.md) records all eleven repository migrations applied with matching names locally and on hosted Payr, including dashboard version `202609080003`; this was not application deployment. That record supersedes the pending-reconciliation warning, not the data-preservation boundary. Do not run the reset or fixture commands above against the retained demo.

`pnpm test:db:local` and `pnpm test:e2e` use `scripts/run-local-tests.mjs` to capture only the running local Payr project's URL, database URL, anon key, and service-role key for the subprocess. They do not print keys, evaluate shell output, or write environment files. `pnpm test:db` remains the low-level suite and fails closed without local `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Existing ignored `.env.test.local` configuration is supported; the launcher overrides inherited Supabase values. CI provisions separate ephemeral local stacks for the `database` and `browser` jobs, never hosted credentials.

To run the built application after `pnpm build`:

```bash
pnpm start --hostname 127.0.0.1
curl http://127.0.0.1:3000/api/health
```

The health endpoint returns only `{ "status": "ok", "commit": string | null }`; it never returns configuration values.

### Settlement authorization

R07 uses native 18-decimal USDC on Arc Testnet (`5042002`) and an immutable, unfunded attestor with the guarded local-testnet signer. Privy onboarding provides a separate user-owned receiving wallet, not this payment signer. Follow the [configuration and live-operation runbook](docs/ops/r07-settlement.md) rather than supplying client-side payment facts. `POST /api/invoice/[slug]/authorize` accepts no payload bytes and returns a signature only after authorization persistence. Issuance never marks an invoice paid.

The operator script requires an explicit testnet guard and exact human confirmation. It caps gas at `0.1 testnet USDC` and durably retains the public transaction identity in an exclusive local `.operator-payment.json` before broadcast. On any ambiguous result, retain the journal and run `pnpm tsx scripts/operator-pay.ts --recover` from the same directory. Recovery is read-only and requires no payer key. The recorded demo invoice is already paid onchain: never pay it again to repeat evidence.

### Identity console

Configure `NEXT_PUBLIC_APP_URL`, `ARC_CHAIN_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_ENCRYPTION_KEY`, and `CONNECTOR_TOKEN_PEPPER` in the ignored runtime environment before using `/login` and `/app`. The session key must decode from base64/base64url to exactly 32 random bytes; the connector pepper must decode to at least 32 random bytes. They are independent secrets, never browser-facing values. Use the healthy HTTPS origin in production, or an explicit-port localhost/loopback origin locally.

With Privy configured, `/login` uses Privy authentication and server-provisioned user-owned receiving wallets. New workspaces initialize payout to that wallet; linking an existing workspace preserves its original owner anchor, payout, profiles, invoices and credentials. Follow [Privy onboarding](docs/ops/privy-onboarding.md) for configuration, explicit legacy linking and live verification. New legacy wallet-login requests are disabled while Privy is configured; existing bounded sessions survive. Payout changes still require a fresh owner signature binding old/new addresses. Sessions use the Secure, HttpOnly, SameSite=Lax `__Host-` cookie; logout clears this browser's cookie, not all sessions.

Sender saves through `POST /api/profile` require `expectedProfileId` from the reviewed `GET /api/profile` response alongside `expectedRevision`. The ID is only a precondition, never authorization scope. A switched browser session returns `PROFILE_CHANGED` without writing the new workspace's profile. Reload older Settings tabs before saving; direct HTTP callers must include the same reviewed ID. The internal service-only profile RPC remains unchanged.

Direct MCP connector credentials are shown once and expire within 30 days. Direct MCP retains the four invoice tools including `void_invoice`; opted-in sender scopes authorize sender read/save, and `wallet:read` gates account context without silently expanding existing tokens. REST gateway account credentials are distinct, service-bound and at most seven days; public generated MCP does not yet have verified private per-user injection. `/install` is the MCP-first guide, not a plugin download. Use the [onboarding boundary](docs/ops/mcp-onboarding.md) and [direct connector smoke procedure](docs/ops/mcp-claude-smoke.md) for the actual transport. Creating a credential does not authenticate an agent automatically. Keep secrets out of chat/recordings and revoke demo credentials; application redaction cannot remove platform/CDN/browser/clipboard copies. Payout changes remain owner-signed; sender saves and voiding require explicit approval.

Browser tests generate ephemeral identity keys for their local server and workers, never reuse production secrets, and keep Secure cookies enabled. `pnpm test:db:local` also exercises the real signature-to-database route flow; browser API mocks are not the only integration evidence.

### Drafts and revisions

`POST /api/invoices/drafts` accepts authenticated, CSRF-protected partial draft requests. An incomplete request returns structured `MISSING_FIELDS` without creating a draft or consuming its idempotency key. Supply `draftId` and `expectedVersion` together to append a revision. Same-key retries reconstruct the original immutable result even if profiles, aliases, or later versions changed.

The canonical service uses authoritative sender data and confirmed saved/proposed client facts. Proposed client edits remain on the draft until approved publication finalizes atomically. The `/app/invoices` ledger and detail show exact USDC amounts, separate commercial/payment state, defaults, provenance, and pending or applied changes. There is no browser authoring or publication form. MCP delegates to these same canonical services; the portable workflow is in `skills/payr-create-invoice/SKILL.md`.

Country entry requires assigned ISO alpha-2 codes. Previously accepted non-ISO values remain editable, but drafts identify them as fields needing confirmation rather than reporting a provider failure.

### Publication and recovery

Publication binds the configured `ARC_CHAIN_ID` and nonzero `NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS` once per attempt. New reservations also require `LINK_ACTIVE_KEY_VERSION` and matching `LINK_TOKEN_KEY_V<n>` material. Retain old key versions for existing links; replay and read paths use stored versions, never the current active key as a substitute.

`POST /api/invoices/[id]/publish` requires exact version, `approval:true`, `deliveryApproval:true` and an idempotency key for new publication. Review the complete draft/defaults/client changes and both frozen email recipients, through the agent or dashboard Publish & Send review. Email enablement and Resend configuration must pass before reservation. Duplicate JSON properties are rejected. A number is permanently consumed at reservation; workers recover the same attempt/object with a higher fence after lease expiry. No link is exposed before verified finalization. Frozen PDF/private links are queued transactionally per distinct normalized client/issuer address; a terminal failure needs a new approved key and never restores the number. See [Publish & Send](docs/ops/publish-and-send.md) for failure and rollout boundaries. No browser draft authoring or production fake provider is added.

Canonical status and Share/Copy reconstruct existing finalized artifacts from retained keys without enqueueing mail. The legacy `gmailLinkPackage` is compatibility data, not an instruction to send a duplicate. Authorized finalized no-send replay remains read-only and cannot reserve/resume or acquire delivery approval retroactively. New Publish & Send results expose `invoiceEmail` separately from `receiptEmail`; `sent` is provider acceptance, not inbox delivery. Voiding revokes access without erasing immutable records or later valid settlement.

Cron publication processing requires a timing-safe `CRON_SECRET` bearer. Migration `202609080001_publication_fairness.sql` orders eligible attempts by least-recent update before creation order, so a persistently unavailable artifact cannot monopolize every recovery batch. Targeted retries, 60-second leases, fences, and immutable artifact rules are unchanged. UI sharing is explicit, holds links only in component memory, and clears them on hide/navigation/void. Publication browser tests verify actual share responses in Node memory and redact credentials before browser artifacts, with trace/video/automatic screenshots disabled for that scenario.

The dedicated invoice-only recovery route `/api/jobs/invoice-outbox` uses
`PAYR_INVOICE_CRON_SECRET ?? CRON_SECRET`: fallback only when the dedicated variable
is absent, and an explicitly empty dedicated value fails closed. The selected
secret must be at least 32 characters; Vault's `payr_invoice_email_cron_secret`
must match that selected value. [Cron/Vault setup](docs/ops/publish-and-send.md#supabase-cron-setup)
is a separately approved operator step, not an executed configuration claim.

### Immutable documents

`/invoice/[slug]` and `/invoice/[slug]/pdf` expose finalized invoices through live bearer credentials. HTML and PDF share immutable invoice facts and the exact QR destination. By the approved self-reference exception, the PDF's own final hash and commitment appear on protected HTML and subsequent receipts, not inside that invoice PDF. R08 adds `/receipt/[slug]` and its PDF route with separate receipt credentials; see [receipt and delivery operation](docs/ops/r08-receipts-delivery.md).

The private `documents` bucket uses create-only `upsert:false` uploads and migration `0005` guards the stored object pointer against the observed concurrent-create race. Publication verifies downloaded PDF bytes, material text, positioned row/total amounts, and raster-decoded QR before hashing/finalization. Free-form descriptions cannot supply evidence for another amount cell. Downloads serve the stored bytes after hash and access revalidation, never a signed Storage URL or redirect. Existing objects are not overwritten; known stored/finalized missing objects are not regenerated. Keep `NEXT_PUBLIC_APP_URL` fixed while published artifacts or active attempts reference it.

Protected responses use fresh nonce CSP and private/no-store, noindex, no-referrer, and other security headers. Credentials that are malformed, wrong-purpose, expired, or revoked receive the same generic true `404` at admission; commercial invoice expiry still allows a live bearer to read, while voiding revokes it. HMAC-keyed database-minute admission limits are 120/IP, 60/verified token, and 600/global. Document access reads `CONNECTOR_TOKEN_PEPPER` independently of session configuration.

Verification accepts only the restricted current PDF producer profile, not general PDF uploads: 10 MiB input, 24 pages, 4 MiB per decoded stream, 16 MiB aggregate decoded streams, and 4 million aggregate image pixels. A 45-second worker timer awaits termination within the existing 60-second publication lease; this is not an OS-enforced RSS sandbox or absolute wall-clock limit. At most 10,000 positioned text items and 2 MiB of inspection output are accepted. Final local evidence and the remaining hosted/response-verification boundaries are recorded in [`docs/ops/r06-documents.md`](docs/ops/r06-documents.md).

## Versioning

Payr uses Semantic Versioning and annotated `vX.Y.Z` Git tags. The release contract and `cut new version` workflow are documented in [`docs/ops/versioning.md`](docs/ops/versioning.md).

Multi-agent implementation uses isolated worktrees and versioned integration tranches. The execution runbook is [`docs/superpowers/plans/2026-09-05-payr-agent-orchestration-plan.md`](docs/superpowers/plans/2026-09-05-payr-agent-orchestration-plan.md).

## Configuration and Arc verification

Copy `.env.example` to `.env.local` and provide only the values needed for the feature being run. Do not commit local environment files or credentials.

`pnpm verify:arc` reads `ARC_RPC_URL` and `ARC_CHAIN_ID`, calls `eth_chainId`, and compares the returned hexadecimal ID exactly. It does not print the RPC URL or credentials.

### Verified prerequisite facts (2026-09-05)

- GitHub CLI authentication is active for the repository owner, and `origin` is `https://github.com/2manslkh/payr.git`.
- Node `v22.22.0` and pnpm `10.19.0` are installed locally.
- Foundry CLI (`forge`), Supabase CLI, and Docker are available locally.
- Arc Testnet chain ID `5042002`, the official RPC/explorer, and native-USDC behavior were verified during R01. Current runtime endpoints and funded wallets must still be verified before live use. The preserved `.env.example` RPC default uses an unverified `.network` hostname; current official documentation lists `https://rpc.testnet.arc.io`.
- The intended Vercel project runs Next.js on Node 22. `https://payrlink.xyz/api/health` and the stable public fallback `https://payr-sandy.vercel.app/api/health` return the deployed commit without environment details.
- Local Supabase reset, privilege denial, and repository transactions are verified. Hosted Supabase and deployment configuration are unverified by this tranche, not asserted to be absent. Funded-wallet, Resend, Claude connector, and receipt-inbox proof remain separate operator/live gates; current submission planning is maintained separately.

The historical external-prerequisite ledger above retains its original observation date. [R07 evidence](docs/ops/r07-settlement.md) establishes hosted documents, initial invoice delivery, and operator payment; [R08 evidence](docs/ops/r08-receipts-delivery.md) adds reconciled receipt and one idempotent provider-verified delivery. [R09 release evidence](docs/ops/r09-release.md) records the deployed client-payment/MCP implementation and its still-open live acceptance gates. Do not repeat consumed payment or send approvals to reproduce these records.
