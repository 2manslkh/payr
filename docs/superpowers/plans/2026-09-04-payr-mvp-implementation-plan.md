# Payr MVP Implementation Plan

**Status:** Executable implementation baseline

**Goal:** Deliver one narrow Payr vertical slice in 44 focused engineering hours: a freelancer uses a deployed Claude connector to create and approve an immutable USDC invoice, a client pays it from an external wallet through the Payr contract on Arc testnet, and Payr independently reconciles the event into a receipt and durable Resend deliveries.

**Architecture:** One Next.js application owns the dashboard, canonical invoice service, stateless Streamable HTTP MCP endpoint, protected invoice and receipt routes, payment authorization, reconciliation, and database-backed workers. Supabase/PostgreSQL is the private system of record. A minimal Arc contract accepts exact native USDC and emits the event that creates settlement evidence. Commercial invoice state remains independent from settlement evidence. A `PaymentSigner` port uses a tightly guarded testnet-only local signer for the committed MVP; a policy-controlled Privy adapter is an optional out-of-schedule enhancement.

**Source context:** Read `PROJECT.md`, `DECISIONS.md`, `docs/superpowers/specs/2026-09-04-payr-framing-design.md`, `DESIGN.md`, and `docs/superpowers/plans/2026-09-05-payr-agent-orchestration-plan.md` before execution. This plan owns technical decomposition and verification. It does not silently override product scope, acceptance criteria, design, or dated decisions; reconcile any conflict in the authoritative documents before implementation continues.

## Scope And Execution Rules

- Keng is the sole human operator. Scoped GPT-5.6 Terra xhigh agents implement isolated tickets under the orchestration plan; the human engineering and live-operator budget remains exactly 44 hours.
- The current repository already has a runnable Next.js shell. Inspect and adopt it. Do not run `pnpm init`, `create-next-app`, or another scaffold command.
- Track the four approved reference files under `assets/brand/` unchanged. Production web assets are separate derived files with `Payr` capitalization.
- Before changing Next.js routes, cookies, caching, runtime configuration, or deployment behavior, read the relevant versioned guide under `node_modules/next/dist/docs/`. This repository's installed Next.js version is authoritative.
- Use TDD for behavior: add one focused failing test, observe the intended failure, make the smallest implementation pass, then run the relevant broader suite.
- Keep unit and database integration suites separate. Unit tests must include both `.test.ts` and `.test.tsx`; DB tests use `.integration.test.ts` or `.integration.test.tsx` and run only against local/CI Supabase.
- Playwright runs both desktop and mobile projects. Ordinary Playwright tests use deterministic mock wallet/RPC adapters and never require an extension, a private key, real funds, or a live provider.
- Real Arc payment, Resend delivery, Claude connector, DNS, and Vercel checks are explicit manual/live operator tests. Any optional Privy policy spike is also manual/live. Never fold them into the default unit or Playwright commands.
- Do not mark an external integration complete from mocks. Read back every external write from its authoritative API, chain, deployment, inbox, or dashboard.
- Do not log secrets, raw connector path tokens, protected invoice/receipt slugs, authorization signatures, private keys, or provider credentials. Application logs and analytics must redact path credentials. The platform/CDN may still retain URL paths, as documented below.
- Agents commit only their owned ticket files in isolated worktrees. The coordinator integrates them into one versioned PR per tranche, stages intended paths explicitly, merges through protected `main`, and tags the resulting merge commit under `docs/ops/versioning.md`.
- Claude Gmail execution, Gmail PDF attachment, host-agent web-search implementation, Privy, and Bazantic are outside the committed 44-hour schedule. The data contract still accepts confirmed `web_source` provenance. Optional spikes begin only after every core acceptance criterion passes early.

## Approved Web Experience Contract

`DESIGN.md` defines the approved `Commit Ledger` visual system. It is core implementation guidance for Tasks 3-8, not optional Task 10 polish. Implement the system as a document-led, responsive operations console with concentrated settlement-proof contrast and no Request/Plasma composition copying.

- Claude remains the primary invoice creation, revision, publication, status, and voiding interface. Authenticated web surfaces manage configuration and inspect agent-created records; they contain no direct invoice-authoring form.
- Desktop uses a compact dark workspace rail and open ledger canvas. Tablet collapses the rail. Mobile uses a concise top bar and bottom navigation for Overview, Invoices, Clients, and Activity; Connections and Settings remain in the account menu. Ledger rows preserve labels and protected payment actions remain reachable without hiding invoice facts.
- `/` is the public landing page. Authenticated MVP surfaces live under `/app`: overview, invoices, invoice detail, clients, redacted activity, connections, and settings. `Open Claude` is the persistent creation action.
- Overview shows receivables, ordered attention items, setup state only while relevant, and the latest verified settlement. Invoice lists use one toolbar and show commercial and payment state separately. Invoice detail pairs the immutable document with lifecycle, payment, settlement, receipt, and delivery proof.
- Protected invoice/payment and receipt pages remove dashboard chrome and prioritize exact amount, payee, `USDC on Arc`, due date, technical authorization expiry where applicable, gas reserve, safe action, and server-derived progression.
- Bills is future incoming-request scope. Hide it from MVP navigation and do not implement batch payment, autonomous spending, or a nonfunctional Bills placeholder.
- Use approved brand capitalization `Payr`, retain the arrow-R monogram, and refine the production wordmark from the tracked reference assets without overwriting them.
- Meet WCAG AA contrast, visible keyboard focus, semantic status text, 44px touch targets, reduced-motion preferences, and desktop/mobile verification. Semantic color never acts as the only state signal.

## Time Budget And Dependency Gates

| Task | Deliverable | Depends on | Hours | Kill gate |
| ---: | --- | --- | ---: | --- |
| 1 | Adopt runnable shell, external preflight, Vercel health preview | None | 3 | Arc facts and Vercel health are real or explicitly blocked; DNS and Resend verification have started |
| 2 | Domain and hardened database contract | 1 | 5 | State, tenancy, immutability, token, idempotency, and direct-access denial tests pass |
| 3 | Wallet auth, profiles, connector lifecycle | 2 | 4 | Replay/concurrency/authz tests pass; connector cannot cross workspaces or mutate payout data |
| 4 | Draft revision and crash-safe publication | 2, 3 | 5 | One leased publication attempt safely survives retries/crashes; no incomplete link is exposed |
| 5 | Immutable PDF/storage/protected routes | 4 | 4 | Stored and served bytes match; embedded QR decodes; direct anonymous storage access fails |
| 6 | Contract, testnet signer, Arc deployment, operator payment | 1, 2, 4, 5 | 6 | Foundry is green and one real operator payment succeeds through the guarded local signer |
| 7 | Reconciliation, receipts, durable outbox | 2, 4, 5, 6 | 6 | Every valid configured event is recorded independently of commercial state; worker recovery is proven |
| 8 | Client payment UI | 5, 6, 7 | 3 | No wallet write on wrong network, insufficient balance, or failed authorization; Paid comes only from status |
| 9 | MCP and Claude smoke test | 3, 4, 7 | 2 | Deployed stateless endpoint exposes exactly four tools and passes connector lifecycle tests |
| 10 | Production proof, docs, rehearsal, contingency | All prior tasks | 6 | Core acceptance matrix is green, evidence is honest, and two rehearsals complete |
|  | **Total** |  | **44** | Task 10 includes an explicit two-hour contingency reserve |

Reconciliation is deliberately complete before payment UI. Task 8 consumes the already-built `/api/reconcile/transaction` and status routes instead of inventing a frontend settlement path.

## Pinned Cross-Cutting Contracts

### Commercial State And Settlement

```ts
export type CommercialState = "draft" | "published" | "voided" | "expired";
export type PaymentStatus = "unpaid" | "paid";
export type DisplayStatus = "Draft" | "Published" | "Voided" | "Expired" | "Paid";

export function deriveDisplayStatus(
  commercialState: CommercialState,
  settlement: SettlementFacts | null,
): DisplayStatus {
  return settlement
    ? "Paid"
    : `${commercialState[0].toUpperCase()}${commercialState.slice(1)}` as Exclude<DisplayStatus, "Paid">;
}
```

- There is no commercial `paid` state and no `paid_at` column on `invoices`.
- A verified settlement row is immutable event evidence. Its presence always derives payment status `paid` and display status `Paid`, including when commercial state is `voided` or `expired`.
- `settledAfterVoid` is `true` only when `voidedAt !== null` and the event block time is strictly later than `voidedAt`. Equality is not "after" and returns `false`.
- Payability is half-open: an invoice is payable only while `commercialState === "published"`, no settlement exists, and `now < payableUntil`. At `now === payableUntil` it is expired and authorization is denied.
- Chain-bound issue and deadline values are canonical integer Unix seconds. Each authorization uses `issuedAtSecond = floor(serverNow / 1000)` and `authorizationValidUntil = min(issuedAtSecond + 10 minutes, payableUntilSecond - 1)`, and requires `authorizationValidUntil > issuedAtSecond`. The contract accepts through `authorizationValidUntil` but independently rejects `block.timestamp >= payableUntil`.
- A due date is commercial metadata. `payableUntil` is the technical deadline and defaults to 30 days after the due date.
- Expiry may be projected lazily or by a job, but authorization always checks the timestamp directly. A delayed reconciler records a matching event whose block time precedes expiry even if commercial state has since become `expired`.
- The reconciler validates configured chain, contract, event, and frozen invoice facts, then records every valid event regardless of current commercial state. It does not filter out `voided` or `expired` invoices.
- Once a settlement is already recorded, an explicit void request is rejected. A void can still race with an unobserved, previously authorized payment; the immutable event wins display status while commercial state and race facts remain visible.

### Deterministic Protected Links

Invoice and receipt links use the same format with purpose-separated labels:

```text
slug = base64url(uuidBytes(tokenId)) + "." +
       base64url(HMAC-SHA256(linkKey[keyVersion],
          "payr:" + purpose + ":v" + keyVersion + ":" + tokenId))
verifierHash = HMAC-SHA256(linkKey[keyVersion],
  "payr:bearer-lookup:v1:" + purpose + ":" + slug)
```

- `tokenId` is random, non-secret, and stored.
- Store only `token_id`, `purpose`, `key_version`, keyed `verifier_hash`, target IDs, expiry, and revocation metadata. Never store a raw slug or full URL.
- Purpose labels separate invoice signing, receipt signing, and lookup verification under the versioned link key. The key version selects retained key material during rotation.
- On inbound access, parse `tokenId`, load one candidate row, recompute the keyed verifier hash, and compare in constant time. A purpose mismatch fails.
- On publish retry, status lookup, Gmail package creation, email dispatch, and process restart, regenerate the same slug from the stored token ID and key version.
- Persisted idempotency/publication result JSON contains only IDs, hashes, filenames, and state. It contains no raw URL. API/MCP responses materialize URLs just before return.
- Build all absolute links from validated `NEXT_PUBLIC_APP_URL`; never hardcode `payrlink.xyz`. Set it to the custom domain when healthy or the verified Vercel hostname as fallback.

### Idempotency And Fencing

