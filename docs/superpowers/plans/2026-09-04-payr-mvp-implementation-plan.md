# Payr MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the approved Payr vertical slice: one agent instruction becomes an approved immutable USDC invoice, PDF, QR code, and protected payment link; one real Arc payment becomes verified paid state plus receipt artifacts and idempotent Resend dispatches.

**Architecture:** One root Next.js application owns the dashboard, canonical invoice API, Streamable HTTP MCP endpoint, private document routes, Pay Now authorization endpoint, reconciliation handlers, and receipt delivery. Supabase/PostgreSQL is the private system of record; one Foundry contract on Arc accepts exact native USDC and emits the only event that can mark an invoice paid. A `PaymentSigner` port isolates the policy-controlled Privy wallet from a testnet-only local fallback.

**Tech Stack:** Node.js 22, pnpm 10, Next.js 16.3.4, React 19.2.8, TypeScript, Tailwind CSS, Vitest 5, Playwright 1.62, Zod 4.5, Supabase/PostgreSQL, `@react-pdf/renderer` 4.9, `qrcode` 1.5, viem 2.56, wagmi 3.7, Foundry, OpenZeppelin, `@modelcontextprotocol/sdk` 1.30, `@privy-io/node` 0.34, Resend 6.26, Vercel.

## Global Constraints

- Keng is the sole engineer; Chanita owns administration, presentation, and submission support.
- Engineering budget is 44 focused hours from 4–14 September 2026; code freezes on 15 September.
- Exact ETHOnline submission cutoff time and timezone must be recorded from the authenticated dashboard before submission scheduling.
- One primary user: an independent service provider or freelancer. The client is the bill-to party and human-controlled payer.
- One chain and asset: exact native USDC on Arc testnet through the 18-decimal native interface.
- No frontend callback, submitted transaction hash, or payment authorization may mark an invoice paid. Only a verified event from the configured chain and contract may create a settlement.
- Private names, addresses, contacts, line items, notes, salts, and documents stay offchain.
- Sender identity and payout wallet are dashboard-only. Agent tools may not change them.
- Host-agent web search is optional and approval-gated. A web-sourced field requires its URL and explicit confirmation; user-entered data uses `user_provided` provenance. Email and wallet addresses are never inferred.
- Invoice publication and Gmail sending are separate approval turns.
- Drafts display `DRAFT`. Publication atomically reserves an immutable sequential number; failed reservations are never reused.
- Published invoice content is immutable. Corrections use void-and-replace.
- Client access uses `https://payrlink.xyz/invoice/<high-entropy-slug>`. Store only a keyed hash of the slug; redact it from logs and analytics; return `noindex` and private/no-store caching headers.
- The PDF and QR code are core artifacts. The QR contains the protected HTTPS invoice URL, never raw calldata.
- Gmail sends the initial link-bearing message only if its smoke test is stable. Arbitrary PDF attachment is optional.
- Resend is used only for verified post-settlement receipts. Implement one idempotent logical dispatch per recipient; do not claim transport-level exactly-once delivery.
- Payment authorizations are issued only from Pay Now, last at most ten minutes, and are not evidence of payment.
- `payableUntil` defaults to 30 days after the commercial due date; authorization expiry is the earlier of ten minutes after issuance or `payableUntil`.
- Privy remains only if one allowed typed-data request succeeds, one forbidden request is denied by policy, and the Arc contract verifies the valid signature. Otherwise switch to the isolated testnet signer and withdraw from the Privy prize.
- No autonomous payer, fiat/card onboarding, tax engine, multiple assets/chains, escrow, disputes, refunds, partial payments, reminders, accounting integration, invoice NFT, token, or dual-party invoice signature.
- Preserve the pre-existing untracked `assets/` directory until Keng confirms the brand files may be committed.
- Every task ends with its focused tests, `git diff --check`, one atomic commit, `git push origin main`, and verification that local and remote `main` SHAs match.

## Stage Gates and Time Budget

| Task | Deliverable | Hours | Kill gate |
| ---: | --- | ---: | --- |
| 1 | Operational preflight and runnable shell | 3 | Stop if Arc RPC cannot be verified; record noncritical provider blockers |
| 2 | Domain model and database contract | 4 | No UI work until money/state invariants pass |
| 3 | Wallet authentication and authoritative profiles | 4 | Agent cannot mutate sender/payout fields |
| 4 | Draft, publish, idempotency, numbering, and void use cases | 4 | No PDF work until transitions pass |
| 5 | Frozen PDF, QR, storage, and protected routes | 4 | One restrained template only |
| 6 | Settlement contract and local adversarial tests | 5 | Arc payment remains blocked until Foundry suite passes |
| 7 | Privy signer spike and Arc deployment | 5 | Fall back and drop Privy prize immediately on failed allow/deny gate |
| 8 | Client payment page and transaction submission | 4 | Desktop injected and Coinbase Wallet mobile flows must share the same reviewed transaction |
| 9 | Reconciliation, receipt PDF, and Resend outbox | 5 | No Paid state or email without verified event |
| 10 | Remote MCP, portable skill, and Gmail enhancement | 3 | Bypass Gmail/search if either destabilizes the three-minute path |
| 11 | Production deployment, end-to-end proof, and demo hardening | 3 | Bazantic only if every core criterion is already green |
|  | **Total** | **44** |  |

## File Map

### Root and application shell

