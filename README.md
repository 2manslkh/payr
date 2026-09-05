# Payr

Payr helps independent developers turn confirmed work into an invoice, then reconcile verified USDC settlement into a linked receipt.

## Status

This repository currently provides only the runnable application shell. The landing page identifies **Arc testnet**, but all chain and payment behavior is **planned and unimplemented**: no profile management, invoices, wallets, contracts, PDFs, MCP, email, or sponsor integrations are available yet.

## Local development

Requires Node 22 and pnpm 10.19.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The verified local quality commands are:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

To run the built application after `pnpm build`:

```bash
pnpm start --hostname 127.0.0.1
curl http://127.0.0.1:3000/api/health
```

The health endpoint returns only `{ "status": "ok", "commit": string | null }`; it never returns configuration values.

## Configuration and Arc verification

Copy `.env.example` to `.env.local` and provide only the values needed for the feature being run. Do not commit local environment files or credentials.

`pnpm verify:arc` reads `ARC_RPC_URL` and `ARC_CHAIN_ID`, calls `eth_chainId`, and compares the returned hexadecimal ID exactly. It does not print the RPC URL or credentials.

### Verified prerequisite facts (2026-09-04)

- GitHub CLI authentication is active for the repository owner, and `origin` is `https://github.com/2manslkh/payr.git`.
- Node `v22.22.0` and pnpm `10.19.0` are installed locally.
- Foundry CLI (`forge`) and Supabase CLI are installed locally.
- `ARC_RPC_URL` and `ARC_CHAIN_ID` are absent from the local environment. **Arc verification is BLOCKED** until both are supplied; no Arc chain value, wallet, or payment behavior has been assumed.
- Funded Arc wallets, Supabase project credentials, Privy, Resend, Claude/Gmail connectors, Vercel, and the authenticated ETHGlobal deadline have not been verified in this task.

Task 2 and later chain-dependent work remains gated on successful Arc verification.