- Every idempotent mutation stores `(workspace_id, operation, idempotency_key, request_fingerprint)`.
- The fingerprint is a hash of canonical, validated, normalized request data plus operation name, excluding the idempotency key itself.
- Reusing a key with the same fingerprint returns/reconstructs the original logical result.
- Reusing a key with a different fingerprint returns HTTP 409 and stable code `IDEMPOTENCY_CONFLICT`; it never returns the first request's private data.
- Leased work uses `lease_until` and monotonically increasing `fence`. A worker can finalize only with the fence it claimed. A stale worker's write affects zero rows and is discarded.
- Clocks are injected in unit tests. Database functions use database time for lease ownership and transactional deadlines.

### Exact Status Contract

`get_invoice_status` and the canonical HTTP status route return this exact shape with explicit `null` values:

```ts
export type ReceiptDocumentState =
  | "not_applicable"
  | "pending"
  | "rendering"
  | "retry_wait"
  | "ready"
  | "failed";

export type DeliveryState =
  | "pending"
  | "sending"
  | "retry_wait"
  | "sent"
  | "manual_review"
  | "failed";

export type InvoiceStatusResult = {
  schemaVersion: "payr.invoice-status.v1";
  invoiceId: string;
  invoiceVersion: number;
  invoiceNumber: string | null;
  commercialState: CommercialState;
  paymentStatus: PaymentStatus;
  displayStatus: DisplayStatus;
  payableUntil: string | null;
  settlement: null | {
    chainId: number;
    contractAddress: `0x${string}`;
    invoiceVersion: number;
    transactionHash: `0x${string}`;
    logIndex: number;
    blockNumber: string;
    blockTime: string;
    payer: `0x${string}`;
    payee: `0x${string}`;
    amountDecimal: string;
    amountAtomic: string;
    documentCommitment: `0x${string}`;
  };
  explorer: null | { transactionUrl: string };
  settledAfterVoid: boolean;
  invoiceDocument: null | {
    state: "ready";
    pageUrl: string;
    pdfUrl: string;
    pdfFilename: string;
    pdfContentHash: `0x${string}`;
  };
  receipt: {
    state: ReceiptDocumentState;
    pageUrl: string | null;
    pdfUrl: string | null;
    pdfFilename: string | null;
    pdfContentHash: `0x${string}` | null;
  };
  receiptEmail: {
    state: "not_applicable" | "queued" | "sending" | "sent" | "failed" | "manual_review";
    deliveries: Array<{
      roles: Array<"issuer" | "client">;
      normalizedRecipient: string;
      state: DeliveryState;
      providerMessageId: string | null;
      attemptCount: number;
      nextAttemptAt: string | null;
    }>;
  };
};
```

`commercialState` is the effective value at read time, even if an expiry sweep has not persisted it yet. `paymentStatus` is `paid` if and only if `settlement` is non-null. Before settlement, receipt and receipt-email state are `not_applicable`. The connector may see only invoices in its workspace. Recipient values are the confirmed addresses needed for the freelancer's own status operation; public bearer routes never return receipt-delivery recipients.

Public bearer status is an explicit redaction of this canonical result, never a second state model:

```ts
export type PublicInvoiceStatusResult = {
  schemaVersion: "payr.public-invoice-status.v1";
  invoiceVersion: number;
  invoiceNumber: string;
  commercialState: CommercialState;
  paymentStatus: PaymentStatus;
  displayStatus: DisplayStatus;
  payableUntil: string;
  settlement: InvoiceStatusResult["settlement"];
  explorer: InvoiceStatusResult["explorer"];
  settledAfterVoid: boolean;
  receipt: InvoiceStatusResult["receipt"];
  receiptEmailState: InvoiceStatusResult["receiptEmail"]["state"];
};
```

It excludes internal invoice/workspace IDs, recipient addresses, per-delivery rows, provider message IDs, attempt counts, and scheduling metadata. All explicit null behavior is inherited from the canonical result.

### Exact Gmail-Ready Package

Every successful publication response reconstructs this link-only package from frozen snapshots and deterministic links:

```ts
export type GmailReadyPackage = {
  to: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  paymentUrl: string;
  invoicePdfUrl: string;
};
```

- `to` contains exactly the confirmed client billing email for MVP.
- `subject` is `Invoice <invoiceNumber> from <senderName>`.
- `textBody` and canonically escaped `htmlBody` name the sender, invoice number, exact decimal amount plus `USDC on Arc`, due date, `paymentUrl`, and `invoicePdfUrl`. They contain no attachment promise or payment claim.
- There are no attachment, CC, BCC, or send fields. A host may use the protected PDF link.
- Publication approval does not authorize Gmail; the tool description and surrounding response require a separate send approval.

## Task 1: Adopt Runnable Shell, External Preflight, Vercel Health Preview

**Hours:** 3

**Depends on:** Nothing

**Files:**

- Inspect/modify: `package.json`, `pnpm-lock.yaml`
- Inspect/modify: `.nvmrc`, `.gitignore`, `.env.example`
- Inspect/modify: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`
- Modify: `vitest.config.ts`
- Create: `vitest.db.config.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Inspect/modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Inspect/modify: `src/app/api/health/route.ts`
- Modify: `src/config/env.ts`, `src/config/env.test.ts`
- Inspect/modify: `scripts/verify-arc.mjs`
- Modify: `tests/e2e/smoke.spec.ts`
- Create: `docs/ops/preflight.md`
- Modify: `README.md`, `STATUS.md`

**Produces:** A known-good existing shell, separate unit/DB test commands, desktop/mobile browser projects, a secret-free shell CI baseline, a live Vercel health preview, and an external dependency ledger. Task 2 adds the database CI job when migrations and integration tests exist.

- [ ] **1.1 Inspect and prove the existing shell before changing it**

Run from the repository root:

```bash
git status --short --branch
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Expected: the existing health route and landing smoke pass. Record pre-existing failures before touching code. Confirm the four tracked `assets/brand/` references remain unchanged. Do not run `pnpm init`.

- [ ] **1.2 Verify external prerequisites and start slow verification now**

Run or inspect without printing secret values:

```bash
gh auth status
git remote get-url origin
forge --version
supabase --version
pnpm verify:arc
dig +short payrlink.xyz
dig +short CNAME payrlink.xyz
```

In `docs/ops/preflight.md`, record `verified`, `blocked`, or `not configured` plus timestamp and non-secret evidence for:

- official Arc testnet chain ID, RPC host, explorer, native USDC behavior, deployment wallet balance, and payer balance;
- GitHub origin and authenticated ETHOnline cutoff time/timezone;
- Supabase CLI and intended project;
- Vercel account/project and `payrlink.xyz` DNS/TLS status;
- Resend account, sender-domain SPF/DKIM verification status, and two confirmed receipt inboxes;
- Claude custom connector availability and one supported external client wallet.

Start or continue Vercel DNS/TLS and Resend sender-domain verification in this step because both can propagate while implementation continues. Do not wait until Task 10 to initiate them.

Kill gate: if Arc RPC/chain identity cannot be established, continue non-chain Tasks 2-5 but mark Task 6 blocked. If Vercel authentication fails, continue locally but mark Task 9/10 deployment blocked.

- [ ] **1.3 Correct the test topology before feature work**

Ensure scripts have these semantics:

```json
{
  "test": "pnpm test:unit",
  "test:unit": "vitest run --config vitest.config.ts",
  "test:db": "vitest run --config vitest.db.config.ts",
  "test:e2e": "playwright test",
  "test:release": "node --test scripts/release-utils.test.mjs",
  "verify": "pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:release && pnpm build"
}
```

- Unit config includes `src/**/*.test.ts` and `src/**/*.test.tsx` and excludes `**/*.integration.test.*`.
- DB config includes only `src/**/*.integration.test.ts` and `.tsx`, uses a Node environment, runs serially where tests share database state, and fails clearly when local Supabase test configuration is absent.
- Playwright defines `desktop-chromium` from Desktop Chrome and `mobile-chromium` from a current mobile Chrome device.
- Task 1 CI has independent `web` and `browser` jobs, and the browser job runs both projects. Task 2 adds a separate `database` job that starts local Supabase, resets migrations, and runs `pnpm test:db` with only ephemeral local credentials.
- CI never receives production secrets and no module parses server environment at import/build time.

Add any missing test/config dependencies here and list them in `package.json`/`pnpm-lock.yaml`, including Vercel CLI if the repository does not already provide it.

- [ ] **1.4 Keep configuration runtime-safe**

`src/config/env.ts` must expose strict public/server parsers without import-time parsing. `NEXT_PUBLIC_APP_URL` accepts HTTPS or explicit localhost development. It is the only origin used to generate links and auth messages. Never derive canonical origin from an untrusted `Host` header.

Add tests for `.test.tsx` discovery, missing runtime server configuration, HTTPS production URL enforcement, and Vercel-hostname acceptance. Keep actual values out of `.env.example`.

- [ ] **1.5 Deploy the health preview immediately**

After authenticating/linking the intended Vercel project, deploy the existing shell:

```bash
pnpm exec vercel whoami
pnpm exec vercel link
pnpm exec vercel deploy
curl --fail --silent --show-error https://<verified-preview-host>/api/health
```

Expected response:

```json
{ "status": "ok", "commit": null }
```

`commit` may be a SHA on Git-backed deploys. It must never expose environment details. If deployment protection blocks public `curl`, use Vercel's authenticated inspection mechanism and separately create a public demo deployment before Task 9.

Record the preview hostname and health timestamp. Record the stable `*.vercel.app` hostname that can be assigned to `NEXT_PUBLIC_APP_URL` if custom-domain TLS is not ready.

- [ ] **1.6 Verify Task 1**

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:e2e --project=desktop-chromium
pnpm test:e2e --project=mobile-chromium
git diff --check
git status --short
```

Expected: shell and CI topology are green and only intended files appear. The tracked `assets/brand/` references remain byte-for-byte unchanged. Record the Vercel preview read-back when available; if Vercel remains blocked, retain the documented blocker and continue Tasks 2-5 under the Task 1.2 fallback. A public preview is mandatory before Task 9 deployed connector proof and Task 10 release proof, not before Task 2.

## Task 2: Domain And Hardened Database Contract

**Hours:** 5

**Depends on:** Task 1

**Files:**

- Create: `src/lib/domain/invoice.ts`, `src/lib/domain/invoice.test.ts`
- Create: `src/lib/domain/money.ts`, `src/lib/domain/money.test.ts`
- Create: `src/lib/domain/canonical-json.ts`, `src/lib/domain/canonical-json.test.ts`
- Create: `src/lib/domain/status.ts`, `src/lib/domain/status.test.ts`
- Create: `src/lib/security/keyed-token.ts`, `src/lib/security/keyed-token.test.ts`
- Create: `src/lib/db/admin.ts`, `src/lib/db/repositories.ts`
- Create: `src/lib/db/repositories.integration.test.ts`
- Create: `src/lib/db/security.integration.test.ts`
- Create/modify: `supabase/config.toml`
- Create: `supabase/migrations/202609040001_payr_core.sql`
- Modify: `.github/workflows/ci.yml` to add the Supabase-backed database job
- Modify: `.env.example`, `src/config/env.ts`, `src/config/env.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml`

**Produces:** The commercial/settlement model, exact money/canonicalization/status/token contracts, all core records, composite tenant isolation, hardened database functions/privileges, and a reproducibly private documents bucket.

- [ ] **2.1 Write domain failures first**

Add tests for:

