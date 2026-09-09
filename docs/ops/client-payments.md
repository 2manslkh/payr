# Client Invoice Payments

Historical 7 September slice, retained during the 9 September root cleanup. R08 workers and R09 client-payment/MCP integration are now released; the implementation exclusions and deployment below describe this earlier slice only. Use [R09 release](r09-release.md) for current production/CI evidence and live acceptance limits, including the later approved conditional WalletConnect CSP.

## Scope

The user-approved payment slice adds injected-wallet and WalletConnect payment, server-side settlement verification, protected polling, and cursor recovery. It preserves existing invoice URLs, frozen PDF bytes, payees, amounts, and contract bindings. It does not implement MCP, receipt rendering, or receipt-email workers, and is not a completed R08/R09 release.

Unpaid invoices display wallet connection choices followed by `Pay Invoice (<amount> USDC)`. The client confirms the transaction in their own wallet. The application calls the deployed settlement contract, not a direct-transfer or ERC-20 approval path. Connecting or rendering does not request payment authorization or initiate a transaction.

## Configuration

- Network: Arc Testnet `5042002`, native USDC at 18 decimals.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: the user-supplied Reown project, configured in Vercel Production. The project ID is public; it is not a wallet or signing secret.
- `PAYR_RECONCILIATION_START_BLOCK=60849043`: the earliest selected deployment block. Retained contracts must be covered by this lower bound when adding deployments.
- Existing signer opt-in, attestor, trusted contract, link-key, Supabase and canonical-origin settings remain unchanged.
- Migrations `202609040006_payment_reconciliation.sql` and `202609040007_reconciliation_positions.sql` add service-only target lookup and recovery positions. They were applied without reset or seed data to local and hosted databases.

## Safety Boundaries

- The browser verifies the authorization schema, domain, frozen invoice key/commitment/payee/amount/deadline, and recovered attestor. It checks current account/chain, simulates the exact call, and checks invoice value plus an estimated gas reserve before asking the wallet to send.
- Wallet fees remain user-controlled. The reserve is an estimate, not a promise of exact transaction cost.
- Double clicks are locked. Expired authorization, wrong network, insufficient funds, account changes and failed simulation make no wallet write.
- A transaction hash is not Paid. Only the protected server status with matching immutable settlement facts displays Paid.
- Submitted public hashes and chain-observed sender/nonce recovery context may be kept in session storage; bearer URLs and authorization signatures are not stored there.
- Reverted transactions require an explicit review/retry action. Timeouts never unlock payment. Confirmed replacements are located using the original chain-observed sender/nonce and are independently checked by the server.
- The installed WalletConnect SDK cannot truly abort an outstanding pairing. Dismissing its QR holds the connection lock until the wallet request completes/expires, and late approvals are disconnected. Failed disconnection keeps payment locked until the user disconnects successfully.

## Privacy And Browser Compatibility

The stock AppKit modal is not used: its mandatory telemetry can include `window.location.href`, which is inappropriate on a bearer URL. Payr renders a local QR dialog and provides a MetaMask mobile handoff. SDK metadata contains only the public origin and public icon URL; telemetry is disabled.

CSP keeps nonce-protected scripts/styles and `no-referrer`. Only the WalletConnect relay and verification origins are added; Pulse/analytics endpoints and external QR services are not allowed. Same-origin Next lazy chunks use the existing `script-src 'self'` allowance. Inline scripts still require a nonce.

Wallet providers initialize client-side only. Constructing the provider during SSR caused IndexedDB errors and an empty connector state in production. Zod's browser schemas use `jitless` mode to avoid an eval capability probe under CSP.

Dependencies pin Wagmi `2.19.5`, React Query `5.102.8`, and Pino `10.3.1`. The WalletConnect logger override retains the maintained Pino version. A silent adapter provides the callable `bindings()` API expected by WalletConnect while preserving Pino's internal browser binding objects; without it, actual connection failed before reaching the relay. The adapter drops log messages and avoids the SDK's default buffered trace logger. Transitive connector packages have deprecation/peer warnings; a future dependency upgrade requires repeating the privacy, CSP, SSR and live pairing checks.

## Server Verification And Recovery

- `POST /api/reconcile/transaction` accepts only `{ transactionHash }`, uses database-backed abuse admission, and returns a redacted outcome.
- One verifier fetches a successful receipt and its committed block from the configured Arc RPC. It verifies event address/topic, transaction/log/block identities, frozen invoice key/version, amount, payee, commitment and payable deadline before calling the existing idempotent settlement RPC.
- Valid events remain recordable after offchain void or expiry. Commercial state is not overwritten; block time determines the settled-after-void flag.
- Settlement insertion atomically creates pending receipt/delivery work, as already required by the schema. No ready receipt or sent receipt email is fabricated.
- `GET /invoice/[slug]/status` reuses bearer admission and the canonical public status projection. It excludes internal IDs and delivery recipients.
- `GET /api/jobs/reconcile` requires the existing timing-safe cron credential. Recovery preserves event identity across RPC reads and checkpoints `(block, next log index)` after each event with compare-and-set semantics. Dense blocks can resume across calls. A missing or contradictory receipt never advances the cursor.
- The job is bounded by ranges, an event budget and elapsed time. `vercel.json` declares a daily fallback cron; immediate browser callbacks are the primary path. This is not a claim of minute-level background recovery. The authenticated job was exercised manually; a scheduler-driven invocation has not yet been observed.

## Verification Evidence

Observed on 7 September 2026 (UTC):

- Production deployment `dpl_Ca4HVwzLKvvVAT1EkSbMFD6N1hy9` is Ready and assigned to `https://payrlink.xyz`. It is a working-tree deployment, not a tagged release.
- The actual supplied WalletConnect project generated a pairing QR on desktop and mobile Chromium. Connection did not request an authorization. Observed external origins were `wss://relay.walletconnect.org` and `https://verify.walletconnect.org`, with no protected URL found in outgoing requests. No pairing was approved by a wallet during these smoke checks.
- The deployed authorization endpoint returned a cryptographically valid signature matching the frozen demo invoice. A subsequent read-only simulation reported `AlreadyPaid`, revealing an existing onchain payment not yet recorded in the application.
- The authenticated recovery job then processed one existing event across nine ranges. The invoice became Paid. Replaying the known transaction through the immediate reconciliation endpoint returned `verified` without duplicating the payment.
- Existing payment: [`0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f`](https://testnet.arcscan.app/tx/0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f). This implementation session did not broadcast that transaction or any other payer transaction.
- The existing invoice renders server-verified Paid on desktop and mobile. Its PDF remains 18,795 bytes with the same frozen hash. No invoice or receipt email was sent by this payment implementation.
- Automated gates cover 46 desktop/mobile browser regressions, exact-value simulated wallet submission, no-write failures, server-only Paid, late pairing approval, QR races, reverts, nonce replacements, contradictory RPC receipts, dense recovery, and non-destructive database target/privilege/CAS tests. A real external wallet's final payment approval remains an operator step; viewport tests and pairing QR generation do not claim universal wallet compatibility.
- Final local verification passed: `pnpm verify` (lint, typecheck, 1,740 unit tests with 13 skipped, 10 release-tool tests, build, and 35 compiled-document checks), all 46 browser regressions, and all three focused non-destructive reconciliation database tests. Independent server and client security/correctness reviews were repaired and re-reviewed with no remaining medium/high findings reported. Temporary diagnostic scripts and logging were removed; `git diff --check` passed.

Keep actual bearer links, environment secrets and pairing URIs out of repository evidence. The original local demo was preserved; the new database integration tests add isolated records and do not truncate it.
