# Payr

Payr helps independent developers turn confirmed work into an invoice, then reconcile verified USDC settlement into a linked receipt.

## Status

R06 adds real invoice PDF/QR generation, immutable private storage, and protected HTML/PDF routes to the crash-safe publication protocol. Compiled publication, positioned money-row verification, exact served bytes, real QR decoding, and private response controls pass local integration gates. The protected release flow targets `v0.5.0`; tags and the merged PR record release completion. No hosted rollout or live payment proof is claimed.

**PDF text limitation:** invoice fields support printable ASCII plus LF line breaks only. Accented text, Thai, emoji, and other unsupported characters fail closed. Payr does not silently drop characters, transliterate names, or invent legal details. Confirm accurate supported facts before publication; an invalid document after reservation can permanently consume an invoice number.

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

Payr uses API port `57321`, Postgres `58322`, and shadow port `57320`. Reset is explicitly local and recreates the private PDF-only `documents` bucket. Only the active database steward may reset the shared stack during parallel work. Supabase's local services bind to all interfaces and use development credentials: do not expose these ports outside a trusted development network or use these credentials in production.

`pnpm test:db:local` and `pnpm test:e2e` use `scripts/run-local-tests.mjs` to capture only the running local Payr project's URL, database URL, anon key, and service-role key for the subprocess. They do not print keys, evaluate shell output, or write environment files. `pnpm test:db` remains the low-level suite and fails closed without local `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Existing ignored `.env.test.local` configuration is supported; the launcher overrides inherited Supabase values. CI provisions separate ephemeral local stacks for the `database` and `browser` jobs, never hosted credentials.

To run the built application after `pnpm build`:

```bash
pnpm start --hostname 127.0.0.1
curl http://127.0.0.1:3000/api/health
```

The health endpoint returns only `{ "status": "ok", "commit": string | null }`; it never returns configuration values.

### Identity console

Configure `NEXT_PUBLIC_APP_URL`, `ARC_CHAIN_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_ENCRYPTION_KEY`, and `CONNECTOR_TOKEN_PEPPER` in the ignored runtime environment before using `/login` and `/app`. The session key must decode from base64/base64url to exactly 32 random bytes; the connector pepper must decode to at least 32 random bytes. They are independent secrets, never browser-facing values. Use the healthy HTTPS origin in production, or an explicit-port localhost/loopback origin locally.

An injected externally owned Ethereum wallet signs a five-minute server challenge; no gas or transaction is involved. Sessions last eight hours and always use a Secure, HttpOnly, SameSite=Lax `__Host-` cookie. First login initializes payout to the signing owner wallet. Changing it requires a fresh owner signature binding the old and new payout addresses. Logout clears this browser's cookie; it does not revoke other sessions.

Connector credentials are shown once and expire within 30 days. The MCP endpoint is deliberately not functional yet. Revoke credentials after demos: Payr's application redaction cannot remove them from CDN/platform logs, browser or clipboard history, or Claude configuration. Nonce issuance and connector admission use atomic database limits; outside Vercel, nonce requests conservatively share one IP bucket instead of trusting forwarded headers.

Browser tests generate ephemeral identity keys for their local server and workers, never reuse production secrets, and keep Secure cookies enabled. `pnpm test:db:local` also exercises the real signature-to-database route flow; browser API mocks are not the only integration evidence.

### Drafts and revisions

`POST /api/invoices/drafts` accepts authenticated, CSRF-protected partial draft requests. An incomplete request returns structured `MISSING_FIELDS` without creating a draft or consuming its idempotency key. Supply `draftId` and `expectedVersion` together to append a revision. Same-key retries reconstruct the original immutable result even if profiles, aliases, or later versions changed.

The canonical service uses authoritative sender data and confirmed saved/proposed client facts. Proposed client edits remain on the draft until approved publication finalizes atomically. The `/app/invoices` ledger and detail show exact USDC amounts, separate commercial/payment state, defaults, provenance, and pending or applied changes. There is no browser authoring or publication form, and Claude MCP is not connected yet.

Country entry requires assigned ISO alpha-2 codes. Previously accepted non-ISO values remain editable, but drafts identify them as fields needing confirmation rather than reporting a provider failure.

### Publication and recovery

Publication binds the configured `ARC_CHAIN_ID` and nonzero `NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS` once per attempt. New reservations also require `LINK_ACTIVE_KEY_VERSION` and matching `LINK_TOKEN_KEY_V<n>` material. Retain old key versions for existing links; replay and read paths use stored versions, never the current active key as a substitute.

`POST /api/invoices/[id]/publish` accepts exact version, explicit approval, and idempotency key. It rejects duplicate JSON properties. A number is permanently consumed at successful reservation; workers recover the same attempt/object with an increased fence after lease expiry. No link is exposed before verified finalization, and a terminal failure requires a new approved idempotency key. R06 installs the real document adapter; publication requires configured chain/contract binding, link keys, and Supabase. There is no production fake-provider switch or browser authoring form. Native producer/package/font and storage infrastructure failures are retryable; invalid document proof is terminal and does not restore a consumed number.

Canonical status, link-only Gmail packages, and Share/Copy reconstruct existing finalized artifacts from retained keys. Gmail data is not send approval and no email provider is called. Finalized replay does not need current reservation binding or a document provider. Voiding and void replay do not need link/explorer configuration; they atomically revoke invoice access while preserving immutable records and any later valid settlement.

Cron publication processing requires a timing-safe `CRON_SECRET` bearer. UI sharing is explicit, holds links only in component memory, and clears them on hide/navigation/void. Publication browser tests verify actual share responses in Node memory and redact credentials before browser artifacts, with trace/video/automatic screenshots disabled for that scenario.

### Immutable documents

`/invoice/[slug]` and `/invoice/[slug]/pdf` expose finalized invoices through live bearer credentials. HTML and PDF share immutable invoice facts and the exact QR destination. By the approved self-reference exception, the PDF's own final hash and commitment appear on protected HTML and subsequent receipts, not inside that invoice PDF. Receipts are R08 work, not delivered by R06.

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

Local R06 evidence and remaining release gates are in [`docs/ops/r06-documents.md`](docs/ops/r06-documents.md); R05 protocol evidence remains in [`docs/ops/r05-publication.md`](docs/ops/r05-publication.md). Wallet authorization/payment belongs to R07/R09, receipts and durable email delivery to R08, and Claude MCP to R09. Hosted document delivery, live payment, connector, and email proof remain explicit gates. The historical external-prerequisite ledger is in [`docs/ops/preflight.md`](docs/ops/preflight.md).