- commercial state has exactly `draft | published | voided | expired` and never `paid`;
- any settlement derives payment status `paid` and display status `Paid` for published, voided, and expired invoices;
- `settledAfterVoid` is false before/equal and true strictly after `voidedAt`;
- payability is true one millisecond before `payableUntil` and false exactly at/after it;
- USDC input rejects empty, signed, exponent, comma, zero, negative, and more than 18 decimals;
- native Arc amount uses exactly 18 decimals and no floating-point operations;
- canonical JSON sorts object keys and preserves array order;
- invoice and receipt slugs are deterministic across fresh service instances, differ by purpose/key version, and cannot verify under the other purpose;
- the exact status contract emits explicit nulls and `Paid` whenever a settlement exists.

Run:

```bash
pnpm vitest run --config vitest.config.ts src/lib/domain src/lib/security/keyed-token.test.ts
```

Expected: focused failures because the modules do not exist.

- [ ] **2.2 Implement strict domain primitives**

Implement branded decimal strings and atomic conversion, canonical JSON, the pinned commercial/display derivation, and deterministic token generation/verification. Use Node cryptography and constant-time byte comparison. Reject unknown key versions rather than falling back to the active key.

Add these non-secret names to `.env.example` and strict runtime parsing:

```dotenv
LINK_ACTIVE_KEY_VERSION=1
LINK_TOKEN_KEY_V1=
SUPABASE_ANON_KEY=
```

Keys must decode to at least 32 random bytes. Keep previous version variables deployed while any corresponding link row exists.

- [ ] **2.3 Create the full relational contract**

The core migration creates these enums and records now so later tasks implement against one known contract:

```text
commercial_state: draft | published | voided | expired
publication_state: reserved | rendering | stored | finalized | failed
receipt_document_state: pending | rendering | retry_wait | ready | failed
delivery_state: pending | sending | retry_wait | sent | manual_review | failed
```

Core records:

- `workspaces`, `sender_profiles`, `clients`, and `invoice_sequences`;
- `auth_nonces`, `connector_tokens`, `connector_rate_limits`, and `audit_events`;
- `idempotency_requests` with non-null `request_fingerprint` and result descriptor JSON;
- `invoices` and append-only `invoice_versions`;
- `publication_attempts` with request fingerprint, attempt-specific storage key, lease, fence, and terminal failure code;
- `access_links` with token ID, purpose, key version, verifier hash, target, expiry, and revocation, but no slug/URL;
- `payment_authorizations` bound to exact workspace/invoice/version and persisted before response;
- `settlements` bound to exact workspace/invoice/version and unique by configured event identity;
- `receipt_documents`, `email_deliveries`, and retained delivery roles;
- `reconciliation_cursors` scoped by chain and contract.

Use composite keys/FKs for tenant-owned relationships. At minimum, all of these include `workspace_id` on both sides:

```text
clients -> workspaces
invoices -> clients
invoice_versions -> invoices
publication_attempts -> invoice_versions
access_links -> invoice_versions or receipt_documents
payment_authorizations -> invoice_versions
settlements -> invoice_versions
receipt_documents -> settlements
email_deliveries -> settlements
```

A globally unique UUID is not a substitute for the composite tenant FK. Add the required composite unique/primary indexes explicitly.

Pin constraints:

- invoice number and publication timestamp are absent in `draft` and present in every non-draft state;
- `voided_at` exists iff commercial state is `voided`; `expired_at` exists iff it is `expired`;
- there is no `paid_at` and no settlement-driven commercial-state update;
- issue/due/payable timestamps are valid and atomic amount is positive;
- publication artifact fields are all-null before freeze and all-present after freeze;
- payment authorization expiry is after issue time and no later than invoice `payable_until`;
- settlements carry configured chain, contract, exact invoice version, event identity, block facts, payee, amount, and commitment;
- ready documents require storage key, byte length, content type `application/pdf`, and content hash;
- result descriptor JSON is rejected if it contains keys such as `url`, `slug`, or `token`.

- [ ] **2.4 Harden SQL functions, privileges, immutability, and storage**

Create the narrowly scoped application transaction functions in `public` so the server-side Supabase client can call them through RPC, but remove all default caller access. Every `SECURITY DEFINER` function must set an empty search path and fully qualify application objects. Create each function and its grants in the same migration transaction. Apply all of the following:

```sql
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres revoke execute on functions from anon, authenticated;
```

Supabase migrations run as `postgres`; if that changes, replace `postgres` with every actual function-creator role. The default revoke must be global because PostgreSQL cannot remove its global default `PUBLIC EXECUTE` grant with a schema-scoped revoke. Also revoke each newly created function explicitly in the same migration transaction rather than relying only on defaults. Grant `service_role` execute only on the named application functions needed by the server repository. Their presence in the exposed schema is not authorization; direct `anon` and `authenticated` RPC calls must fail by privilege. Enable RLS on every private table and create no permissive `anon`/`authenticated` policies.

Add database-enforced immutability:

- frozen `invoice_versions` cannot be updated or deleted;
- `settlements` cannot be updated or deleted, including by ordinary service-role table writes;
- `receipt_documents` cannot change target, bytes, hash, key, or token after `ready`;
- finalized publication attempts cannot change artifact facts;
- all legitimate transitions occur through fenced privileged functions.

Provision the `documents` bucket in the migration with `public = false`, deterministic size/content-type limits, and no anonymous object policy. This must be reproducible after `supabase db reset`; no dashboard-only bucket setup.

- [ ] **2.5 Prove database behavior and hostile access**

Write integration tests for:

- composite cross-workspace client/invoice, version/attempt, settlement/version, and receipt/settlement FK rejection;
- invalid state/timestamp combinations;
- frozen-version, settlement, finalized-attempt, and ready-document update/delete rejection;
- same idempotency key/same fingerprint replay and different fingerprint `IDEMPOTENCY_CONFLICT`;
- concurrent invoice sequence allocation without duplicate/reused values;
- duplicate event identity returning the same immutable settlement;
- anonymous and authenticated direct table denial;
- anonymous/authenticated direct RPC denial for every privileged mutation function;
- anonymous direct object URL/list/download denial from the `documents` bucket;
- service repository methods requiring `workspaceId` even though they use the service role.

Run:

```bash
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm test:db
pnpm test:unit
pnpm typecheck
git diff --check
git status --short
```

Expected: all money/state constraints hold in PostgreSQL, direct public access fails, and a reset recreates the private bucket. Do not begin dashboard or publication work while this gate is red.

## Task 3: Wallet Auth, Profiles, Connector Lifecycle

**Hours:** 4

**Depends on:** Task 2

**Files:**

- Create: `src/lib/auth/message.ts`, `src/lib/auth/message.test.ts`
- Create: `src/lib/auth/session.ts`, `src/lib/auth/session.test.ts`
- Create: `src/lib/auth/origin.ts`, `src/lib/auth/origin.test.ts`
- Create: `src/lib/connectors/service.ts`, `src/lib/connectors/service.test.ts`
- Create: `src/lib/connectors/auth.ts`, `src/lib/connectors/auth.integration.test.ts`
- Create: `src/app/api/auth/nonce/route.ts`, `src/app/api/auth/nonce/route.test.ts`
- Create: `src/app/api/auth/verify/route.ts`, `src/app/api/auth/verify/route.test.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/profile/route.ts`, `src/app/api/profile/route.test.ts`
- Create: `src/app/api/clients/route.ts`, `src/app/api/clients/route.test.ts`
- Create: `src/app/api/connectors/route.ts`, `src/app/api/connectors/route.test.ts`
- Create: `src/app/api/connectors/[id]/revoke/route.ts`
- Create: `src/app/(dashboard)/app/layout.tsx`, `src/app/(dashboard)/app/settings/page.tsx`
- Create: `src/app/(dashboard)/app/clients/page.tsx`, `src/app/(dashboard)/app/connections/page.tsx`
- Create: `src/app/(dashboard)/app/activity/page.tsx`
- Create: `src/components/app-navigation.tsx`, `src/components/payr-wordmark.tsx`
- Create: `src/components/wallet-login.tsx`, `src/components/profile-form.tsx`
- Create: `src/components/client-form.tsx`, `src/components/connector-token.tsx`
- Create: `supabase/migrations/202609040002_auth_connector_functions.sql`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Modify: `.env.example`, `src/config/env.ts`, `package.json`, `pnpm-lock.yaml`

**Produces:** Wallet-authenticated freelancer sessions, the responsive `Commit Ledger` workspace shell, authoritative sender/client profiles, owner-authorized payout changes, and fixed-scope connector credentials with create/show-once/revoke/expire/rate-limit/audit behavior.

- [ ] **3.1 Install and test the auth boundary**

Add pinned compatible dependencies for viem signature verification and encrypted/authenticated session cookies. Write failures first for:

- valid owner login;
- bad signature, wrong wallet, wrong nonce, wrong purpose, wrong origin/domain/URI/chain, expired nonce, and modified client-supplied message;
- two concurrent verifies of one nonce where exactly one succeeds;
- replay after success;
- session expiry/tampering and logout;
- payout change signed by payout wallet but not owner wallet;
- payout change signed by the workspace owner over the exact old/new values;
- cookie-authenticated mutation with missing/foreign `Origin` or mismatched `Host`.

The client submits only the nonce identifier and signature, never a wallet field or authoritative message string. The server loads the expected wallet and complete nonce facts by ID, then reconstructs the complete message from stored data, workspace/request purpose, configured `NEXT_PUBLIC_APP_URL`, chain, and expiry.

- [ ] **3.2 Implement atomic nonce consumption and always-Secure sessions**

Use 32 random bytes for the encoded nonce challenge and persist it with the exact message fields because the server must reconstruct the signed message from nonce ID alone. The nonce is not a bearer credential; the wallet signature is the proof. After signature verification, consume with one conditional database statement/function equivalent to:

```sql
update public.auth_nonces
set consumed_at = now()
where id = $1
  and wallet = $2
  and purpose = $3
  and consumed_at is null
  and expires_at > now()
returning id;
```

Exactly one returned row is required. Zero rows means `NONCE_INVALID_OR_USED`. Workspace creation/loading and purpose-specific mutation must be transactionally coupled where needed so nonce reuse cannot succeed after a partial request.

The cookie is always named `__Host-payr-session` and always has:

```ts
{
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/"
  // no Domain attribute
}
```

Do not weaken `secure` in development. Use localhost's secure-context behavior or local HTTPS if a browser cannot retain it. Rotate the encrypted/authenticated session at login and clear it at logout.

For cookie-authenticated mutation routes, require an `Origin` exactly matching `NEXT_PUBLIC_APP_URL` and a Host matching that configured origin after trusted proxy normalization. Auth nonce/verify also enforce configured origin before setting a cookie. Cron, MCP path-token, and invoice bearer routes use their own authentication and are not treated as cookie CSRF surfaces.

- [ ] **3.3 Implement authoritative profile behavior**

- Sender identity and payout wallet are dashboard-only.
- The owner wallet stored on the workspace, not the old/new payout wallet, must authorize a payout change.
- The payout-change message binds workspace ID, owner wallet, old payout wallet, new payout wallet, nonce, purpose, configured origin, chain, and expiry.
- Client APIs are workspace-scoped. Dashboard-entered client data is confirmed `user_provided` data.
- Browser code receives no service-role credential and never directly queries private profile tables.
- API tests cover unauthenticated requests, cross-workspace IDs, unknown fields, stale profile revisions, and payout mutation through client/agent-shaped inputs.

