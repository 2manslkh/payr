# Payr

Payr helps independent developers turn confirmed work into an invoice, then reconcile verified USDC settlement into a linked receipt.

## Status

This repository contains the runnable application shell, a public secret-free health deployment at [payrlink.xyz](https://payrlink.xyz), and the approved framing and 10-task implementation plan. The landing page identifies **Arc testnet**, but the product workflow remains **planned and unimplemented**: no profile management, invoices, wallets, contracts, PDFs, MCP, email, or sponsor integrations are available yet.

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

`pnpm test` aliases `pnpm test:unit`. Unit discovery covers `.test.ts` and `.test.tsx` while excluding integration tests. `pnpm test:db` is reserved for the Supabase-backed integration suite introduced in Task 2 and fails closed when local Supabase credentials or integration tests are absent. Put local test credentials in ignored `.env.test.local` or export them in the shell; Next.js intentionally excludes `.env.local` in test mode. Playwright runs separate desktop and mobile Chromium projects.

To run the built application after `pnpm build`:

```bash
pnpm start --hostname 127.0.0.1
curl http://127.0.0.1:3000/api/health
```

The health endpoint returns only `{ "status": "ok", "commit": string | null }`; it never returns configuration values.

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
- Supabase project configuration, funded Arc wallets, Resend delivery, Claude connector UI, receipt inboxes, and the authenticated ETHGlobal deadline remain unverified or human-required.

Task 2 may proceed with Supabase initialization now that Docker is available. Task 6 live deployment/payment remains gated on funded-wallet evidence, and later live connector/email proof remains gated on Claude and Resend configuration. The full sanitized ledger is in [`docs/ops/preflight.md`](docs/ops/preflight.md).
