# Payr

Payr helps independent developers turn confirmed work into an invoice, then reconcile verified USDC settlement into a linked receipt.

## Status

This repository contains the R04 draft/revision lifecycle on the wallet-authenticated console and hardened database foundation. Local functionality includes strict partial draft input, structured missing fields, immutable version append, stable idempotent replay, pending client proposals, and server-rendered overview/ledger/detail views. Owner login, profiles, signed payout changes, connector lifecycle, and redacted activity remain available. Publication, protected links, wallet payments, PDFs, MCP, and email delivery remain later tranches. The public [payrlink.xyz](https://payrlink.xyz) deployment remains the earlier health shell; hosted activation still requires the intended Supabase project and runtime secrets.

## Local development

Requires Node 22 and pnpm 10.19.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The local quality commands are:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm exec playwright install chromium
pnpm db:start
pnpm test:e2e
```

`pnpm test` aliases `pnpm test:unit`. Unit discovery covers `.test.ts` and `.test.tsx` while excluding integration tests. Playwright runs separate desktop and mobile Chromium projects against a production build/start both locally and in CI; set `PAYR_TEST_PORT` to isolate concurrent worktrees. Browser tests now require the local Supabase stack because the invoice pages read real server-side projections. Run database and browser suites serially locally: they share test fixtures.

### Local database

Requires Docker and a PostgreSQL `psql` client. Use the pinned repository Supabase CLI, not a global installation:

```bash
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm test:db:local
pnpm exec supabase stop --no-backup
```

Payr uses API port `57321`, Postgres `57322`, and shadow port `57320`. Reset is explicitly local and recreates the private PDF-only `documents` bucket. Only the active database steward may reset the shared stack during parallel work. Supabase's local services bind to all interfaces and use development credentials: do not expose these ports outside a trusted development network or use these credentials in production.

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

The canonical service uses authoritative sender data and confirmed saved/proposed client facts. Proposed client edits remain on the draft until publication; no profile row is silently changed. The read-only `/app/invoices` ledger and detail show exact USDC amounts, separate commercial/payment state, defaults, provenance, and pending changes. There is no browser authoring or publication form. Claude MCP is not connected yet; publication and document generation are R05/R06 work.

Country entry requires assigned ISO alpha-2 codes. Previously accepted non-ISO values remain editable, but drafts identify them as fields needing confirmation rather than reporting a provider failure.

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
- Arc Testnet chain ID `5042002`, the official RPC/explorer, and native-USDC behavior were verified from official sources and live read-back. Runtime Arc variables and funded wallets are still intentionally absent.
- The intended Vercel project runs Next.js on Node 22. `https://payrlink.xyz/api/health` and the stable public fallback `https://payr-sandy.vercel.app/api/health` return the deployed commit without environment details.
- Local Supabase reset, privilege denial, and repository transactions are verified. A hosted Supabase project is not configured; funded Arc wallets, Resend delivery, Claude connector UI, receipt inboxes, and the authenticated ETHGlobal deadline still require operator work.

Local R04 verification and release boundaries are in [`docs/ops/r04-drafts.md`](docs/ops/r04-drafts.md). Prior R03/R02 evidence remains under `docs/ops/`. Task 6 live deployment/payment remains gated on funded-wallet evidence, and later connector/email proof remains gated on Claude and Resend configuration. The historical external-prerequisite ledger is in [`docs/ops/preflight.md`](docs/ops/preflight.md).