- [ ] **3.4 Implement the complete connector token lifecycle now**

Connector creation generates a random high-entropy secret, stores only token ID plus keyed hash, and returns the secret and complete endpoint URL exactly once. Subsequent list/status calls return token ID, creation/expiry/revocation dates, last-used date, and fixed scopes, never the token.

Fixed non-configurable scopes are exactly:

```ts
["invoice:draft", "invoice:publish", "invoice:status", "invoice:void"]
```

Implement:

- create with bounded expiry;
- show once in the dashboard with explicit copy/acknowledge behavior;
- authenticate by keyed hash in constant time;
- revoke immediately;
- reject exact expiry boundary (`now >= expiresAt`);
- database-backed per-token and per-IP rate limiting that is atomic across Vercel instances; normalize IPs and store only a purpose-keyed hash, never the raw address;
- audit entries containing token ID, workspace ID, action, outcome, and timestamp only;
- no raw token, URL, request body, invoice slug, or client PII in audit/application logs.

The endpoint token in `/api/mcp/<token>` is an explicit hackathon/testnet shortcut. Document in the connector UI that platform access logs, CDN logs, browser history, clipboard history, and Claude connector configuration may retain it. Payr can redact only its own application logs and analytics. Rotate/revoke the demo token immediately after the demo. OAuth is post-MVP, not a Task 3 or Task 9 deliverable.

The dashboard shell follows `DESIGN.md`: standardize the production wordmark as `Payr`, use the approved shallow destinations, expose `Open Claude` instead of a create-invoice form, omit Bills, preserve keyboard navigation at every breakpoint, and never use color alone for connector/profile state. Activity starts with safely redacted profile, auth, and connector audit events; later tasks add publication and settlement events without exposing request bodies, addresses, credentials, or protected URLs.

- [ ] **3.5 Run the auth/connector gauntlet**

```bash
pnpm vitest run --config vitest.config.ts src/lib/auth src/lib/connectors src/app/api/auth src/app/api/profile src/app/api/clients src/app/api/connectors
pnpm test:db
pnpm typecheck
pnpm build
git diff --check
git status --short
```

Expected: replay and concurrent nonce use produce one success; payout changes require the owner; connector create/show-once/revoke/expire/rate-limit work; cross-workspace access reveals nothing.

## Task 4: Draft Revision And Crash-Safe Publication

**Hours:** 5

**Depends on:** Tasks 2 and 3

**Files:**

- Create: `src/lib/invoices/schemas.ts`, `src/lib/invoices/schemas.test.ts`
- Create: `src/lib/invoices/errors.ts`
- Create: `src/lib/invoices/service.ts`, `src/lib/invoices/service.test.ts`
- Create: `src/lib/invoices/publication.ts`, `src/lib/invoices/publication.test.ts`
- Create: `src/lib/invoices/publication-worker.ts`, `src/lib/invoices/publication-worker.test.ts`
- Create: `src/lib/invoices/gmail-package.ts`, `src/lib/invoices/gmail-package.test.ts`
- Create: `src/app/api/invoices/drafts/route.ts`, `src/app/api/invoices/drafts/route.test.ts`
- Create: `src/app/api/invoices/[id]/publish/route.ts`, `src/app/api/invoices/[id]/publish/route.test.ts`
- Create: `src/app/api/invoices/[id]/status/route.ts`, `src/app/api/invoices/[id]/status/route.test.ts`
- Create: `src/app/api/invoices/[id]/void/route.ts`, `src/app/api/invoices/[id]/void/route.test.ts`
- Create: `src/app/api/jobs/publications/route.ts`
- Create: `src/app/(dashboard)/app/page.tsx`
- Create: `src/app/(dashboard)/app/invoices/page.tsx`
- Create: `src/app/(dashboard)/app/invoices/[id]/page.tsx`
- Create: `tests/e2e/dashboard-invoices.spec.ts`
- Create: `supabase/migrations/202609040003_publication_functions.sql`
- Modify: `.env.example`, `src/config/env.ts`, `package.json`, `pnpm-lock.yaml`

**Produces:** Strict partial draft/revision input, structured missing fields, stable error codes, exact status and Gmail package responses, idempotent publication reservation, a crash-safe leased publication worker port, and authenticated read-only overview/invoice management surfaces.

- [ ] **4.1 Pin strict partial schemas and stable errors**

`create_invoice_draft` input is intentionally partial so the canonical service, not the agent, identifies omissions. Every object at every nesting level uses strict unknown-field rejection. Supported inbound provenance is exactly:

```ts
type InboundProvenance =
  | { kind: "user_provided" }
  | { kind: "web_source"; url: string };

type ConfirmedProposedField<T> = {
  value: T;
  provenance: InboundProvenance;
  confirmed: true;
};

type StrictProposedClientFields = {
  businessName?: ConfirmedProposedField<string>;
  billingAddress?: ConfirmedProposedField<{
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode: string;
    countryCode: string;
  }>;
  contactName?: ConfirmedProposedField<string>;
  contactEmail?: ConfirmedProposedField<string>;
};
```

These are the complete accepted proposed-client property names. Every shown object, including the address and provenance wrappers, is strict at runtime. `countryCode` is uppercase ISO 3166-1 alpha-2 and `contactEmail` is normalized only after validation. Do not accept inbound `saved_profile`, fabricated sources, unconfirmed proposals, inferred email, or inferred wallet data. Saved profiles are selected by client ID/alias and represented internally, not claimed as inbound provenance.

The draft input includes:

```ts
type CreateInvoiceDraftInput = {
  draftId?: string;
  expectedVersion?: number;
  client?: { id?: string; alias?: string; proposed?: StrictProposedClientFields };
  items?: Array<{ description?: string; amount?: string }>;
  issueDate?: string;
  dueDate?: string;
  useDefaultTerms?: boolean;
  memo?: string;
  idempotencyKey: string;
};
```

`draftId` and `expectedVersion` must appear together or neither appears. With them, the same operation revises the exact draft version and creates version `n + 1`; there is no separate revise tool. Without them, it creates version 1 only after the merged input is complete.

Incomplete new/revised input returns HTTP 422:

```ts
{
  code: "MISSING_FIELDS",
  draftCreated: false,
  missingFields: Array<{
    path: string;
    reason: "required" | "default_unavailable" | "confirmation_required";
  }>;
}
```

It creates no draft/version/idempotency result. Invalid values, unknown fields, and invalid provenance return `INVALID_INPUT` with field issues. Any supplied sender/issuer/payout/invoice-prefix property returns `PROHIBITED_FIELD`. Stale revision returns `VERSION_CONFLICT` plus current draft ID/version and no private snapshot.

- [ ] **4.2 Write draft/revision/idempotency tests first**

Cover:

- structured omissions without mutation;
- saved sender/client merge and visibly applied default terms;
- complete confirmed new-client proposal retained as a publication diff, not saved yet;
- only `user_provided` and URL-bearing `web_source` inbound provenance;
- strict rejection of unknown root/nested fields;
- revision through optional `draftId + expectedVersion`;
- revision conflict and concurrent revisions where only one wins;
- same idempotency key/same fingerprint replay;
- same key/different normalized input returning `IDEMPOTENCY_CONFLICT`;
- agent-shaped sender/payout fields rejected.

Run the focused tests and observe failures before implementing:

```bash
pnpm vitest run --config vitest.config.ts src/lib/invoices/schemas.test.ts src/lib/invoices/service.test.ts
```

- [ ] **4.3 Reserve exactly one active publication attempt**

The reservation transaction must:

1. Validate workspace ownership, draft state, exact version, complete data, and explicit approval.
2. Apply the idempotency fingerprint rule.
3. Return an existing finalized descriptor for a safe replay.
4. Return `PUBLICATION_IN_PROGRESS` for the same logical active attempt when another non-stale worker owns it.
5. Prevent more than one active attempt for `(workspace_id, invoice_id, version)` with a partial unique index over `reserved | rendering | stored`.
6. Atomically allocate and permanently consume the next sequence number.
7. Generate/store random invoice key, publication salt, invoice access-link token ID/verifier/key version, and attempt ID.
8. Set an immutable, attempt-specific storage key such as `workspace/<workspaceId>/invoice/<invoiceId>/<version>/attempt/<attemptId>.pdf`.
9. Store no raw slug, URL, or signature in attempt/idempotency result JSON.

Transient work remains active/retryable. A lease expiry allows a new worker to increment the fence and recover the same attempt, number, token ID, salt, and storage key. A terminal deterministic failure marks the attempt `failed` and burns its number; a later explicit publication with a new idempotency key may reserve a new attempt/number only after the failed attempt is terminal.

- [ ] **4.4 Implement the fenced publication worker protocol**

Define a document port now; Task 5 supplies the real implementation:

```ts
export interface InvoiceDocumentPort {
  createOrRead(input: {
    storageKey: string;
    canonicalInvoiceJson: string;
    invoiceNumber: string;
    invoiceUrl: string;
    publicationSalt: `0x${string}`;
  }): Promise<{
    bytes: Uint8Array;
    contentType: "application/pdf";
    byteLength: number;
    invoiceDataHash: `0x${string}`;
    pdfContentHash: `0x${string}`;
    documentCommitment: `0x${string}`;
    decodedQrDestination: string;
  }>;
}
```

Task 4 uses a deterministic fake for this port and tests that finalization compares `decodedQrDestination` to the regenerated invoice URL. Task 5 supplies the real implementation that derives this field by decoding the QR from downloaded PDF bytes; callers never pass or assert it.

Worker sequence:

1. Claim an eligible attempt using database time; set `lease_until`; increment/return `fence`.
2. Regenerate the invoice URL from stored token ID/key version and `NEXT_PUBLIC_APP_URL`.
3. Render/upload with create-only semantics, or read the existing attempt object after a crash.
4. Require the port's read-back verification result to include exact bytes, `application/pdf`, byte length, PDF magic, hash, and `decodedQrDestination` exactly equal to the regenerated invoice URL before finalization. Persist the verification facts on the attempt.
5. Transition to `stored` with expected metadata using the claimed fence.
6. In one fenced transaction, freeze the exact version, apply the approved client diff, assign invoice number/key/timestamps, activate the access link, and mark attempt `finalized`.
7. If the fence update affects zero rows, discard local output and return `LEASE_LOST`; never overwrite another worker's result.

No link is externally usable until finalization. An object left by a crash is private and recoverable. The worker route requires timing-safe `CRON_SECRET` bearer authentication; ordinary users trigger the same service inline but do not bypass lease/fence rules.

- [ ] **4.5 Implement void, expiry, exact status, and response reconstruction**

- `void_invoice` requires exact version and explicit approval, is idempotent by fingerprint, and accepts only commercially published invoices with no recorded settlement.
- Voiding sets `commercial_state = voided`, `voided_at`, and revokes invoice access for private details/PDF/new authorization. It cannot revoke an already issued onchain-valid signature.
- Expiry sets `commercial_state = expired` at `now >= payableUntil`; authorization also rejects directly from time if the projection has not run.
- Status uses the pinned `InvoiceStatusResult` exactly.
- Publication and safe retry responses reconstruct invoice/PDF links and `GmailReadyPackage`; persisted descriptors contain no URLs.

Add tests that instantiate a fresh service/keyring against persisted rows and prove retries/status/Gmail links are identical after a simulated process restart.