- `.env.example` — names and descriptions of required configuration; never real values.
- `.gitignore` — secrets, generated output, Supabase state, Foundry output, Playwright artifacts, and local PDFs.
- `.nvmrc` — Node 22 runtime.
- `package.json`, `pnpm-lock.yaml` — exact JavaScript dependency graph and canonical scripts.
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts` — build and test configuration.
- `.github/workflows/ci.yml` — lockfile install, unit tests, typecheck, build, and Foundry tests after Task 6.
- `src/app/**` — dashboard, invoice/payment, receipt, API, MCP, and job routes.

### Product domain

- `src/lib/domain/invoice.ts` — invoice states, canonical data, profile provenance, and public result types.
- `src/lib/domain/money.ts` — strict USDC decimal parsing and 18-decimal atomic conversion.
- `src/lib/domain/commitment.ts` — canonical JSON, PDF hash, and document commitment.
- `src/lib/domain/payment-authorization.ts` — one EIP-712 domain/type definition shared by signer, API, and client.
- `src/lib/domain/*.test.ts` — deterministic unit contracts.

### Persistence

- `supabase/config.toml` — local Supabase configuration generated by the CLI.
- `supabase/migrations/202609040001_payr_core.sql` — private tables, constraints, indexes, state functions, and storage bucket policy.
- `src/lib/db/admin.ts` — server-only Supabase service-role client.
- `src/lib/db/repositories.ts` — workspace-scoped repositories and publication transaction functions.
- `src/lib/db/repositories.integration.test.ts` — local PostgreSQL/Supabase behavior.

### Authentication and profiles

- `src/lib/auth/message.ts` — deterministic login and payout-change messages.
- `src/lib/auth/session.ts` — encrypted, HTTP-only session cookie.
- `src/app/api/auth/nonce/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/api/auth/logout/route.ts` — wallet login lifecycle.
- `src/app/(dashboard)/settings/page.tsx`, `src/app/(dashboard)/clients/page.tsx` — minimal authoritative profile UI.
- `src/app/api/profile/route.ts`, `src/app/api/clients/route.ts` — authenticated profile operations.

### Invoice workflow and documents

- `src/lib/invoices/schemas.ts` — Zod request/response contracts.
- `src/lib/invoices/service.ts` — draft, publish, status, and void use cases.
- `src/lib/documents/invoice-pdf.tsx`, `src/lib/documents/receipt-pdf.tsx` — one restrained PDF layout each.
- `src/lib/documents/render.ts` — QR generation, PDF bytes, hashes, and private storage.
- `src/app/invoice/[slug]/page.tsx` — bearer-link invoice/payment page.
- `src/app/invoice/[slug]/pdf/route.ts` — protected exact PDF bytes.
- `src/app/receipt/[slug]/page.tsx`, `src/app/receipt/[slug]/pdf/route.ts` — receipt surfaces.
- `src/app/api/invoices/**` — authenticated canonical HTTP API.

### Chain, signer, and reconciliation

- `contracts/src/PayrSettlement.sol` — exact native-USDC settlement contract.
- `contracts/test/PayrSettlement.t.sol` — local happy-path and adversarial tests.
- `contracts/script/DeployPayr.s.sol` — deterministic Arc deployment script.
- `contracts/deployments/arc-testnet.json` — verified chain, contract, attestor, block, and transaction metadata.
- `src/lib/chain/arc.ts` — chain definition loaded from verified configuration.
- `src/lib/chain/abi.ts` — generated/minimal typed ABI.
- `src/lib/chain/signer.ts` — `PaymentSigner` interface, local fallback, and Privy implementation.
- `src/lib/chain/reconcile.ts` — receipt/log verification and settlement insertion.
- `src/app/api/invoice/[slug]/authorize/route.ts` — short-lived signed payment payload.
- `src/app/api/reconcile/transaction/route.ts`, `src/app/api/jobs/reconcile/route.ts` — immediate and backfill reconciliation.

### Agent and email integration

- `src/lib/email/receipt.ts` — receipt-email rendering and Resend adapter.
- `src/lib/email/outbox.ts` — durable, idempotent dispatch.
- `src/lib/mcp/server.ts`, `src/app/api/mcp/[token]/route.ts` — bounded Streamable HTTP tools.
- `skills/payr-create-invoice/SKILL.md` — portable `payr:create-invoice` workflow and safety rules.
- `docs/ops/claude-gmail-demo.md` — connector setup, Gmail approval path, and fallback.
- `docs/ops/demo-runbook.md` — timed live path and real-transaction fallback.

---

### Task 1: Operational Preflight and Runnable Application Shell

**Hours:** 3

**Files:**
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/api/health/route.ts`
- Create: `src/config/env.ts`
- Create: `src/config/env.test.ts`
- Create: `scripts/verify-arc.mjs`
- Create: `.github/workflows/ci.yml`
- Create: `tests/e2e/smoke.spec.ts`
- Create: `README.md` with the product sentence, local commands, and explicit testnet status

**Interfaces:**
- Consumes: verified GitHub `origin`, Node 22, pnpm 10, current official Arc RPC/chain values, and user-entered secrets in local/Vercel environments.
- Produces: `env: ServerEnv`, `GET /api/health -> { status: "ok" }`, canonical `pnpm` scripts, and a runnable Next.js shell.

- [ ] **Step 1: Confirm external prerequisites without exposing values**

Run:

```bash
gh auth status
git remote get-url origin
git status --short --branch
node --version
pnpm --version
forge --version
supabase --version
```

Record only presence/readiness in `README.md`: Arc RPC, funded payer/payee wallets, Supabase, Privy, Resend, Claude custom connectors, Gmail connector, Vercel project, and the authenticated ETHGlobal deadline. Never paste tokens, private keys, connector URLs, or wallet keystores into Markdown.

- [ ] **Step 2: Create the package and configuration surface**

Run:

```bash
pnpm init
pnpm add next@16.3.4 react@19.2.8 react-dom@19.2.8 zod@4.5.4
pnpm add -D typescript eslint eslint-config-next vitest@5.0.0 @vitejs/plugin-react jsdom @testing-library/react @playwright/test@1.62.1 tsx supabase
```

Set these scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:start": "supabase start",
    "db:reset": "supabase db reset",
    "db:lint": "supabase db lint",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build",
    "verify:arc": "node scripts/verify-arc.mjs"
  }
}
```

Create `.env.example` with names and non-secret intent only:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ARC_CHAIN_ID=
NEXT_PUBLIC_ARC_RPC_URL=
NEXT_PUBLIC_ARC_EXPLORER_URL=
NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS=
ARC_RPC_URL=
ARC_CHAIN_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_ENCRYPTION_KEY=
NONCE_HASH_PEPPER=
LINK_TOKEN_PEPPER=
CONNECTOR_TOKEN_PEPPER=
CRON_SECRET=
PAYR_SIGNER_MODE=privy
ALLOW_TESTNET_LOCAL_SIGNER=false
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_WALLET_ID=
PRIVY_AUTHORIZATION_PRIVATE_KEY=
TESTNET_ATTESTOR_PRIVATE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

`src/config/env.ts` must expose separate public/server schemas. Server parsing happens inside server-only factories, not at import time, so CI can build without production secrets.

- [ ] **Step 3: Write the failing environment test**

```ts
import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";

describe("parsePublicEnv", () => {
  it("rejects a non-HTTPS production app URL", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://payrlink.xyz" })).toThrow();
  });

  it("accepts the local development URL", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }).NEXT_PUBLIC_APP_URL)
      .toBe("http://localhost:3000");
  });
});
```

Run: `pnpm vitest run src/config/env.test.ts`

Expected: FAIL because `parsePublicEnv` does not exist.

- [ ] **Step 4: Implement typed configuration and health route**

```ts
import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().refine(
    (value) => value.startsWith("https://") || value.startsWith("http://localhost:"),
    "production app URL must use HTTPS",
  ),
});

export const parsePublicEnv = (value: unknown) => publicEnvSchema.parse(value);
```

`GET /api/health` must return status, commit SHA when available, and no configuration values:

```ts
export async function GET() {
  return Response.json({ status: "ok", commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
}
```

- [ ] **Step 5: Add a read-only Arc verification script**

```js
const rpc = process.env.ARC_RPC_URL;
const expected = process.env.ARC_CHAIN_ID;
if (!rpc || !expected) throw new Error("ARC_RPC_URL and ARC_CHAIN_ID are required");
const response = await fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
});
const body = await response.json();
if (body.result !== `0x${BigInt(expected).toString(16)}`) {
  throw new Error(`Arc chain mismatch: expected ${expected}, received ${body.result}`);
}
console.log(`Arc RPC verified for chain ${expected}`);
```

Run: `pnpm verify:arc`

Expected: PASS only after current official Arc values are entered locally. If it fails, stop all chain-dependent work and resolve Arc access first.

- [ ] **Step 6: Add minimal CI and verify the shell**

Create the initial workflow; Task 6 adds Foundry:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.19.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

CI must not receive production secrets; build-time code must not require runtime secrets. Add the browser smoke:

```ts
import { expect, test } from "@playwright/test";

test("renders the Payr product sentence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Invoice. Settle. Reconcile." })).toBeVisible();
});
```

Run:

```bash
pnpm verify
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: lint/typecheck/tests/build pass and the smoke browser test renders the Payr product sentence.

- [ ] **Step 7: Commit, push, and verify the remote SHA**

```bash
git add .nvmrc .gitignore .env.example package.json pnpm-lock.yaml next.config.ts tsconfig.json postcss.config.mjs vitest.config.ts playwright.config.ts src scripts tests/e2e/smoke.spec.ts .github/workflows/ci.yml README.md
git diff --cached --check
git commit -m "chore: scaffold Payr application"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

Do not stage `assets/` without the explicit brand-ownership confirmation.

---

### Task 2: Domain Model and Database Contract

**Hours:** 4

**Files:**
- Create: `src/lib/domain/invoice.ts`
- Create: `src/lib/domain/money.ts`
- Create: `src/lib/domain/money.test.ts`
- Create: `src/lib/domain/canonical-json.ts`
- Create: `src/lib/domain/canonical-json.test.ts`
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202609040001_payr_core.sql`
- Create: `src/lib/db/admin.ts`
- Create: `src/lib/db/repositories.ts`
- Create: `src/lib/db/repositories.integration.test.ts`

**Interfaces:**
- Consumes: `ServerEnv` and local Supabase.
- Produces: `InvoiceState`, `CanonicalInvoice`, `parseUsdc`, `toNativeUsdcAtomic`, `canonicalJson`, `PayrRepositories`, and constrained PostgreSQL records/functions.

- [ ] **Step 1: Write money and canonicalization failures first**

```ts
import { describe, expect, it } from "vitest";
import { parseUsdc, toNativeUsdcAtomic } from "./money";

it("converts exact USDC decimals to Arc native atomic units", () => {
  expect(toNativeUsdcAtomic(parseUsdc("1000"))).toBe(1_000n * 10n ** 18n);
});

it.each(["", "-1", "+1", "1e3", "1,000", "0", "0.0000000000000000001"])(
  "rejects invalid amount %s",
  (value) => expect(() => parseUsdc(value)).toThrow(),
);
```

Run: `pnpm vitest run src/lib/domain/money.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement strict money and core types**

```ts
export type UsdcAmount = string & { readonly __brand: "UsdcAmount" };

export function parseUsdc(value: string): UsdcAmount {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value) || BigInt(value.replace(".", "")) === 0n) {
    throw new Error("amount must be a positive base-10 USDC value with at most 18 decimals");
  }
  return value as UsdcAmount;
}

export function toNativeUsdcAtomic(value: UsdcAmount): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}
```

Define exact states:

```ts
export type InvoiceState = "draft" | "published" | "paid" | "voided" | "expired";
export type FieldProvenance =
  | { kind: "saved_profile" }
  | { kind: "user_provided" }
  | { kind: "web_source"; url: string };
```

- [ ] **Step 3: Write deterministic canonical JSON tests**

```ts
it("canonicalizes object keys and preserves line-item order", () => {
  const a = canonicalJson({ total: "1000", items: [{ description: "Frontend", amount: "1000" }] });
  const b = canonicalJson({ items: [{ amount: "1000", description: "Frontend" }], total: "1000" });
  expect(a).toBe(b);
});
```

Run: `pnpm vitest run src/lib/domain/canonical-json.test.ts`

Expected: FAIL before implementation. Make it pass with this recursive serializer, which sorts object keys and preserves array order:

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}
```

- [ ] **Step 4: Create the private database schema**

The migration creates every later-task record explicitly:

```sql
create extension if not exists pgcrypto;
create type invoice_state as enum ('draft', 'published', 'paid', 'voided', 'expired');
create type publication_state as enum ('reserved', 'completed', 'failed');
create type email_state as enum ('pending', 'sending', 'sent', 'failed');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null unique check (owner_wallet ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz not null default now()
);

create table auth_nonces (
  nonce_hash bytea primary key,
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  purpose text not null check (purpose in ('login', 'payout_change')),
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table sender_profiles (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  legal_name text not null,
  address_lines jsonb not null check (jsonb_typeof(address_lines) = 'array'),
  email text not null,
  payout_wallet text not null check (payout_wallet ~ '^0x[0-9a-f]{40}$'),
  invoice_prefix text not null check (invoice_prefix ~ '^[A-Z0-9-]{2,12}$'),
  default_terms_days integer not null check (default_terms_days between 0 and 365),
  updated_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  alias text not null,
  legal_name text not null,
  billing_address jsonb not null,
  billing_email text not null,
  field_provenance jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, alias)
);

create table invoice_sequences (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  prefix text not null,
  sequence_year integer not null,
  next_value bigint not null default 1 check (next_value > 0),
  primary key (workspace_id, prefix, sequence_year)
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid not null references clients(id),
  state invoice_state not null default 'draft',
  current_version integer not null default 1 check (current_version > 0),
  invoice_number text,
  invoice_key bytea unique check (invoice_key is null or octet_length(invoice_key) = 32),
  currency text not null default 'USDC' check (currency = 'USDC'),
  total_decimal text not null check (total_decimal ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'),
  total_atomic numeric(78,0) not null check (total_atomic > 0),
  issue_date date not null,
  due_date date not null check (due_date >= issue_date),
  payable_until timestamptz not null,
  published_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state = 'draft' and invoice_number is null and invoice_key is null and published_at is null)
    or
    (state <> 'draft' and invoice_number is not null and invoice_key is not null and published_at is not null)
  )
);

create unique index invoices_workspace_number_unique
  on invoices(workspace_id, invoice_number) where invoice_number is not null;

create table invoice_versions (
  invoice_id uuid not null references invoices(id) on delete cascade,
  version integer not null check (version > 0),
  canonical_json_text text not null,
  sender_snapshot jsonb not null,
  client_snapshot jsonb not null,
  line_items jsonb not null check (jsonb_typeof(line_items) = 'array'),
  applied_defaults jsonb not null default '[]'::jsonb,
  approved_client_diff jsonb not null default '{}'::jsonb,
  publication_salt bytea check (publication_salt is null or octet_length(publication_salt) = 32),
  invoice_data_hash bytea check (invoice_data_hash is null or octet_length(invoice_data_hash) = 32),
  pdf_content_hash bytea check (pdf_content_hash is null or octet_length(pdf_content_hash) = 32),
  document_commitment bytea check (document_commitment is null or octet_length(document_commitment) = 32),
  pdf_storage_key text,
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (invoice_id, version)
);

create table publication_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  draft_version integer not null,
  idempotency_key uuid not null,
  state publication_state not null default 'reserved',
  sequence_value bigint not null,
  invoice_number text not null,
  invoice_key bytea not null check (octet_length(invoice_key) = 32),
  publication_salt bytea not null check (octet_length(publication_salt) = 32),
  slug_token_hash bytea not null unique,
  result jsonb,
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, idempotency_key)
);

create table payment_links (
  token_hash bytea primary key,
  invoice_id uuid not null unique references invoices(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table connector_tokens (
  token_hash bytea primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table idempotency_keys (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  operation text not null,
  key uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, operation, key)
);

create table payment_authorizations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  attestor text not null check (attestor ~ '^0x[0-9a-f]{40}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > issued_at),
  signature_hash bytea not null check (octet_length(signature_hash) = 32),
  signer_mode text not null check (signer_mode in ('privy', 'local-testnet')),
  policy_result text not null check (policy_result in ('allowed', 'fallback'))
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references invoices(id),
  chain_id bigint not null,
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  invoice_key bytea not null unique check (octet_length(invoice_key) = 32),
  document_commitment bytea not null check (octet_length(document_commitment) = 32),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  block_number bigint not null check (block_number >= 0),
  block_time timestamptz not null,
  payer text not null check (payer ~ '^0x[0-9a-f]{40}$'),
  payee text not null check (payee ~ '^0x[0-9a-f]{40}$'),
  amount_atomic numeric(78,0) not null check (amount_atomic > 0),
  created_at timestamptz not null default now(),
  unique (chain_id, transaction_hash, log_index)
);

create table receipt_documents (
  settlement_id uuid primary key references settlements(id) on delete cascade,
  token_hash bytea not null unique,
  pdf_storage_key text not null,
  pdf_content_hash bytea not null check (octet_length(pdf_content_hash) = 32),
  created_at timestamptz not null default now()
);

create table email_deliveries (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  message_kind text not null check (message_kind = 'receipt'),
  recipient text not null,
  provider_idempotency_key uuid not null unique,
  provider_message_id text,
  state email_state not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (settlement_id, message_kind, recipient)
);

create table reconciliation_cursors (
  chain_id bigint not null,
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  next_block bigint not null check (next_block >= 0),
  updated_at timestamptz not null default now(),
  primary key (chain_id, contract_address)
);
```

Create `reserve_publication(workspace_id, invoice_id, draft_version, idempotency_key, prefix, sequence_year, invoice_key, publication_salt, slug_token_hash)` as a `security definer` PostgreSQL function with `set search_path = ''` and every table/function name qualified with `public.`. It must lock the invoice row, return an existing `publication_attempts` result for the same workspace/idempotency key, reject non-draft or stale versions, upsert `invoice_sequences` with `next_value = next_value + 1 returning next_value - 1`, format `<PREFIX>-<YEAR>-<six-digit-value>`, insert the random invoice key/salt/token hash supplied by the server, and never decrement the sequence. Create `finalize_publication(attempt_id, artifact_json)` to lock the attempt and invoice, apply the approved client diff, freeze the exact canonical JSON text plus hashes/storage key, create `payment_links`, set invoice state/number/key/published time, and mark the attempt completed in one transaction. A failed attempt remains immutable; a new idempotency key may reserve a new number for the same draft version. Random bytes remain application-generated so tests can inject deterministic values.

Enable RLS on every private table and create no permissive `anon` or `authenticated` policies. Only `src/lib/db/admin.ts` may instantiate the server-only service-role client, and every repository method requires `workspaceId` even though that role bypasses RLS.

- [ ] **Step 5: Add repository integration tests**

```ts
it("allocates different sequential invoice numbers under concurrency", async () => {
  const results = await Promise.all([
    repos.reservePublication(workspaceId, draftA, "00000000-0000-4000-8000-000000000001"),
    repos.reservePublication(workspaceId, draftB, "00000000-0000-4000-8000-000000000002"),
  ]);
  expect(new Set(results.map((x) => x.invoiceNumber)).size).toBe(2);
});

it("deduplicates one settlement event", async () => {
  const first = await repos.insertVerifiedSettlement(event);
  const second = await repos.insertVerifiedSettlement(event);
  expect(second.id).toBe(first.id);
});
```

Run:

```bash
pnpm db:start
pnpm db:reset
pnpm vitest run src/lib/db/repositories.integration.test.ts
```

Expected: concurrent numbering and settlement idempotency pass against local PostgreSQL.

- [ ] **Step 6: Verify, commit, push**

```bash
pnpm test
pnpm typecheck
pnpm db:lint
git add src/lib/domain src/lib/db supabase package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "feat: add invoice domain and persistence"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 3: Wallet Authentication and Authoritative Profiles

**Hours:** 4

**Files:**
- Create: `src/lib/auth/message.ts`
- Create: `src/lib/auth/message.test.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/app/api/auth/nonce/route.ts`
- Create: `src/app/api/auth/verify/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/profile/route.ts`
- Create: `src/app/api/clients/route.ts`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/app/(dashboard)/clients/page.tsx`
- Create: `src/components/wallet-login.tsx`
- Create: `src/components/profile-form.tsx`
- Create: `src/components/client-form.tsx`
- Test: `src/lib/auth/*.test.ts`
- Test: `src/app/api/profile/route.test.ts`

**Interfaces:**
- Consumes: `PayrRepositories`, viem signature verification, encrypted session cookie, and authenticated wallet address.
- Produces: `requireSession(): Promise<{ workspaceId: string; wallet: Address }>`, authoritative sender-profile API, and workspace-scoped client API.

- [ ] **Step 1: Install auth/wallet dependencies and write the message test**

Run:

```bash
pnpm add viem@2.56.3 wagmi@3.7.7 @tanstack/react-query jose
```

```ts
it("binds login to domain, URI, wallet, nonce, chain, and expiry", () => {
  const message = buildLoginMessage(input);
  expect(message).toContain("payrlink.xyz");
  expect(message).toContain(input.wallet);
  expect(message).toContain(input.nonce);
  expect(message).toContain(`Chain ID: ${input.chainId}`);
});
```

Run: `pnpm vitest run src/lib/auth/message.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 2: Implement nonce, signature verification, and session rotation**

Use 32 random bytes for each single-use nonce. Store only its hash and expiry. Verify with viem and delete the nonce in the same transaction that creates/loads the workspace.

```ts
const valid = await verifyMessage({ address, message, signature });
if (!valid) return Response.json({ code: "INVALID_SIGNATURE" }, { status: 401 });
```

Session requirements:

```ts
export type PayrSession = {
  workspaceId: string;
  wallet: `0x${string}`;
  issuedAt: number;
  expiresAt: number;
};
```

Use an encrypted `__Host-payr-session` cookie with `httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/"`, and no `domain` attribute. Rotate after login and expire on logout.

- [ ] **Step 3: Write authorization tests before profile handlers**

```ts
it("rejects a profile write without a session", async () => {
  const response = await PUT(requestWithoutCookie());
  expect(response.status).toBe(401);
});

it("rejects changing payout wallet without a fresh wallet signature", async () => {
  const response = await PUT(requestWithSession({ payoutWallet: otherWallet }));
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ code: "PAYOUT_SIGNATURE_REQUIRED" });
});
```

Run: `pnpm vitest run src/app/api/profile/route.test.ts`

Expected: FAIL before routes exist.

- [ ] **Step 4: Implement minimal profile and client screens**

The sender form requires legal/display name, postal address lines, email, payout wallet, invoice prefix, and default payment terms. A payout-wallet change requires signing a deterministic message containing old wallet, new wallet, workspace ID, nonce, and expiry.

Client changes include a visible provenance selector in API data, but dashboard-entered fields are always stored as:

```ts
const provenance = { kind: "user_provided", confirmedAt: new Date().toISOString() };
```

Do not put Supabase credentials or direct client-table access in browser code.

- [ ] **Step 5: Verify the authorization boundary**

Run:

```bash
pnpm vitest run src/lib/auth src/app/api/profile/route.test.ts
pnpm typecheck
pnpm build
```

Manual proof:
1. Login with the service-provider test wallet.
2. Save the sender and Circle client profiles.
3. Attempt a payout change without signing and observe rejection.
4. Sign the change and verify the exact new address was persisted.

- [ ] **Step 6: Commit, push, verify**

```bash
git add src/lib/auth src/app/api/auth src/app/api/profile src/app/api/clients 'src/app/(dashboard)' src/components package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "feat: add wallet-authenticated billing profiles"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 4: Invoice Draft, Publication, Idempotency, and Voiding

**Hours:** 4

**Files:**
- Create: `src/lib/invoices/schemas.ts`
- Create: `src/lib/invoices/errors.ts`
- Create: `src/lib/invoices/service.ts`
- Create: `src/lib/invoices/service.test.ts`
- Create: `src/lib/invoices/publication-port.ts`
- Create: `src/app/api/invoices/drafts/route.ts`
- Create: `src/app/api/invoices/[id]/publish/route.ts`
- Create: `src/app/api/invoices/[id]/route.ts`
- Create: `src/app/api/invoices/[id]/void/route.ts`

**Interfaces:**
- Consumes: `PayrRepositories`, `requireSession`, `PublicationPort`, canonical invoice types, and exact USDC parsing.
- Produces: `createInvoiceDraft`, `publishInvoice`, `getInvoiceStatus`, `voidInvoice`, stable error codes, and authenticated canonical HTTP routes.

- [ ] **Step 1: Define exact request schemas**

```ts
const usdcStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/).refine((value) => BigInt(value.replace(".", "")) > 0n);

export const fieldProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("saved_profile") }),
  z.object({ kind: z.literal("user_provided") }),
  z.object({ kind: z.literal("web_source"), url: z.string().url() }),
]);

const confirmedField = z.object({
  value: z.string().min(1),
  confirmed: z.literal(true),
  provenance: fieldProvenanceSchema,
});

const proposedClientSchema = z.object({
  alias: z.string().min(1).max(100),
  legalName: confirmedField,
  billingAddress: z.array(confirmedField).min(1).max(6),
  billingEmail: confirmedField.refine(
    (field) => field.provenance.kind === "user_provided",
    "email must be directly confirmed, not inferred from the web",
  ),
});

export const createDraftSchema = z.object({
  client: z.union([
    z.object({ id: z.string().uuid() }),
    z.object({ alias: z.string().min(1), proposed: proposedClientSchema.optional() }),
  ]),
  items: z.array(z.object({ description: z.string().min(1).max(500), amount: usdcStringSchema })).min(1).max(20),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  useDefaultTerms: z.boolean().default(true),
  memo: z.string().max(2000).optional(),
  idempotencyKey: z.string().uuid(),
});

export const publishInvoiceSchema = z.object({
  draftId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  approved: z.literal(true),
  idempotencyKey: z.string().uuid(),
});

export const voidInvoiceSchema = z.object({
  expectedVersion: z.number().int().positive(),
  approved: z.literal(true),
  idempotencyKey: z.string().uuid(),
});
```

- [ ] **Step 2: Write missing-field, provenance, and default-term tests**

```ts
it("returns missing fields without creating a draft", async () => {
  await expect(service.createDraft(inputWithoutClientAddress)).rejects.toMatchObject({
    code: "MISSING_FIELDS",
    fields: ["client.billingAddress"],
  });
  expect(repos.createdDrafts).toHaveLength(0);
});

it("applies and reports saved default terms", async () => {
  const result = await service.createDraft({ ...validInput, dueDate: undefined, useDefaultTerms: true });
  expect(result.appliedDefaults).toEqual([{ field: "dueDate", source: "sender.defaultTermsDays" }]);
});

it("rejects a web-sourced field without its URL", async () => {
  await expect(service.createDraft(inputWithInvalidWebProvenance)).rejects.toMatchObject({ code: "INVALID_PROVENANCE" });
});
```

Run: `pnpm vitest run src/lib/invoices/service.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 3: Implement a transactional use-case layer**

```ts
export type PublicationInput = {
  workspaceId: string;
  invoiceId: string;
  version: number;
  invoiceNumber: string;
  invoiceKey: `0x${string}`;
  publicationSalt: `0x${string}`;
  bearerSlug: string;
  canonicalInvoice: CanonicalInvoice;
};

export type PublishedArtifact = {
  invoiceUrl: string;
  pdfUrl: string;
  pdfFilename: string;
  pdfStorageKey: string;
  pdfByteLength: number;
  invoiceDataHash: `0x${string}`;
  pdfContentHash: `0x${string}`;
  documentCommitment: `0x${string}`;
};

export interface PublicationPort {
  produce(input: PublicationInput): Promise<PublishedArtifact>;
}
```

Publication sequence:
1. Load exact draft version and reject stale/incomplete state.
2. Return the prior result for the same idempotency key.
3. Reserve the next invoice number, random `invoiceKey`, 32-byte salt, random bearer slug, and publication-attempt record.
4. Call `PublicationPort.produce` with immutable data and `https://payrlink.xyz/invoice/<slug>`.
5. Finalize `published` state, token hash, PDF metadata, and approved client-profile diff in one database transaction.
6. On production failure, mark the attempt failed, leave the invoice draft, never reuse the reserved number, and expose no payment link.

`voidInvoice` rejects draft, paid, voided, expired, and stale versions. It sets `voided`, revokes bearer access, and prevents new payment authorization; it does not claim to revoke an already-issued ten-minute signature.

- [ ] **Step 4: Implement stable HTTP responses**

Map domain errors to bounded responses:

```ts
const statusByCode = {
  UNAUTHORIZED: 401,
  CLIENT_NOT_FOUND: 404,
  MISSING_FIELDS: 422,
  INVALID_PROVENANCE: 422,
  STALE_VERSION: 409,
  NOT_PUBLISHABLE: 409,
  ALREADY_PAID: 409,
} as const;
```

No response returns complete sender/client records, bearer token hashes, connector hashes, salts, or provider credentials.

- [ ] **Step 5: Run the transition and retry gauntlet**

Run:

```bash
pnpm vitest run src/lib/invoices/service.test.ts src/app/api/invoices
pnpm typecheck
```

Required green cases: duplicate draft retry, duplicate publish retry, concurrent publication numbers, stale version, missing data, new confirmed client diff, sender/payout mutation rejection, void, paid-not-voidable, and failed document production.

- [ ] **Step 6: Commit, push, verify**

```bash
git add src/lib/invoices src/app/api/invoices
git diff --cached --check
git commit -m "feat: add immutable invoice lifecycle"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 5: Frozen PDF, QR, Storage, and Protected Routes

**Hours:** 4

**Files:**
- Create: `src/lib/documents/invoice-pdf.tsx`
- Create: `src/lib/documents/render.ts`
- Create: `src/lib/documents/render.test.tsx`
- Create: `src/lib/domain/commitment.ts`
- Create: `src/lib/domain/commitment.test.ts`
- Create: `src/app/invoice/[slug]/page.tsx`
- Create: `src/app/invoice/[slug]/pdf/route.ts`
- Create: `src/app/invoice/[slug]/not-found.tsx`
- Create: `tests/e2e/invoice-page.spec.ts`

**Interfaces:**
- Consumes: `PublicationPort`, canonical invoice JSON, reserved number/key/salt/slug, Supabase private storage, and `NEXT_PUBLIC_APP_URL`.
- Produces: `renderInvoiceDocument(input): Promise<GeneratedInvoiceDocument>`, exact stored PDF bytes, `pdfContentHash`, `documentCommitment`, protected invoice/PDF routes, and QR-to-link equivalence.

- [ ] **Step 1: Install document dependencies and write the failing hash test**

Run:

```bash
pnpm add @react-pdf/renderer@4.9.0 qrcode@1.5.4
pnpm add -D @types/qrcode pdf-lib jsqr pngjs @types/pngjs
```

```ts
it("binds salt, canonical invoice hash, and exact PDF hash", () => {
  const result = createDocumentCommitment({ salt, canonicalInvoiceJson, pdfBytes });
  expect(result.invoiceDataHash).toBe(keccak256(toBytes(canonicalInvoiceJson)));
  expect(result.pdfContentHash).toBe(keccak256(pdfBytes));
  expect(result.documentCommitment).toBe(
    keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32"), [salt, result.invoiceDataHash, result.pdfContentHash])),
  );
});
```

Run: `pnpm vitest run src/lib/domain/commitment.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 2: Implement one restrained invoice PDF**

The PDF contains:
- Payr mark and `INVOICE` label.
- Immutable invoice number, issue date, due date, and `USDC on Arc`.
- Issuer and bill-to blocks.
- Line-item table and exact total.
- Payout wallet in shortened visual form plus full copyable text.
- Protected payment URL and QR image.
- Generic-invoice disclaimer; no tax-compliance statement and no signature control.

Render on the server:

```ts
const qrDataUrl = await QRCode.toDataURL(input.invoiceUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 });
const pdfBytes = new Uint8Array(await renderToBuffer(<InvoicePdf invoice={input.invoice} qrDataUrl={qrDataUrl} />));
if (new TextDecoder("latin1").decode(pdfBytes.slice(0, 5)) !== "%PDF-") throw new Error("invalid PDF output");
return { pdfBytes, qrDataUrl, pdfFilename: `${input.invoiceNumber}.pdf` };
```

- [ ] **Step 3: Implement private storage and bearer-token lookup**

Use a private `documents` bucket. Store by non-secret internal keys such as `workspace/<workspaceId>/invoice/<invoiceId>/<version>.pdf`; never use the bearer slug as a storage key. Hash the slug with an application pepper before lookup:

```ts
const tokenHash = createHmac("sha256", env.LINK_TOKEN_PEPPER).update(slug).digest("hex");
```

Both HTML and PDF handlers return:

```ts
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};
```

A revoked/unknown token returns the same 404 response. A voided token may show only invoice number and `Voided`, with no names, address, line items, amount, or PDF.

- [ ] **Step 4: Verify PDF, commitment, and QR behavior**

```ts
it("renders a parseable one-page invoice and exact QR URL", async () => {
  const document = await renderInvoiceDocument(publicationInput);
  const pdf = await PDFDocument.load(document.pdfBytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(await decodeDataUrlQr(document.qrDataUrl)).toBe(publicationInput.invoiceUrl);
});
```

Run:

```bash
pnpm vitest run src/lib/documents src/lib/domain/commitment.test.ts
pnpm test:e2e --grep "protected invoice"
```

Also rasterize a generated PDF and inspect it at 100% for clipping, overlap, unreadable addresses, broken QR, or accidental secret content. Repeat at a mobile page width for the HTML invoice.

- [ ] **Step 5: Exercise revocation and cache controls**

Required browser/API cases:
- valid slug displays the frozen invoice and exact PDF;
- random slug returns indistinguishable 404;
- voided slug exposes no private details and PDF is unavailable;
- responses contain `no-store`, `noindex`, and `no-referrer` headers;
- application logs contain no raw slug.

- [ ] **Step 6: Commit, push, verify**

```bash
git add src/lib/documents src/lib/domain/commitment.ts src/lib/domain/commitment.test.ts src/app/invoice tests/e2e/invoice-page.spec.ts package.json pnpm-lock.yaml supabase
git diff --cached --check
git commit -m "feat: publish protected invoice PDFs"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 6: Settlement Contract and Local Adversarial Tests

**Hours:** 5

**Files:**
- Create: `contracts/foundry.toml`
- Create: `contracts/remappings.txt`
- Create: `contracts/src/PayrSettlement.sol`
- Create: `contracts/test/PayrSettlement.t.sol`
- Create: `contracts/script/DeployPayr.s.sol`
- Create: `scripts/export-contract-abi.mjs`
- Create: `src/lib/chain/abi.ts`
- Create: `src/lib/chain/abi.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: immutable EOA attestor address and EIP-712 `InvoicePayment` fields.
- Produces: `payInvoice(bytes32,bytes32,address,uint256,uint64,bytes)`, `paid(bytes32)`, and `InvoicePaid` event.

- [ ] **Step 1: Initialize Foundry without a nested Git repository**

Run:

```bash
forge init contracts --force --no-git
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
```

Pin the OpenZeppelin revision in `contracts/foundry.toml`/dependency metadata and exclude `contracts/out`, `contracts/cache`, and broadcast secrets from Git.

- [ ] **Step 2: Write failing happy-path and adversarial tests**

```solidity
function testPayInvoiceForwardsExactValueAndEmits() public {
    vm.deal(payer, AMOUNT);
    bytes memory sig = signAuthorization(INVOICE_KEY, COMMITMENT, payee, AMOUNT, VALID_UNTIL);
    vm.expectEmit(true, true, true, true);
    emit InvoicePaid(INVOICE_KEY, COMMITMENT, payer, payee, AMOUNT);
    vm.prank(payer);
    settlement.payInvoice{value: AMOUNT}(INVOICE_KEY, COMMITMENT, payable(payee), AMOUNT, VALID_UNTIL, sig);
    assertEq(payee.balance, AMOUNT);
    assertEq(address(settlement).balance, 0);
    assertTrue(settlement.paid(INVOICE_KEY));
}
```

Add tests for zero payee, zero amount, wrong `msg.value`, wrong amount/payee/commitment, wrong signer, wrong EIP-712 domain/chain/contract, expired authorization, replay, forwarding failure, and reentrancy.

Run: `cd contracts && forge test -vvv`

Expected: compile/test failure before the contract exists.

- [ ] **Step 3: Implement the minimal immutable-attestor contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PayrSettlement is EIP712, ReentrancyGuard {
    bytes32 private constant PAYMENT_TYPEHASH = keccak256(
        "InvoicePayment(bytes32 invoiceKey,bytes32 documentCommitment,address payee,uint256 amount,uint64 validUntil)"
    );

    address public immutable attestor;
    mapping(bytes32 invoiceKey => bool isPaid) public paid;

    error InvalidAttestor();
    error InvalidPayee();
    error InvalidAmount();
    error IncorrectValue(uint256 expected, uint256 actual);
    error AuthorizationExpired(uint64 validUntil);
    error InvoiceAlreadyPaid(bytes32 invoiceKey);
    error InvalidSignature(address recovered);
    error TransferFailed();

    event InvoicePaid(
        bytes32 indexed invoiceKey,
        bytes32 indexed documentCommitment,
        address indexed payer,
        address payee,
        uint256 amount
    );

    constructor(address attestor_) EIP712("Payr", "1") {
        if (attestor_ == address(0)) revert InvalidAttestor();
        attestor = attestor_;
    }

    function payInvoice(
        bytes32 invoiceKey,
        bytes32 documentCommitment,
        address payable payee,
        uint256 amount,
        uint64 validUntil,
        bytes calldata signature
    ) external payable nonReentrant {
        if (payee == address(0)) revert InvalidPayee();
        if (amount == 0) revert InvalidAmount();
        if (msg.value != amount) revert IncorrectValue(amount, msg.value);
        if (block.timestamp > validUntil) revert AuthorizationExpired(validUntil);
        if (paid[invoiceKey]) revert InvoiceAlreadyPaid(invoiceKey);

        bytes32 structHash = keccak256(
            abi.encode(PAYMENT_TYPEHASH, invoiceKey, documentCommitment, payee, amount, validUntil)
        );
        address recovered = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (recovered != attestor) revert InvalidSignature(recovered);

        paid[invoiceKey] = true;
        (bool sent,) = payee.call{value: amount}("");
        if (!sent) revert TransferFailed();

        emit InvoicePaid(invoiceKey, documentCommitment, msg.sender, payee, amount);
    }
}
```

The contract has no owner, upgrade path, withdrawal function, escrow balance, receive/fallback path, or token/NFT behavior.

- [ ] **Step 4: Prove the full local contract suite and ABI stability**

Run:

```bash
cd contracts
forge fmt --check
forge test -vvv
forge inspect PayrSettlement abi
```

Create `scripts/export-contract-abi.mjs` with an argv-based subprocess; never invoke a shell:

```js
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const output = execFileSync("forge", ["inspect", "PayrSettlement", "abi", "--json"], {
  cwd: "contracts",
  encoding: "utf8",
});
const abi = JSON.parse(output);
writeFileSync(
  "src/lib/chain/abi.ts",
  `export const payrSettlementAbi = ${JSON.stringify(abi, null, 2)} as const;\n`,
);
```

Assert the generated ABI exposes one `payInvoice` function with six inputs and the five-field `InvoicePaid` event.

- [ ] **Step 5: Add Foundry to CI**

CI installs the pinned Foundry toolchain, runs `forge fmt --check`, and runs `forge test`. It must run independently of environment secrets or Arc RPC.

- [ ] **Step 6: Commit, push, verify**

```bash
git add contracts scripts/export-contract-abi.mjs src/lib/chain/abi.ts src/lib/chain/abi.test.ts .github/workflows/ci.yml .gitignore
git diff --cached --check
git commit -m "feat: add invoice-bound settlement contract"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 7: Privy Signer Gate and Arc Testnet Deployment

**Hours:** 5

**Files:**
- Create: `src/lib/domain/payment-authorization.ts`
- Create: `src/lib/domain/payment-authorization.test.ts`
- Create: `src/lib/chain/signer.ts`
- Create: `src/lib/chain/signer.test.ts`
- Create: `scripts/privy-policy-spike.ts`
- Create: `scripts/verify-deployment.ts`
- Create: `contracts/deployments/arc-testnet.json`
- Create: `src/app/api/invoice/[slug]/authorize/route.ts`
- Test: `src/app/api/invoice/[slug]/authorize/route.test.ts`

**Interfaces:**
- Consumes: published payable invoice, verified Arc config, deployed contract, Privy credentials/policy/wallet or fallback key.
- Produces: `PaymentSigner`, exact EIP-712 typed data, short-lived authorization route, and verified Arc deployment metadata.

- [ ] **Step 1: Define the typed-data object once**

```ts
import type { Address, Hex } from "viem";

export type PaymentAuthorizationInput = {
  chainId: number;
  contract: Address;
  invoiceKey: Hex;
  documentCommitment: Hex;
  payee: Address;
  amount: bigint;
  validUntil: bigint;
};

export const invoicePaymentTypes = {
  InvoicePayment: [
    { name: "invoiceKey", type: "bytes32" },
    { name: "documentCommitment", type: "bytes32" },
    { name: "payee", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "validUntil", type: "uint64" },
  ],
} as const;

export function buildPaymentTypedData(input: PaymentAuthorizationInput) {
  return {
    domain: { name: "Payr", version: "1", chainId: input.chainId, verifyingContract: input.contract },
    types: invoicePaymentTypes,
    primaryType: "InvoicePayment" as const,
    message: {
      invoiceKey: input.invoiceKey,
      documentCommitment: input.documentCommitment,
      payee: input.payee,
      amount: input.amount,
      validUntil: input.validUntil,
    },
  };
}
```

Test that viem's recovered address equals the fallback account and that changing any field invalidates recovery.

- [ ] **Step 2: Implement the signer port and fallback**

```ts
export interface PaymentSigner {
  getAddress(): Promise<`0x${string}`>;
  sign(input: PaymentAuthorizationInput): Promise<`0x${string}`>;
}

export class LocalTestnetPaymentSigner implements PaymentSigner {
  constructor(private readonly account: PrivateKeyAccount) {}
  async getAddress() { return this.account.address; }
  async sign(input: PaymentAuthorizationInput) {
    return this.account.signTypedData(buildPaymentTypedData(input));
  }
}
```

The factory may construct `LocalTestnetPaymentSigner` only when `PAYR_SIGNER_MODE=local-testnet`, `ALLOW_TESTNET_LOCAL_SIGNER=true`, and the configured Arc chain is the verified testnet. The testnet private key stays in local/Vercel secret storage and is never logged. Production/mainnet configuration rejects this mode unconditionally.

- [ ] **Step 3: Run the Privy allow/deny spike before production integration**

Install: `pnpm add @privy-io/node@0.34.0`.

Use the confirmed SDK call:

```ts
const privy = new PrivyClient({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET });
const response = await privy.wallets().ethereum().signTypedData(env.PRIVY_WALLET_ID, {
  params: {
    typed_data: {
      domain: typedData.domain,
      message: typedData.message,
      primary_type: typedData.primaryType,
      types: typedData.types,
    },
  },
  authorization_context: {
    authorization_private_keys: [env.PRIVY_AUTHORIZATION_PRIVATE_KEY],
  },
});
```

In Privy, bind the server wallet to a reject-by-default policy whose EIP-712 types map exactly matches the request order. The spike must:
1. sign one valid Payr `InvoicePayment` request;
2. recover the configured Privy wallet address from the signature;
3. reject a request with an added type/field or different primary type;
4. reject non-Payr signing methods;
5. save redacted evidence containing request shape, policy ID, wallet address, success/denial status, and no credentials.

If any assertion fails within the Task 7 timebox, set `PAYR_SIGNER_MODE=local-testnet`, record the failed gate in `STATUS.md`, and remove Privy from sponsor claims. Do not loosen the policy to make the demo pass.

- [ ] **Step 4: Write authorization-route tests**

```ts
it("issues at most ten minutes for a published payable invoice", async () => {
  clock.set("2026-09-04T12:00:00Z");
  const result = await authorize(validPublishedInvoice);
  expect(result.validUntil).toBeLessThanOrEqual(clock.unix() + 600);
  expect(await recoverTypedDataAddress({ ...result.typedData, signature: result.signature })).toBe(attestor);
});

it.each(["voided", "expired", "paid", "draft"])("refuses %s invoices", async (state) => {
  await expect(authorize(invoice({ state }))).rejects.toMatchObject({ code: "NOT_PAYABLE" });
});
```

Run: `pnpm vitest run src/lib/chain src/app/api/invoice/[slug]/authorize/route.test.ts`.

- [ ] **Step 5: Deploy to Arc with the proven attestor**

Run the deployment with locally supplied secrets and verified Arc RPC. The deployment script asserts the chain ID and nonzero attestor before broadcast. After broadcast, `scripts/verify-deployment.ts` must read code, `attestor()`, EIP-712 behavior, and deployment receipt from Arc.

Write only public metadata by serializing values read back from the deployment receipt and contract:

```ts
type ArcDeploymentRecord = {
  chainId: number;
  rpcHost: string;
  explorerBaseUrl: string;
  contractAddress: `0x${string}`;
  attestorAddress: `0x${string}`;
  deploymentTransaction: `0x${string}`;
  deploymentBlock: string;
};

const record: ArcDeploymentRecord = {
  chainId: await publicClient.getChainId(),
  rpcHost: new URL(env.ARC_RPC_URL).host,
  explorerBaseUrl: env.NEXT_PUBLIC_ARC_EXPLORER_URL,
  contractAddress: receipt.contractAddress,
  attestorAddress: await publicClient.readContract({ address: receipt.contractAddress, abi, functionName: "attestor" }),
  deploymentTransaction: receipt.transactionHash,
  deploymentBlock: receipt.blockNumber.toString(),
};
await writeFile("contracts/deployments/arc-testnet.json", `${JSON.stringify(record, null, 2)}\n`);
```

The script rejects null contract addresses, mismatched chain/attestor values, secret-bearing RPC URLs, empty bytecode, and failed receipts. Never hand-type a plausible deployment value.

- [ ] **Step 6: Verify one low-value signed call path**

Before moving funds, call `eth_call`/contract simulation using a real signature and exact authorization. Then run one low-value real payment between the funded test wallets and verify contract balance remains zero and the payee balance increases by the exact native amount excluding its unrelated gas activity.

- [ ] **Step 7: Commit, push, verify**

```bash
git add src/lib/domain/payment-authorization.ts src/lib/domain/payment-authorization.test.ts src/lib/chain src/app/api/invoice scripts/privy-policy-spike.ts scripts/verify-deployment.ts contracts/deployments package.json pnpm-lock.yaml STATUS.md
git diff --cached --check
git commit -m "feat: authorize Arc invoice payments"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 8: Client Payment Page and Transaction Submission

**Hours:** 4

**Files:**
- Create: `src/components/providers.tsx`
- Create: `src/lib/chain/wagmi.ts`
- Create: `src/components/pay-button.tsx`
- Modify: `src/app/invoice/[slug]/page.tsx`
- Create: `src/app/api/invoice/[slug]/status/route.ts`
- Create: `tests/e2e/payment-page.spec.ts`
- Create: `src/components/pay-button.test.tsx`

**Interfaces:**
- Consumes: protected invoice view, `POST /api/invoice/[slug]/authorize`, wagmi wallet client, typed ABI, and exact contract args/value.
- Produces: explicit connect/network/review/pay states, one client-controlled transaction, and submitted/confirming/paid UI without frontend-created settlement state.

- [ ] **Step 1: Write the payment-state tests first**

```tsx
it("never requests a wallet write before authorization and explicit click", async () => {
  render(<PayButton invoice={publishedInvoice} />);
  expect(mockWriteContract).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Pay 1,000 USDC" }));
  expect(mockAuthorize).toHaveBeenCalledTimes(1);
  expect(mockWriteContract).toHaveBeenCalledTimes(1);
});

it("shows confirming instead of paid after submission", async () => {
  mockWriteContract.mockResolvedValue(txHash);
  render(<PayButton invoice={publishedInvoice} />);
  await user.click(screen.getByRole("button", { name: /Pay/ }));
  expect(await screen.findByText("Confirming on Arc"));
  expect(screen.queryByText("Paid")).toBeNull();
});
```

Run: `pnpm vitest run src/components/pay-button.test.tsx`

Expected: FAIL before implementation.

- [ ] **Step 2: Configure the single Arc chain and supported wallet clients**

Build the viem/wagmi chain only from verified environment/deployment metadata. Ship both injected desktop wallets and Coinbase Wallet's mobile/deep-link connector without introducing another project credential:

```ts
import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected(), coinbaseWallet({ appName: "Payr" })],
  transports: { [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]) },
});
```

The QR still contains only the protected invoice URL. On mobile, the page offers Coinbase Wallet connection/deep-linking; it does not encode transaction calldata or claim compatibility with every wallet.

- [ ] **Step 3: Implement causal payment states**

Required states:

```ts
type PaymentUiState =
  | "disconnected"
  | "wrong-network"
  | "ready"
  | "authorizing"
  | "wallet-prompt"
  | "submitted"
  | "confirming"
  | "paid"
  | "rejected"
  | "failed";
```

The review surface shows full payee wallet, exact amount, Arc, commercial due date, estimated gas reserve, and authorization expiry separately. Fetch the connected wallet balance and call `estimateContractGas` before enabling Pay; insufficient invoice value plus gas remains a preflight error. `writeContract` receives `value === authorization.amount` and the exact signed arguments. Reject expired authorizations client-side and server-side.

- [ ] **Step 4: Connect submission to server verification**

After wallet submission, POST only `{ transactionHash }` to `/api/reconcile/transaction`; the server ignores all client-supplied payment facts and reads the receipt/log from Arc. Poll the protected status route until the verified backend reports paid.

- [ ] **Step 5: Exercise failure states in browser tests**

Test disconnected wallet, rejected connect, wrong chain, rejected transaction, expired authorization, contract revert, dropped/delayed receipt, voided invoice, and successful verified transition. The test must assert that none of the failure states display Paid.

Run:

```bash
pnpm vitest run src/components/pay-button.test.tsx
pnpm test:e2e --grep "payment"
pnpm build
```

- [ ] **Step 6: Commit, push, verify**

```bash
git add src/components src/lib/chain/wagmi.ts src/app/invoice src/app/api/invoice tests/e2e/payment-page.spec.ts package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "feat: add client-controlled Arc payment"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 9: Reconciliation, Receipt PDF, and Resend Outbox

**Hours:** 5

**Files:**
- Create: `src/lib/chain/reconcile.ts`
- Create: `src/lib/chain/reconcile.test.ts`
- Create: `src/app/api/reconcile/transaction/route.ts`
- Create: `src/app/api/jobs/reconcile/route.ts`
- Create: `src/lib/documents/receipt-pdf.tsx`
- Create: `src/lib/email/receipt.ts`
- Create: `src/lib/email/outbox.ts`
- Create: `src/lib/email/outbox.test.ts`
- Create: `src/app/receipt/[slug]/page.tsx`
- Create: `src/app/receipt/[slug]/pdf/route.ts`
- Create: `tests/e2e/receipt.spec.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: Arc transaction hash or block cursor, configured chain/contract, `InvoicePaid` ABI, immutable invoice version/PDF hash, and Resend credentials.
- Produces: verified settlement row, paid transition, immutable receipt page/PDF, one logical email delivery per recipient, and backfill cursor.

- [ ] **Step 1: Write forged/deduplicated-event tests first**

```ts
it("rejects a transaction from the wrong chain or contract", async () => {
  await expect(reconcileTransaction(txHash, clients.wrongContract)).rejects.toMatchObject({ code: "INVALID_SETTLEMENT" });
});

it("inserts one settlement for repeated verification", async () => {
  const first = await reconcileTransaction(txHash, clients.arc);
  const second = await reconcileTransaction(txHash, clients.arc);
  expect(second.settlementId).toBe(first.settlementId);
  expect(emailRepo.logicalDeliveriesFor(first.settlementId)).toHaveLength(2);
});
```

Run: `pnpm vitest run src/lib/chain/reconcile.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 2: Implement complete event verification**

The reconciler must verify:
- receipt status is success;
- receipt chain comes from the configured Arc client;
- log address equals the deployed Payr contract;
- decoded event signature is `InvoicePaid`;
- invoice key, commitment, payee, and amount equal the frozen published invoice;
- payer equals the event payer;
- block timestamp is fetched from Arc;
- unique identity is `(chainId, transactionHash, logIndex)`;
- invoice key has no prior different settlement.

Only the repository transaction may insert settlement and transition `published -> paid`.

- [ ] **Step 3: Add immediate and backfill paths through the same function**

`POST /api/reconcile/transaction` validates only the transaction-hash shape before calling `reconcileTransaction`. `GET /api/jobs/reconcile` requires a timing-safe `CRON_SECRET` comparison, reads logs from the last finalized cursor in bounded ranges, and calls the same event verifier. Update the cursor only after the full range succeeds.

Configure a Vercel cron only at an interval supported by the active account. If frequent cron is unavailable, keep the route and run it from the demo operator script; do not claim unattended indexing until a scheduled invocation is observed.

- [ ] **Step 4: Render receipt artifacts from verified state**

Receipt page/PDF includes invoice number, exact amount, payer/payee wallets, Arc, block time, transaction hash, explorer link, invoice PDF hash, and document commitment. It excludes the publication salt and connector credentials.

```ts
if (invoice.state !== "paid" || !invoice.settlement) {
  throw new Error("receipt requires verified settlement");
}
```

Generate a separate high-entropy receipt token, store only its keyed hash, and apply the same no-store/noindex/referrer protections.

- [ ] **Step 5: Implement a durable idempotent Resend outbox**

Create the two logical deliveries in the settlement transaction. Dispatch pending rows through one adapter:

```ts
export interface ReceiptMailer {
  send(input: {
    idempotencyKey: string;
    to: string;
    subject: string;
    html: string;
    pdf: { filename: string; bytes: Uint8Array };
  }): Promise<{ providerMessageId: string }>;
}
```

The service-provider and client rows have a unique database key. Retries reuse the same logical/provider idempotency key. A send failure never rolls back Paid state; it records failure and retry count without creating another logical row. An ambiguous provider timeout may repeat the HTTP request with the same key, so verification asserts one logical row and no second delivered message rather than claiming the transport was called exactly once.

- [ ] **Step 6: Verify real receipt delivery**

Using two confirmed test inboxes and a previously verified Arc settlement:
1. run reconciliation twice;
2. prove one logical delivery row exists per recipient;
3. prove both provider message IDs were recorded;
4. inspect each received message and PDF;
5. rerun dispatch and prove Payr keeps one logical row, reuses the same provider idempotency key, and produces no second delivered message.

Run:

```bash
pnpm vitest run src/lib/chain/reconcile.test.ts src/lib/email/outbox.test.ts
pnpm test:e2e --grep "receipt"
pnpm build
```

- [ ] **Step 7: Commit, push, verify**

```bash
git add src/lib/chain/reconcile.ts src/lib/chain/reconcile.test.ts src/app/api/reconcile src/app/api/jobs src/lib/documents/receipt-pdf.tsx src/lib/email src/app/receipt tests/e2e/receipt.spec.ts vercel.json package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "feat: reconcile payments and issue receipts"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 10: Remote MCP, Portable Skill, and Gmail Enhancement

**Hours:** 3

**Files:**
- Create: `src/lib/mcp/server.ts`
- Create: `src/lib/mcp/auth.ts`
- Create: `src/lib/mcp/server.test.ts`
- Create: `src/app/api/mcp/[token]/route.ts`
- Create: `skills/payr-create-invoice/SKILL.md`
- Create: `docs/ops/claude-gmail-demo.md`
- Modify: `src/lib/invoices/schemas.ts`

**Interfaces:**
- Consumes: canonical invoice use cases and a hashed per-workspace connector credential.
- Produces: Streamable HTTP MCP tools `create_invoice_draft`, `publish_invoice`, `get_invoice_status`, and `void_invoice`; portable `payr:create-invoice` instructions; Gmail-ready output.

- [ ] **Step 1: Install MCP SDK and write protocol tests**

Run: `pnpm add @modelcontextprotocol/sdk@1.30.0`.

```ts
it("discovers exactly the four bounded tools", async () => {
  const client = await connectTestMcpServer(server);
  const result = await client.listTools();
  expect(result.tools.map((tool) => tool.name).sort()).toEqual([
    "create_invoice_draft",
    "get_invoice_status",
    "publish_invoice",
    "void_invoice",
  ]);
});

it("does not expose sender or payout mutation", async () => {
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  expect(names.some((name) => /profile|wallet|payout/i.test(name))).toBe(false);
});
```

Run: `pnpm vitest run src/lib/mcp/server.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 2: Implement the four tools as thin adapters**

Each handler validates Zod input, resolves the workspace from the connector-token hash, calls the canonical service, and returns bounded JSON. Tool descriptions explicitly state:
- drafting may return missing fields and creates no draft in that case;
- web search happens in the host agent, never Payr;
- publication requires the service provider to review the exact preview first;
- email sending is a separate external action;
- status is verified only after Arc reconciliation.

Annotate the tools explicitly: draft `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }`; publish `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }`; status `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`; void `{ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }`. Do not treat annotations as cryptographic authorization.

- [ ] **Step 3: Write the portable skill**

`skills/payr-create-invoice/SKILL.md` must implement this finite workflow:
1. Parse client, line items, exact USDC amount, and optional due date.
2. Call `create_invoice_draft`.
3. If fields are missing, ask the user. Offer web search only for public business identity fields and only after approval.
4. Mark direct answers `user_provided`; attach URLs to `web_source` values; never infer email/wallet addresses.
5. Show the entire preview, applied defaults, and profile diff.
6. Ask for publication approval.
7. Call `publish_invoice` and display invoice number, payment link, PDF link/hash, and QR availability.
8. Offer to prepare Gmail using the returned recipient/subject/body.
9. Let Gmail request its own send approval.
10. Use `get_invoice_status` for settlement/receipt; never say Paid from a browser callback.

The skill tells filesystem-capable hosts to download the protected PDF after the user asks. Claude web presents the download link. It never promises silent local file writes.

- [ ] **Step 4: Deploy and smoke-test the remote connector**

Use an unguessable connector URL token for the hackathon only. Hash it with a separate pepper, redact it from logs, rate-limit it, and make it revocable. Connect Claude to the deployed Streamable HTTP endpoint and exercise initialize, list tools, missing fields, draft, publish, status, and void.

Do not paste the connector URL into Git, chat transcripts, screenshots, or the submission.

- [ ] **Step 5: Test Gmail as an enhancement**

Connect Claude's Gmail integration. Use a dedicated demo recipient and approve one email containing the payment and PDF URLs. Record whether arbitrary PDF attachment is actually supported:
- if supported and stable, include attachment as polish;
- if unsupported or slow, keep link-only email and main-demo bypass.

`docs/ops/claude-gmail-demo.md` records the exact safe sequence, recipient check, approval gate, and direct-link fallback without credentials.

- [ ] **Step 6: Commit, push, verify**

```bash
git add src/lib/mcp src/app/api/mcp skills/payr-create-invoice docs/ops/claude-gmail-demo.md src/lib/invoices/schemas.ts package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "feat: expose Payr to agent clients"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

---

### Task 11: Production Deployment, End-to-End Proof, and Demo Hardening

**Hours:** 3

**Files:**
- Create: `tests/e2e/payr-live.spec.ts`
- Create: `docs/architecture.md`
- Create: `docs/ops/demo-runbook.md`
- Create: `docs/ops/verification-evidence.md`
- Modify: `README.md`
- Modify: `STATUS.md`
- Modify: `PROJECT.md` only if implementation forced an approved product-boundary change
- Modify: Vercel project/environment configuration through CLI/dashboard; do not store secrets in Git

**Interfaces:**
- Consumes: all prior tasks, GitHub `main`, Vercel, `payrlink.xyz`, Supabase, Arc, Claude, optional Gmail, and Resend.
- Produces: deployed and rehearsed three-minute path, architecture/submission evidence, prior-real-transaction fallback, and honest readiness status.

- [ ] **Step 1: Run security and release preflight**

Verify:

```bash
git status --short --branch
git log --oneline --decorate -12
pnpm install --frozen-lockfile
pnpm audit
pnpm verify
cd contracts && forge fmt --check && forge test -vvv
```

Run a secret-pattern scan across tracked files and intended additions without printing any matched value. Confirm `.env*`, private keys, connector tokens, raw bearer links, Supabase service-role keys, Privy secrets, and Resend keys are not tracked.

- [ ] **Step 2: Apply production infrastructure in dependency order**

1. Apply Supabase migrations and create the private document bucket.
2. Configure Vercel environment variables explicitly.
3. Deploy from GitHub `main` to a preview URL.
4. Verify `/api/health`, authenticated dashboard, MCP endpoint, and protected routes on preview.
5. Attach `payrlink.xyz`; verify DNS, certificate, and canonical redirects.
6. Configure Resend SPF/DKIM and verify the sender domain before sending branded receipt email.
7. Enable backfill scheduling only after observing one authenticated invocation.

If custom-domain TLS is not ready, use the verified Vercel hostname for the demo and state that branded DNS is pending. If Resend domain verification is not ready, do not claim branded receipt delivery.

- [ ] **Step 3: Write and run one live end-to-end test**

The test creates unique fixture profiles and performs:
1. agent/API draft from `Circle`, `1,000 USDC`, `building the frontend website`;
2. saved-default due date assertion;
3. publication retry with the same number/link/hash;
4. PDF parse, raster review, and QR decode;
5. Pay Now authorization with expiry no more than ten minutes;
6. real external-wallet Arc payment through the deployed contract;
7. verified event-driven Paid transition;
8. receipt page/PDF validation;
9. two logical Resend rows with real provider message IDs;
10. Claude status retrieval.

Store only public/redacted evidence: deployment URL, invoice number, PDF hash, contract, transaction hash, block/log index, receipt hash, provider message IDs, timestamps, and screenshots with bearer URLs/private addresses redacted.

- [ ] **Step 4: Perform visual and failure-state QA**

Capture and inspect desktop/mobile screenshots of dashboard setup, draft preview, invoice/payment, confirming, paid, and receipt states. Exercise unknown slug, voided invoice, wrong network, rejected wallet, expired authorization, replay, delayed reconciler, and failed email retry. Check browser console and network logs for errors or raw bearer slugs.

- [ ] **Step 5: Rehearse the three-minute demo twice**

Primary timed path:
- 0:00–0:15 pain;
- 0:15–0:45 Claude instruction and draft;
- 0:45–1:05 publish, PDF, QR, and link;
- 1:05–1:25 Gmail only if stable;
- 1:25–2:05 client payment;
- 2:05–2:35 verified Paid, receipt PDF, and receipt email;
- 2:35–2:50 Claude status and explorer;
- 2:50–3:00 architecture.

Fallback uses one previously settled real Arc transaction, its exact PDF/receipt, and a clearly labeled short recording. Search and Gmail are skipped immediately when unstable.

- [ ] **Step 6: Finish public-repository and submission artifacts**

`README.md` includes problem, solution, architecture, real setup commands, exact chain/contract addresses from deployment metadata, privacy boundary, test commands, demo steps, sponsor usage, and known limitations. Add license, security-reporting guidance, and no-production-financial-advice/testnet notice before calling the public repository submission-ready.

Attempt the Bazantic one-hour spike only when all 16 core acceptance criteria are already green and at least one hour remains. Drop it if it needs a second state model, duplicate UI, or destabilizes Claude.

- [ ] **Step 7: Run the final canonical verification**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
cd contracts && forge fmt --check && forge test -vvv
```

Then read back the Vercel deployment, Arc transaction/event, receipt, Resend provider IDs, GitHub Actions run, and remote `main` SHA. Do not mark a category green from planned work or local mocks.

- [ ] **Step 8: Commit, push, verify**

```bash
git add README.md STATUS.md PROJECT.md docs tests/e2e/payr-live.spec.ts
git diff --cached --check
git commit -m "docs: prepare Payr demo and submission"
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

Confirm the final worktree contains no unintended untracked outputs. Do not delete the original `assets/` unless Keng explicitly decides how those files should be tracked.

## Final Acceptance Matrix

| Approved requirement | Implemented by | Primary proof |
| --- | --- | --- |
| Service-provider prompt and saved profiles | Tasks 3, 4, 10 | Claude draft with applied defaults |
| Missing fields and approved sourced suggestions | Tasks 4, 10 | API/MCP provenance tests |
| Separate publication and Gmail approvals | Tasks 4, 10 | Claude transcript and tool sequence |
| Immutable number and void-and-replace | Tasks 2, 4 | concurrency/state tests |
| `payrlink.xyz/invoice/<slug>` | Tasks 5, 11 | deployed protected route |
| Frozen PDF, hash, and QR | Task 5 | parsed/rasterized PDF and decoded QR |
| Existing external client wallet | Task 8 | wallet-signed Arc transaction |
| Exact Arc native USDC settlement | Tasks 6–8 | contract tests and explorer transaction |
| Short-lived policy-controlled authorization | Task 7 | allow/deny evidence and recovered signer |
| Event-only Paid state | Task 9 | forged-callback rejection and verified log |
| Receipt page/PDF | Task 9 | immutable receipt artifact |
| Resend to both confirmed parties | Task 9 | two logical rows and provider IDs |
| Gmail initial email | Task 10 enhancement | approved link-bearing Gmail send |
| Private invoice contents offchain | Tasks 5, 6, 11 | calldata/event inspection |
| Three-minute causal demo | Task 11 | two timed rehearsals and fallback |
| Repository/submission consistency | Task 11 | README, architecture, video, and remote SHA |

## Execution Rules

- Execute tasks in order; do not start sponsor polish while an earlier kill gate is unresolved.
- Keep one runnable path after every task.
- Use TDD for each behavioral change: observe the targeted failure, implement the smallest change, then rerun the focused and relevant broader checks.
- Commit only files named by the current task unless a verified dependency requires a documented exception.
- Never combine a failing task with the next task to make the commit appear green.
- After any external write—GitHub push, Vercel deployment, Supabase migration, Privy policy/wallet change, Arc deployment/payment, Resend send, or Gmail send—read back the exact target before claiming success.
- Update `STATUS.md` at each kill gate, not after every minor code edit.
