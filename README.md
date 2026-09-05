# Payr

Payr helps independent developers turn confirmed work into an invoice, then reconcile verified USDC settlement into a linked receipt.

## Status

This repository contains the R03 wallet-authenticated console and the R02 domain/database foundation. Local functionality includes owner login, encrypted sessions, sender/client profiles, owner-signed payout changes, revocable connector credentials, and redacted activity. Invoice publication, wallet payments, contracts, PDFs, MCP, and email delivery remain later tasks. The public [payrlink.xyz](https://payrlink.xyz) deployment remains the earlier health shell; activating the new hosted console requires a configured Supabase project and identity runtime secrets.

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
pnpm test:e2e
```

`pnpm test` aliases `pnpm test:unit`. Unit discovery covers `.test.ts` and `.test.tsx` while excluding integration tests. Playwright runs separate desktop and mobile Chromium projects; set `PAYR_TEST_PORT` to isolate concurrent worktrees.

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

`pnpm test:db:local` captures only the running local Payr project's URL, database URL, anon key, and service-role key for the test subprocess. It does not print keys, evaluate shell output, or write environment files. `pnpm test:db` remains the low-level suite and fails closed without local `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Existing ignored `.env.test.local` configuration is supported; the launcher overrides inherited Supabase values. CI runs reset, lint, and the same launcher in a separate `database` job with no hosted credentials.

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

Local R03 verification and release boundaries are in [`docs/ops/r03-identity-console.md`](docs/ops/r03-identity-console.md); R02 evidence remains in [`docs/ops/r02-domain-database.md`](docs/ops/r02-domain-database.md). Task 6 live deployment/payment remains gated on funded-wallet evidence, and later connector/email proof remains gated on Claude and Resend configuration. The historical external-prerequisite ledger is in [`docs/ops/preflight.md`](docs/ops/preflight.md).