Implement authenticated server-rendered management views from canonical service/repository projections, not a parallel frontend state model:

- overview: receivables, ordered attention items, setup state only when incomplete, and latest settlement when one exists;
- invoice ledger: one search/filter toolbar, aligned amounts, and distinct commercial/payment columns;
- invoice detail: immutable version facts and safe actions, with lifecycle and payment state kept separate; settlement/receipt proof may remain empty until Task 7 supplies it; and
- creation affordance: `Open Claude` only, with no browser draft or publication form.

The pages must not render raw bearer links by default, expose connector credentials, include private recipient delivery rows beyond the authenticated status contract, or expose authorization signatures. An authenticated explicit Share or Copy action may materialize the current protected invoice/PDF URL on demand; never persist it in the dashboard projection or place it in activity, logs, analytics, screenshots, or evidence. Add desktop/mobile browser assertions for responsive navigation, empty/typical rows, state labels, explicit share behavior, and the absence of Bills/direct authoring.

- [ ] **4.6 Run publication crash/race tests**

Required cases:

- crash before render, after create-only upload, after metadata persistence, and before final transaction;
- stale lease reclaimed with higher fence;
- stale worker unable to finalize;
- two concurrent publication calls create one active attempt;
- permanent failure burns a number and exposes no link;
- stored-byte/hash mismatch blocks finalization;
- a fake-port result with a missing or wrong decoded invoice QR destination blocks finalization;
- no raw URL/slug in idempotency or attempt JSON;
- same/different fingerprint behavior;
- exact expiry boundary;
- status fields and Gmail package exactness.

Run:

```bash
pnpm vitest run --config vitest.config.ts src/lib/invoices src/app/api/invoices src/app/api/jobs/publications
pnpm test:db
pnpm typecheck
git diff --check
git status --short
```

Expected: recovery reuses the same attempt-specific object/number/link, conflicting idempotency is rejected, and publication is not visible before the fake port satisfies every verification field. Task 5 must prove those fields from real stored bytes before the production port replaces the fake.

## Task 5: Immutable PDF, Storage, Protected Routes

**Hours:** 4

**Depends on:** Task 4

**Files:**

- Create: `src/lib/domain/commitment.ts`, `src/lib/domain/commitment.test.ts`
- Create: `src/lib/documents/invoice-view.ts`
- Create: `src/lib/documents/invoice-pdf.tsx`, `src/lib/documents/invoice-pdf.test.tsx`
- Create: `src/lib/documents/invoice-storage.ts`, `src/lib/documents/invoice-storage.integration.test.ts`
- Create: `src/lib/documents/pdf-test-utils.ts`
- Create: `src/lib/documents/private-response.ts`, `src/lib/documents/private-response.test.ts`
- Create: `src/app/invoice/[slug]/page.tsx`
- Create: `src/app/invoice/[slug]/pdf/route.ts`, `src/app/invoice/[slug]/pdf/route.test.ts`
- Create: `src/app/invoice/[slug]/not-found.tsx`
- Create: `tests/e2e/invoice-page.spec.ts`
- Modify: `src/lib/invoices/publication.ts`, `src/lib/invoices/publication-worker.ts`
- Modify: `.env.example`, `src/config/env.ts`, `package.json`, `pnpm-lock.yaml`

**Produces:** One frozen page/PDF representation, actual embedded payment-link QR, commitment over canonical JSON and exact PDF bytes, immutable private storage, and protected routes with byte/header proofs.

- [ ] **5.1 Add document dependencies and commitment tests first**

Add pinned compatible versions of `@react-pdf/renderer`, `qrcode`, QR/PDF decode/raster test tooling, and TypeScript types. The test tooling must decode the QR from the actual rendered PDF page, not from the source QR data URL passed to the renderer.

Pin:

```text
invoiceDataHash = keccak256(UTF8(canonicalInvoiceJson))
pdfContentHash = keccak256(exactStoredPdfBytes)
documentCommitment = keccak256(abi.encode(bytes32 salt, bytes32 invoiceDataHash, bytes32 pdfContentHash))
```

Write the failing commitment vector test before implementation.

- [ ] **5.2 Build one shared immutable view model**

`buildPublishedInvoiceView(frozenVersion)` is the only formatting source for page and PDF. It contains invoice number, dates, exact amount, currency/network label, sender/client snapshot, line items, memo, full payout wallet, and regenerated invoice URL.

The HTML page and PDF must show the same values. The PDF includes a restrained invoice layout, full copyable payout wallet, protected URL, and QR encoding that exact URL. It says generic commercial invoice/payment request and makes no tax/legal-compliance claim.

Use fixed publication facts for PDF metadata so retries do not introduce current timestamps. If renderer bytes still vary, create-only recovery treats already stored bytes as authoritative and finalizes only their verified hash.

- [ ] **5.3 Implement private create-only object storage**

The Task 4 `InvoiceDocumentPort` implementation must:

- upload only to the reserved attempt-specific key with `upsert: false` and content type `application/pdf`;
- when the key already exists, download it instead of overwriting it;
- verify PDF magic, byte length, content type, and computed hash;
- decode the QR from the downloaded PDF bytes, require the exact regenerated invoice URL, and return the exact downloaded bytes/hash plus decoded destination to the fenced worker;
- never create a public/signed Supabase URL and never use a slug in a storage key.

Add integration tests proving second upload cannot overwrite different bytes, a missing/wrong QR fails the port before finalization, the valid decoded destination comes from downloaded bytes, and anonymous list/read/object URL access fails.

- [ ] **5.4 Implement protected invoice and PDF routes**

Both routes parse token ID, verify keyed hash in constant time, enforce expiry/revocation, and load only the link's exact frozen workspace/invoice/version. Unknown, malformed, wrong-purpose, expired, and revoked slugs return indistinguishable 404 behavior.

All protected page and PDF responses include:

```ts
{
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
}
```

Each protected HTML response generates a per-response nonce and sends a CSP equivalent to `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; connect-src 'self' <configured Arc RPC origins>; script-src 'self' 'nonce-<nonce>'; style-src 'self' 'nonce-<nonce>'`. The same nonce is applied only to the required scripts/styles; never use `unsafe-inline` or broaden `connect-src` from request headers.

The PDF route also returns `Content-Type: application/pdf`, `Content-Length` for the exact stored bytes, `X-Payr-Content-Hash: <pdfContentHash>`, safe content disposition using the immutable filename, and no redirect to storage. The bytes served by the route must be the exact stored bytes.

Malformed, unknown, wrong-purpose, expired, and revoked bearer credentials always return the same non-sensitive `404` response. Product copy does not create a distinguishable voided or expired credential response.

- [ ] **5.5 Prove parity, embedded QR, bytes, and responsive behavior**

Tests must:

- parse/rasterize the actual PDF and assert a valid page count;
- decode the QR from the rasterized PDF page and equal the regenerated `NEXT_PUBLIC_APP_URL/invoice/<slug>`;
- compare all material invoice fields from the shared view against extracted PDF text and page rendering;
- fetch the protected PDF route, hash served bytes, and equal the frozen DB `pdfContentHash`;
- assert content type, content disposition, and every private header;
- assert random/wrong-purpose/revoked/expired links expose no details;
- assert app logs/analytics do not contain the raw slug;
- render the HTML page at desktop and mobile Playwright projects without horizontal overflow, clipping, or hidden Pay information.

Also perform one manual 100% raster review for long names, multiline addresses, long line items, and the full wallet.

Run:

```bash
pnpm vitest run --config vitest.config.ts src/lib/domain/commitment.test.ts src/lib/documents src/app/invoice
pnpm test:db
pnpm test:e2e --project=desktop-chromium --grep "protected invoice"
pnpm test:e2e --project=mobile-chromium --grep "protected invoice"
pnpm build
git diff --check
git status --short
```

Expected: actual served bytes and embedded QR prove the frozen artifact; direct bucket access remains denied.

## Task 6: Contract, Testnet Signer, Arc Deployment, Operator Payment

**Hours:** 6

**Depends on:** Tasks 1, 2, 4, and 5

**Files:**

- Create: `contracts/foundry.toml`, `contracts/remappings.txt`
- Create: `contracts/src/PayrSettlement.sol`
- Create: `contracts/test/PayrSettlement.t.sol`
- Create: `contracts/script/DeployPayr.s.sol`
- Create: `contracts/deployments/arc-testnet.json`
- Create: `scripts/export-contract-abi.mjs`, `scripts/verify-deployment.ts`
- Create: `scripts/operator-pay.ts`
- Create: `src/lib/domain/payment-authorization.ts`, `src/lib/domain/payment-authorization.test.ts`
- Create: `src/lib/chain/abi.ts`, `src/lib/chain/abi.test.ts`
- Create: `src/lib/chain/arc.ts`, `src/lib/chain/arc.test.ts`
- Create: `src/lib/chain/signer.ts`, `src/lib/chain/signer.test.ts`
- Create: `src/lib/payments/authorize.ts`, `src/lib/payments/authorize.test.ts`
- Create: `src/app/api/invoice/[slug]/authorize/route.ts`, `src/app/api/invoice/[slug]/authorize/route.test.ts`
- Modify: `.env.example`, `.gitignore`, `src/config/env.ts`
- Modify: `.github/workflows/ci.yml`, `package.json`, `pnpm-lock.yaml`

**Produces:** A tested exact-payment contract, one pinned EIP-712 contract, persisted authorizations, a guarded testnet-only local signer, verified Arc deployment metadata, and one real operator settlement transaction.

- [ ] **6.1 Initialize Foundry safely and write adversarial tests**

If `contracts/` does not exist, initialize without a nested Git repository:

```bash
forge init contracts --force --no-git
forge install OpenZeppelin/openzeppelin-contracts@<pinned-revision> --no-git
```

Do not use a moving OpenZeppelin branch. Write Foundry tests before the contract for:

- exact native value forwarded and zero contract balance;
- event fields exactly matching invoice key, commitment, payer, payee, and amount;
- zero payee/amount, wrong `msg.value`, wrong payee/amount/commitment;
- wrong signer, domain name/version, chain, verifying contract, primary type, and field type/order;
- acceptance exactly at `authorizationValidUntil`, rejection one second after it, rejection when `authorizationValidUntil >= payableUntil`, and rejection exactly at `payableUntil`;
- replay, forwarding failure, and reentrancy.

Run and observe the intended compile/test failure:

```bash
forge test --root contracts -vvv
```

- [ ] **6.2 Implement the minimal immutable-attestor contract**

Pin the complete typed data contract in Solidity and TypeScript:

```ts
const domain = {
  name: "Payr",
  version: "1",
  chainId: VERIFIED_ARC_CHAIN_ID,
  verifyingContract: DEPLOYED_PAYR_CONTRACT,
} as const;

const types = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  PayrPayment: [
    { name: "invoiceKey", type: "bytes32" },
    { name: "documentCommitment", type: "bytes32" },
    { name: "payee", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "authorizationValidUntil", type: "uint64" },
    { name: "payableUntil", type: "uint64" },
  ],
} as const;
```

`payInvoice` takes those six message fields plus signature, requires exact `msg.value`, requires `block.timestamp <= authorizationValidUntil`, `authorizationValidUntil < payableUntil`, and `block.timestamp < payableUntil`, marks the invoice key used before forwarding, forwards all value or reverts, and emits `InvoicePaid`. The contract has no owner, upgrade, withdrawal, escrow, token, receive, or fallback behavior.

Generate the TypeScript ABI from Foundry output with an argv-based subprocess, assert ABI shape, and add Foundry checks to CI.

- [ ] **6.3 Implement persisted authorization before any live signer**

The authorization service:

- resolves a valid invoice bearer link to the exact frozen version;
- requires commercial `published`, no settlement, and `now < payableUntil`;
- sets `issuedAtSecond = floor(now / 1000)` and `authorizationValidUntil = min(issuedAtSecond + 10 minutes, payableUntilSecond - 1)` using integer Unix seconds, then rejects unless the authorization deadline is strictly later than its issue second;
- signs only the chain ID and settlement contract frozen on the published invoice version; a later deployment can be selected only by a future publication;
- builds exactly the pinned domain/types/message;
- calls `PaymentSigner`;
- verifies the returned signature recovers the configured attestor;
- persists authorization ID, workspace/invoice/version, typed-data digest, signature hash, signer mode, issue/expiry, and policy result before returning the signature;
- never treats authorization as settlement and never logs/returns internal policy credentials.

Tests include voided, expired, exact expiry boundary, existing settlement, wrong-purpose link, signer denial, invalid recovered signer, and DB persistence failure. On persistence failure, return no authorization even if signing occurred.

- [ ] **6.4 Implement the guarded testnet signer**

The local signer factory is the committed MVP signer and is allowed only when all are true:

```text
PAYR_SIGNER_MODE=local-testnet
ALLOW_TESTNET_LOCAL_SIGNER=true
configured chain equals verified Arc testnet
environment is not mainnet/production-money mode
```

The key stays in local/Vercel secret storage, the attestor remains unfunded, and the testnet-only mode is visibly disclosed. The signer port remains narrow enough for a later optional adapter, but Task 6 does not install Privy or claim its prize.

- [ ] **6.5 Deploy, read back, simulate, and make one operator payment**

The deployment script asserts chain ID and nonzero selected attestor before broadcast. Write `contracts/deployments/arc-testnet.json` only from receipt/contract read-back and include public chain ID, RPC host only, explorer base, contract, attestor, deployment transaction, block, and bytecode hash. Reject credential-bearing RPC URLs and hand-entered placeholder addresses.

Run:

```bash
forge fmt --root contracts --check
forge test --root contracts -vvv
pnpm tsx scripts/verify-deployment.ts
```

Publish a low-value real fixture invoice, obtain a persisted authorization, simulate the exact call, then use `scripts/operator-pay.ts` with a separately funded external operator EOA to broadcast. The operator payer key is local-only, never a Payr server key, and the script requires an explicit `RUN_LIVE_ARC_PAYMENT=1` guard plus a human-readable payee/amount/chain confirmation.

Read back:

- successful transaction receipt and one matching contract log;
- configured contract/chain and exact event facts;
- contract balance remains zero;
- payee balance delta includes exact invoice value, accounting separately for unrelated gas activity;
- authorization row exists and is not called settlement.

This operator payment is the first live Arc proof. Do not attempt browser-extension automation in Playwright.

- [ ] **6.6 Verify Task 6**

```bash
forge fmt --root contracts --check
forge test --root contracts -vvv
pnpm vitest run --config vitest.config.ts src/lib/domain/payment-authorization.test.ts src/lib/chain src/lib/payments src/app/api/invoice
pnpm test:db
pnpm typecheck
pnpm build
git diff --check
git status --short
```

Expected: local adversarial contract suite is green, deployment is read back, and a public Arc operator transaction proves the guarded local signer. Public documentation states that Privy was not used in the committed MVP.

## Task 7: Reconciliation, Receipts, Durable Outbox

**Hours:** 6

**Depends on:** Tasks 2, 4, 5, and 6

**Files:**

- Create: `src/lib/chain/reconcile.ts`, `src/lib/chain/reconcile.test.ts`
- Create: `src/lib/chain/reconcile.integration.test.ts`
- Create: `src/lib/receipts/service.ts`, `src/lib/receipts/service.test.ts`
- Create: `src/lib/receipts/worker.ts`, `src/lib/receipts/worker.test.ts`
- Create: `src/lib/documents/receipt-view.ts`
- Create: `src/lib/documents/receipt-pdf.tsx`, `src/lib/documents/receipt-pdf.test.tsx`
- Create: `src/lib/email/address.ts`, `src/lib/email/address.test.ts`
- Create: `src/lib/email/receipt.ts`, `src/lib/email/receipt.test.ts`
- Create: `src/lib/email/outbox.ts`, `src/lib/email/outbox.test.ts`
- Create: `src/lib/email/resend.ts`, `src/lib/email/resend.test.ts`
- Create: `src/app/api/reconcile/transaction/route.ts`, `src/app/api/reconcile/transaction/route.test.ts`
- Create: `src/app/api/jobs/reconcile/route.ts`
- Create: `src/app/api/jobs/receipts/route.ts`
- Create: `src/app/api/jobs/outbox/route.ts`
- Create: `src/app/receipt/[slug]/page.tsx`
- Create: `src/app/receipt/[slug]/pdf/route.ts`, `src/app/receipt/[slug]/pdf/route.test.ts`
- Modify: `src/app/(dashboard)/app/page.tsx`, `src/app/(dashboard)/app/invoices/[id]/page.tsx`, `src/app/(dashboard)/app/activity/page.tsx`
- Create: `scripts/run-workers.ts`
- Create: `tests/e2e/receipt.spec.ts`
- Create: `supabase/migrations/202609040004_reconciliation_workers.sql`
- Create/modify: `vercel.json`
- Modify: `.env.example`, `src/config/env.ts`, `package.json`, `pnpm-lock.yaml`

**Produces:** Immediate/backfill event reconciliation, independent immutable settlements, receipt document worker, deterministic protected receipt links, and durable fenced Resend outbox with safe ambiguity handling.

- [ ] **7.1 Write event verification and race tests first**

The same verifier handles a supplied transaction hash and a fetched log. It must prove:

- receipt succeeded on the configured Arc client;
- log address equals the deployed contract and topic decodes as exact `InvoicePaid` ABI;
- invoice key resolves to one exact frozen workspace/invoice/version;
- event commitment, payee, and amount equal that version;
- transaction/log/block facts are fetched from Arc, not trusted from the caller;
- identity `(chain_id, transaction_hash, log_index)` is unique and invoice key cannot bind a different event;
- block timestamp is persisted as the settlement time.

Arc finality for this MVP is deterministic and explicit: one transaction included in a successfully fetched committed block is final. Do not add confirmation-depth waiting, fork tables, rollback jobs, or reorg machinery. Document this Arc-specific assumption and fail closed if the RPC cannot return the committed receipt/block.

Required race tests:

1. Payment event block time is before void, browser callback is lost, invoice is voided, then reconciliation runs: settlement is recorded, display is `Paid`, commercial state remains `voided`, `settledAfterVoid` is `false`.
2. Invoice is voided after an authorization was issued, payment event block time is later than void, then reconciliation runs: settlement is recorded, display is `Paid`, commercial state remains `voided`, `settledAfterVoid` is `true`.
3. Event block time equals `voidedAt`: settlement is recorded and `settledAfterVoid` is `false`.
4. Payment event block time precedes `payableUntil`, reconciliation is delayed until after invoice becomes `expired`: settlement is recorded and display is `Paid`.
5. Authorization/payment at exact expiry is rejected by Task 6 contract/service tests; the reconciler never fabricates an event to cover it.

The repository insertion has no commercial-state predicate. It records every event that passes configured/frozen-fact verification.

- [ ] **7.2 Implement immediate and cursor reconciliation through one verifier**

- `POST /api/reconcile/transaction` accepts only a transaction hash, applies abuse limits, and ignores all supplied payment facts.
- The route may return pending/not-found while RPC propagation completes, but never Paid without an inserted event.
- `GET /api/jobs/reconcile` requires timing-safe `Authorization: Bearer <CRON_SECRET>`, reads bounded ranges from deployment/cursor to latest committed block, calls the same verifier, and advances the cursor only after the complete range succeeds.
- Duplicate invocation returns the same settlement and creates no duplicate receipt-document/email-delivery work.
- A valid event creates settlement, a pending receipt-document row/link token, and deduplicated logical delivery rows transactionally.

If Vercel Cron frequency is insufficient, keep the authenticated route and use `scripts/run-workers.ts`; do not claim unattended operation until a scheduled call is observed.

- [ ] **7.3 Implement receipt document state machine and worker**

State transitions:

```text
pending -> rendering -> ready
rendering -(transient)-> retry_wait -> rendering
pending/rendering/retry_wait -(terminal)-> failed
```

Rows include `lease_until`, `next_attempt_at`, `fence`, `attempt_count`, immutable settlement/version/token identity, and nullable artifact metadata required together only at `ready`.

The receipt worker:

1. claims eligible rows and increments fence;
2. regenerates the receipt page/PDF URL from stored token ID/key version;
3. renders from exact frozen invoice version plus immutable settlement, embedding a receipt QR whose destination is the regenerated receipt page URL;
4. writes/reads a private create-only object;
5. verifies exact stored bytes/hash/content type and decodes the stored PDF QR to prove the exact receipt page URL;
6. marks `ready` only with its fence;
7. schedules bounded exponential backoff on transient failure;
8. cannot mutate a ready receipt.

Receipt page/PDF contains invoice number/version, exact amount, payer/payee, Arc, block time/number, transaction hash/explorer, invoice PDF hash, document commitment, and the same QR destination. It excludes publication salt, contact addresses not needed for display, and all credentials. Protected routes use deterministic receipt slugs and the Task 5 private headers. Page and PDF share `buildReceiptView`; route tests decode the QR from final served HTML and PDF bytes and require the exact receipt page URL.

Apply the same settlement projection to authenticated management surfaces. Overview gains the latest verified-settlement proof region; invoice detail gains transaction, block, payee, commitment, receipt generation, and aggregate delivery progress; Activity gains safely redacted settlement, receipt, and delivery events. Use the strongest approved contrast only after a settlement exists. Never expose recipient addresses on public bearer routes or collapse the retained commercial state into the derived `Paid` display.

- [ ] **7.4 Normalize/deduplicate recipients while retaining roles**

Normalize confirmed issuer/client email addresses deterministically before uniqueness comparison. Store one logical `email_deliveries` row per `(settlement, message_kind, normalized_recipient)`. Store sorted roles separately/on the row, so an identical issuer/client address produces one delivery with `roles: ["issuer", "client"]`, not two messages and not a lost role.

Test case/whitespace normalization, different addresses, identical addresses, invalid frozen email data, and deterministic ordering. Never infer a recipient.

- [ ] **7.5 Implement the fenced durable outbox**

Outbox rows include:

```text
state, lease_until, next_attempt_at, fence, attempt_count,
provider_idempotency_key, first_provider_attempt_at,
provider_request_started_at, ambiguous_since,
provider_message_id, last_error_code
```

Worker protocol:

1. Claim `pending`, due `retry_wait`, or stale `sending`; increment fence and set lease.
2. Do not send until receipt is `ready`; regenerate receipt/invoice links at send time after any process restart.
3. Persist `provider_request_started_at` before calling Resend, then send with the same provider idempotency key for that logical row.
4. On confirmed success, fenced-update to `sent` with provider message ID.
5. On definite transient failure, fenced-update to `retry_wait` with deterministic `next_attempt_at = now + min(30s * 2^attempt, 30m)`. The committed MVP adds no jitter so boundary and recovery behavior stay exact.
6. A stale `sending` row whose provider request may have escaped is ambiguous. Retry automatically with the same key only while `now < first_provider_attempt_at + 24h`.
7. At exactly or beyond that 24-hour boundary, an ambiguous row becomes `manual_review`; never blindly resend it because Resend's idempotency protection may have expired.
8. A permanent provider rejection becomes `failed`. Receipt/settlement remain intact.
9. Every completion/retry update includes the claimed fence. A stale worker cannot mark sent or reschedule.

`GET /api/jobs/receipts` and `GET /api/jobs/outbox` are dedicated CRON-secret routes. `scripts/run-workers.ts` invokes reconcile, receipt, then outbox in dependency order and is the explicit operator fallback. It prints IDs/counts only, never addresses or links.

Tests cover process crash before provider call, ambiguous crash after request marker, stale sending recovery, concurrent claims, lost fence, backoff, retry inside 24 hours, exact 24-hour manual-review boundary, ready-receipt dependency, one normalized recipient/two retained roles, and no duplicate logical row under repeated reconciliation.

- [ ] **7.6 Verify routes, bytes, workers, and one real Resend delivery**

Automated:

```bash
pnpm vitest run --config vitest.config.ts src/lib/chain/reconcile.test.ts src/lib/receipts src/lib/documents/receipt-pdf.test.tsx src/lib/email src/app/api/reconcile src/app/receipt
pnpm test:db
pnpm test:e2e --project=desktop-chromium --grep "receipt"
pnpm test:e2e --project=mobile-chromium --grep "receipt"
pnpm build
```

Live operator proof against the Task 6 settlement:

1. reconcile the same event twice and read one immutable settlement;
2. run receipt worker twice and read one ready artifact with matching served bytes/hash and exact decoded receipt QR destination;
3. run outbox with two confirmed test inboxes, or one row with both roles if addresses normalize identically;
4. read provider message IDs and inspect delivered content/attachment bytes;
5. rerun workers and prove no additional logical row/message is initiated;
6. record whether Vercel Cron was observed; otherwise record operator fallback as active mode.

Receipt email may attach the generated receipt PDF because Resend is Payr-controlled; the excluded Gmail attachment refers only to the initial Claude/Gmail message.

Finish:

```bash
git diff --check
git status --short
```

Expected: settlement is immediate and independent; receipts/email are eventually durable; ambiguous sends older than 24 hours stop for review.

## Task 8: Client Payment UI

**Hours:** 3

**Depends on:** Tasks 5, 6, and 7

**Files:**

- Create: `src/components/providers.tsx`
- Create: `src/lib/chain/wagmi.ts`, `src/lib/chain/wagmi.test.ts`
- Create: `src/components/pay-button.tsx`, `src/components/pay-button.test.tsx`
- Create: `src/components/payment-status.tsx`, `src/components/payment-status.test.tsx`
- Modify: `src/app/invoice/[slug]/page.tsx`
- Create: `src/app/invoice/[slug]/status/route.ts`, `src/app/invoice/[slug]/status/route.test.ts`
- Create: `tests/e2e/payment-page.spec.ts`
- Modify: `.env.example`, `src/config/env.ts`, `package.json`, `pnpm-lock.yaml`

**Produces:** Responsive client-controlled wallet flow that requests persisted authorization, submits exact contract data, invokes existing reconciliation, and displays Paid only from backend status.

- [ ] **8.1 Write no-write and causal-state tests first**

Component tests must prove:

- render/connect does not request authorization or wallet write;
- explicit Pay click obtains one current authorization before one write;
- wrong network offers switch guidance and makes zero authorization/write calls until corrected;
- insufficient native balance for exact invoice value plus estimated gas makes zero wallet writes;
- rejected network switch, authorization failure, expired authorization, wallet rejection, contract revert, and dropped receipt never display Paid;
- transaction hash submission displays `Transaction submitted`, not Paid;
- a successful receipt in a committed Arc block displays `Payment final; syncing receipt` until backend reconciliation records the settlement;
- only status response with non-null settlement displays Paid, including settled-after-void warning.

Use a replaceable wallet/RPC adapter in tests rather than an extension.

- [ ] **8.2 Configure one verified Arc chain and minimal connectors**

Add pinned compatible wagmi/query dependencies. Build chain configuration only from verified env/deployment metadata. Support injected desktop wallets and one tested mobile/deep-link flow, such as Coinbase Wallet, without claiming universal support.

The payment review displays full payee, exact decimal amount, `USDC on Arc`, chain, commercial due date, technical authorization expiry, and estimated gas reserve separately. The QR remains the protected HTTPS invoice URL, never calldata.

Follow the protected-surface rules in `DESIGN.md`: remove dashboard chrome, preserve document hierarchy, keep the exact amount/payee/network visible before every wallet action, and make the server-derived progression explicit. `Transaction submitted`, `Payment final; syncing receipt`, and `Paid` are distinct visual states. The primary payment action remains reachable on mobile without covering invoice facts, errors, or authorization expiry.

- [ ] **8.3 Submit exact authorization and use existing reconciliation**

On explicit Pay:

1. confirm chain and fetch balance/estimate;
2. call `POST /api/invoice/[slug]/authorize`;
3. reject a locally expired response;
4. call the deployed contract with exact signed fields and `value === amountAtomic`;
5. submit only `{ transactionHash }` to the already-built `/api/reconcile/transaction`;
6. poll protected status with bounded backoff;
7. render settlement/receipt/delivery progression from server facts.

The browser never writes a settlement, commercial state, receipt, or email state.

- [ ] **8.4 Verify desktop/mobile failure and success simulations**

```bash
pnpm vitest run --config vitest.config.ts src/components/pay-button.test.tsx src/components/payment-status.test.tsx src/lib/chain/wagmi.test.ts src/app/invoice
pnpm test:e2e --project=desktop-chromium --grep "payment"
pnpm test:e2e --project=mobile-chromium --grep "payment"
pnpm typecheck
pnpm build
git diff --check
git status --short
```

Expected: no-write assertions pass and both viewports are usable. A real external-wallet flow remains a Task 6/10 operator/live proof, not ordinary Playwright extension automation.

## Task 9: MCP And Claude Smoke Test

**Hours:** 2

**Depends on:** Tasks 3, 4, and 7

**Files:**

- Create: `src/lib/mcp/server.ts`, `src/lib/mcp/server.test.ts`
- Create: `src/lib/mcp/transport.ts`, `src/lib/mcp/transport.test.ts`
- Create: `src/app/api/mcp/[token]/route.ts`, `src/app/api/mcp/[token]/route.test.ts`
- Create: `skills/payr-create-invoice/SKILL.md`
- Create: `docs/ops/mcp-claude-smoke.md`
- Inspect/import without changing: `src/lib/invoices/schemas.ts`, `src/lib/invoices/gmail-package.ts`
- Modify: `.env.example`, `src/config/env.ts`, `package.json`, `pnpm-lock.yaml`

**Produces:** A Vercel-compatible stateless Streamable HTTP MCP server exposing exactly four canonical tools, a portable host workflow, and one deployed Claude connector smoke test.

- [ ] **9.1 Add protocol/auth failures first**

With the pinned MCP SDK, test initialize, tool discovery, tool invocation, JSON/schema errors, and stateless request handling. Discovery must return exactly these names:

```text
create_invoice_draft
publish_invoice
get_invoice_status
void_invoice
```

There is no profile, payout, connector-management, revision, email-send, search, or payment tool. Draft revision uses optional `draftId + expectedVersion` on `create_invoice_draft`.

Run the complete connector auth/lifecycle matrix against the endpoint:

- valid fixed-scope token;
- malformed/unknown token with non-revealing denial;
- exact expiry boundary;
- revoked token;
- independent DB-backed per-token and per-IP rate-limit exhaustion and recovery;
- token from workspace A cannot read/mutate workspace B IDs;
- every audit row has token ID but no raw token/path/body/slug;
- publish/void require their canonical explicit approval fields;
- response reconstruction after a new server instance returns the same links.

- [ ] **9.2 Implement stateless Streamable HTTP for Vercel**

Each request authenticates the URL token, atomically consumes both its token and purpose-keyed normalized-IP DB rate-limit allowances, creates a request-scoped MCP server/Streamable HTTP transport with no in-memory session registry, handles the request, and closes it. Do not depend on process affinity, a global connection map, local disk, SSE resume state, or an in-memory token bucket.

Use the SDK's stateless Streamable HTTP mode supported by the installed version, with server-generated session IDs disabled. Reject unsupported GET/session-resume behavior explicitly unless required by the verified Claude client. Keep secrets out of route errors and framework logs.

Each tool is a thin adapter over canonical services and returns their exact schemas. `get_invoice_status` returns the pinned complete status. Publication returns regenerated links plus the exact `gmailLinkPackage`. Tool descriptions state:

- missing fields cause no mutation;
- inbound proposed provenance is only confirmed `user_provided` or URL-bearing `web_source`;
- the host may perform search, but Payr does not;
- publication and Gmail sending require separate approvals;
- only reconciliation-derived settlement displays Paid.

- [ ] **9.3 Write the portable skill and deploy latest code**

`skills/payr-create-invoice/SKILL.md` describes the four-tool finite workflow: gather, draft, ask for structured missing fields, revise through `create_invoice_draft`, show exact preview/defaults/client diff, ask publication approval, publish, present links/Gmail package, and query status. It must not grant profile/payout authority or claim that a chat approval is cryptographic authorization.

Deploy the current application to Vercel. Set `NEXT_PUBLIC_APP_URL` to the healthy custom domain, or to the verified Vercel hostname if custom DNS/TLS remains pending, then redeploy so generated links use that origin.

- [ ] **9.4 Run local protocol and deployed Claude smoke**

```bash
pnpm vitest run --config vitest.config.ts src/lib/mcp src/app/api/mcp
pnpm test:db
pnpm typecheck
pnpm build
pnpm exec vercel deploy
```

In Claude, use a fresh short-lived demo connector and prove initialize/discovery, structured missing fields, complete draft, revision using the same tool, explicit publication, exact status, and void on a separate unpaid fixture. Revoke/rotate the token after the test and confirm subsequent denial. Record redacted outcomes, not the connector URL.

Do not spend Task 9's committed budget on Gmail execution, attachment, or host web search. After every core acceptance criterion passes early, a separately approved link-only Gmail send using `gmailLinkPackage` may be smoke-tested outside the 44-hour schedule; it cannot block MCP acceptance.

Finish:

```bash
git diff --check
git status --short
```

## Task 10: Production Proof, Documentation, Rehearsal, Contingency

**Hours:** 6, split into 4 hours planned release work plus 2 hours reserved contingency

**Depends on:** Tasks 1-9

**Files:**

- Create: `tests/live/arc-settlement.live.ts`
- Create: `tests/live/resend-receipt.live.ts`
- Create: `tests/live/claude-connector-checklist.md`
- Create: `docs/architecture.md`
- Create: `docs/ops/demo-runbook.md`
- Create: `docs/ops/production-checklist.md`
- Create: `docs/ops/verification-evidence.md`
- Modify: `README.md`, `STATUS.md`
- Modify: `PROJECT.md` only if implementation forced an explicitly approved product-boundary correction
- Modify: `.env.example`, `vercel.json`, `.github/workflows/ci.yml`, `package.json`, `pnpm-lock.yaml` only if final verified behavior requires it
- External only: Supabase/Vercel/Resend/Claude/DNS configuration; never store secrets in Git

**Produces:** Production-like deployed proof, one real external-wallet journey, complete redacted evidence, consistent public docs, two timed rehearsals, and protected contingency.

### Planned Release Work: 4 Hours

- [ ] **10.1 Apply infrastructure in dependency order and read it back**

1. Recheck the Task 1 preflight and exact ETHOnline cutoff.
2. Apply all Supabase migrations to the intended project.
3. Read back constraints/functions/privileges, private bucket configuration, and anonymous denial.
4. Configure Vercel environment variables by environment without printing them.
5. Deploy and verify health, dashboard auth, protected routes, job auth, and MCP.
6. Complete `payrlink.xyz` DNS/TLS if ready; otherwise use the verified Vercel hostname and set `NEXT_PUBLIC_APP_URL` accordingly.
7. Complete/read back Resend SPF/DKIM and sender verification. If not verified, do not claim branded delivery; use an allowed verified sender or mark live email blocked.
8. Observe at least one scheduled worker invocation or declare the operator script as the active demo fallback.

Use a secret-pattern scan that reports file names/rule IDs without printing matched secret values. Confirm no `.env`, private key, connector token/path, raw invoice/receipt slug, service key, Privy credential, or Resend key is tracked.

- [ ] **10.2 Run the canonical automated release suite**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm test:db
pnpm build
pnpm test:e2e --project=desktop-chromium
pnpm test:e2e --project=mobile-chromium
forge fmt --root contracts --check
forge test --root contracts -vvv
```

Then read the GitHub Actions `web`, `database`, and `browser` jobs. A local pass does not substitute for a red CI job.

- [ ] **10.3 Execute one explicit live operator proof**

Live tests are opt-in and require guards such as `RUN_LIVE_ARC_PAYMENT=1` and `RUN_LIVE_RESEND=1`. They must not run under `pnpm test`, CI pull requests, or Playwright.

Use a unique fixture and perform:

1. wallet login and confirmed sender/client setup;
2. deployed Claude instruction: `Invoice Circle 1,000 USDC for building the frontend website`;
3. saved terms visible in draft and one draft revision;
4. publication plus same-key retry returning same number/hash/regenerated links;
5. page/PDF parity, served-byte hash, content type/private headers, and actual embedded QR decode;
6. persisted short-lived payment authorization;
7. a real client-controlled external-wallet Arc transaction, run manually/operator-live rather than through Playwright extension automation;
8. event reconciliation through both immediate and backfill-safe path;
9. status `commercialState`, `paymentStatus`, `displayStatus: Paid`, settlement/explorer facts, `settledAfterVoid`, receipt state, and delivery states;
10. receipt page/PDF exact bytes/hash and Resend provider IDs for normalized recipients;
11. Claude status readback.

Store only public/redacted evidence: deployment origin, invoice number, artifact hashes, public contract/attestor mode, transaction hash, block/log index, receipt hash, provider message IDs, timestamps, and screenshots with bearer credentials/private addresses redacted. Never store the invoice/receipt URL itself.

- [ ] **10.4 Finish docs and rehearse twice**

`README.md`, `DESIGN.md`, and `docs/architecture.md` must match deployed behavior: freelancer is primary user, client controls payment, commercial state is independent, settlement is event-backed, documents are private/offchain, selected signer mode is honest, and Arc testnet/native-USDC limitations are explicit. Re-run the design-system documentation pass after implementation so `DESIGN.md` records actual tokens/components rather than an unverified seed.

`docs/ops/demo-runbook.md` includes:

- three-minute path with Gmail/search bypassed by default;
- exact operator commands with no embedded secrets;
- Vercel-hostname fallback;
- worker operator fallback;
- previously settled real Arc transaction and artifact evidence;
- clear labeling for prerecorded fallback material;
- token rotation/revocation immediately after demo.

Rehearse the primary path twice under three minutes. Use one pre-funded payer and never depend on a faucet. Keep one prior real settlement/receipt/Resend proof for provider outages.

Capture authenticated overview, invoice ledger/detail, protected payment, and receipt surfaces at desktop and mobile widths. Verify them against `DESIGN.md` for hierarchy, responsive behavior, keyboard focus, contrast, state language, agent-first creation, and the absence of Bills. Fix functional clarity and accessibility defects before rehearsal; visual embellishment never consumes contingency.

### Reserved Contingency: 2 Hours

- [ ] **10.5 Protect and spend contingency only on core blockers**

Reserve the final two hours. Do not pre-allocate them to visual polish, Gmail, search, Bazantic, sponsor extras, refactors, or attachment work.

Use contingency in this priority order only:

1. Arc contract/payment/reconciliation correctness;
2. publication/document integrity or protected-route security;
3. receipt/outbox recovery and live Resend proof;
4. Vercel/Supabase deployment blockers and hostname fallback;
5. MCP/Claude core connector failure;
6. acceptance evidence or rehearsal blocker.

At the start of the contingency window, freeze feature scope. If no blocker remains, use the time for another core rehearsal, backup evidence, token rotation, and rest; do not pull excluded enhancements into scope.

- [ ] **10.6 Final release-tranche verification**

```bash
git diff --check
git status --short --branch
```

Inspect every modified/untracked path. Confirm the tracked `assets/brand/` references are preserved and no unrelated paths enter the integration branch. Finish through the versioned PR and merge-tag flow in the orchestration and versioning runbooks.

## Final Acceptance Matrix

Each core criterion appears exactly once below. A row is green only from the listed proof, not from planned work or mocks alone.

| ID | Core criterion | Implemented by | Required proof |
| --- | --- | --- | --- |
| C1 | A deployed Claude custom connector discovers Payr tools | Task 9 | Redacted deployed Claude initialize plus exact four-tool discovery |
| C2 | One instruction creates a complete draft from confirmed profiles and visibly applies saved terms | Tasks 3, 4, 9 | Claude draft result showing profile selection, preview, and applied default |
| C3 | Missing fields do not mutate; unconfirmed changes and URL-less web provenance are rejected | Task 4 | Unit/API/DB mutation-count and strict provenance tests |
| C4 | Explicit publication allocates one immutable number/version and safe retry returns the same reconstructed artifacts | Tasks 2, 4 | Concurrency, fingerprint, crash recovery, restart-link, and frozen-row tests |
| C5 | Protected invoice page/PDF/hash/QR represent the same immutable invoice and URL | Task 5 | Page/PDF parity, served-byte hash, content type/headers, and actual embedded QR decode |
| C6 | Pay Now persists a short-lived authorization and refuses voided/expired/settled invoices | Task 6 | Boundary/API/DB tests and a recovered guarded-local-signer signature |
| C7 | A real external wallet settles exact native USDC through the deployed Arc contract | Tasks 6, 10 | Public operator/live transaction, event, zero contract balance, and payee delta |
| C8 | Contract enforces authorization and payable boundaries, rejects wrong value/overlong authorization/replay, and accepts only through the short authorization boundary | Task 6 | Green Foundry adversarial suite against pinned EIP-712 contract |
| C9 | Only a verified configured event creates settlement and derived Paid status | Task 7 | Forged-input denial, immutable event row, both void/payment race orders, and delayed-after-expiry reconciliation |
| C10 | Payr creates a separate immutable receipt page/PDF from exact invoice version and event | Task 7 | Fenced receipt worker tests plus protected served-byte/hash proof |
| C11 | Payr creates one durable logical Resend delivery per normalized recipient while retaining party roles | Task 7 | Dedupe/roles tests, provider IDs, retries, fencing, and ambiguous-over-24h manual review |
| C12 | Claude status returns commercial/display state, settlement/explorer, receipt, delivery, and settled-after-void facts | Tasks 4, 7, 9 | Exact-schema contract test and deployed Claude status result |
| C13 | Private invoice content stays out of calldata/events and direct storage/table access is denied | Tasks 2, 5, 6 | Calldata/event inspection, salted commitment, direct RPC/table/object denial tests |
| C14 | Production lint, typecheck, unit, DB integration, desktop/mobile browser, build, and Foundry suites pass | Tasks 1, 10 | Local commands and green separate Supabase CI job plus other CI jobs |
| C15 | Core live path fits under three minutes without Gmail or search | Task 10 | Two timed rehearsals with bypass-first runbook and real prior fallback |
| C16 | Repository, architecture, demo, and submission tell the same implemented product story | Task 10 | Final README/architecture/runbook/evidence review against deployment |
| C17 | The authenticated console and protected payment/receipt surfaces implement `Commit Ledger`, remain agent-first, separate commercial/payment state, and expose neither direct web authoring nor Bills | Tasks 3, 4, 7, 8, 10 | Desktop/mobile screenshots, browser assertions, keyboard/contrast checks, and final `DESIGN.md` reconciliation |

## Separate Enhancement Status

These are not core acceptance criteria and consume none of the committed 44 hours unless all assigned core work finishes early inside its existing task timebox:

| Enhancement | Committed implementation? | Evidence rule |
| --- | --- | --- |
| Claude Gmail link-only initial send | No; optional only after all core acceptance passes early | Claim only from one separately approved live Gmail send using the exact `gmailLinkPackage` |
| Host-agent web search for public client fields | No | The API accepts confirmed URL-bearing `web_source`; do not claim search integration without a separate live proof |
| Gmail PDF attachment | No | Explicitly excluded; the package has no attachment field |
| Privy signer adapter and prize claim | No | Claim only after the one-hour live wire-shape, same-shape-deny, recovered-signature, and contract-simulation gate passes |
| Bazantic | No | Explicitly excluded from this plan and sponsor claims |
| Incoming Bills | No | Future incoming-request concept only; hide it from MVP navigation and do not implement batch or autonomous payment |

The optional Privy spike starts only after every core acceptance criterion passes early and is capped at one hour outside the committed 44 hours. If attempted, add `scripts/privy-policy-spike.ts` and `docs/ops/privy-signer-evidence.md`, capture the credential-redacted actual SDK wire shape, and require: one valid pinned `PayrPayment` signature that recovers the Privy wallet, one same-shape policy denial for a supported constraint, and local contract verification/simulation. Also test a forbidden signing method when supported. If any gate fails or remains unknown at 60 minutes, stop, retain the guarded local signer, remove Privy claims, and never loosen policy to save the integration.

## Final Stop Conditions

- Never fake Arc, Privy, Resend, Vercel, Supabase, Claude, DNS, wallet, or email evidence.
- Stop sponsor polish when a money/state/security gate is red.
- A frontend callback, submitted hash, authorization row, contract simulation, or provider request is never settlement.
- A settlement remains recorded even if commercial state is voided/expired; expose the race facts instead of deleting or rewriting history.
- A failed/ambiguous email never rolls back settlement or receipt, and an ambiguous send outside Resend's 24-hour idempotency window never retries automatically.
- A raw protected URL may be returned to the authorized caller but is never persisted in result JSON, database rows, app logs, analytics, docs, screenshots, or evidence.
- The declared URL-path connector credential is rotated after every live demo and replaced with OAuth only post-MVP.
