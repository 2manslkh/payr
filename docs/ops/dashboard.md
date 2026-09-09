# Dashboard and Agent Installation

## Deployment

This is retained follow-up work, not included in released `v1.3.0`. On a fresh/disposable database, apply `supabase/migrations/202609080003_dashboard_overview.sql` after the released migrations and before deploying the updated dashboard. It adds the service-role-only `payr_get_invoice_overview_v2` RPC; v1 remains unchanged for already deployed callers with strict response validation.

**Retained local database boundary (9 September):** a read-only query of `supabase_db_payr` found migrations `202609040001` through `202609040007`, plus `202609080001` named `dashboard_overview`. Released `202609080001` instead means `publication_fairness`, followed by `202609080002_receipt_retry_jitter.sql`. Cleanup renamed only the dashboard source to `202609080003`, retaining its SQL bytes; it did not alter migration history or data.

Do not run `db:reset`, fixture suites, or blind migration application against that retained database. Before an approved forward reconciliation, back up its data/history, verify the installed dashboard function matches the retained SQL, repair only its migration-version record to the unique dashboard version, and apply/read back missing released migrations in reviewed order. Do not mark publication fairness applied merely because its version number is present. Hosted migration history requires independent read-back; local evidence does not establish it.

**Approved migration read-back (9 September 2026):** the preceding collision is historical, not the current migration state. During preparation, another process changed the local database; the guarded history repair refused to run. The user explicitly chose to use the current local database rather than restore the earlier backup. A fresh backup and dry run preceded application of `202609080003_dashboard_overview.sql` locally. The remote target was independently verified as Payr project `grutkfsoekcpwdksgasm`; its missing `202609080001_publication_fairness.sql`, `202609080002_receipt_retry_jitter.sql`, and `202609080003_dashboard_overview.sql` were backed up, dry-run, and applied using the explicit project ref and `--skip-vault`.

Both histories now contain all eleven repository migrations with matching names. Read-back verified publication fairness, retry jitter, receipt-worker availability, the dashboard snapshot function, and restricted helper/dashboard grants. Pre/post application counts were unchanged: local 67 workspaces, 153 invoices, 25 settlements, 25 receipts, 46 deliveries; remote 3 workspaces, 3 invoices, 2 settlements, 2 receipts, 3 deliveries. This operation performed no reset, seed, fixture suite, queue processing, email send, or payment, and did not deploy application code. Backups remain outside the repository in the operator session's private `payr-migrations-pss9xM` directory.

Outstanding count and value use unpaid published or expired invoices across the entire workspace, not the capped attention list. Counts, attention, setup, and proof share one database snapshot. Drafts, voids, and recorded settlements are excluded. Missing legacy amounts are counted separately and displayed as an incomplete total. Onchain payments remain outstanding until reconciliation records their settlement. Invoice reads stream behind their own Suspense boundary, so a delayed database does not block the wallet.

## Wallet Balance

The root-updates release adds forward migration `202609090010_root_dashboard_hardening.sql`. Apply it after the existing dashboard and sender migrations before deploying this candidate; never edit the historically applied dashboard SQL. It preserves the v2 overview response and single-statement snapshot while treating unset/default terms outside 0-365 as incomplete sender setup. The historical eleven-migration read-back above does not establish hosted application of this new migration.

`GET /api/wallet/balance?address=<selected-address>` requires the existing owner session. The selected address may differ from the owner, but never changes the invoice workspace or grants ownership. The browser discovers authorized injected accounts with `eth_accounts` and requests permissions only on a Connect click. This matches the existing browser-wallet login scope; it does not add WalletConnect login.

The reader requires only existing `ARC_RPC_URL` (HTTPS) and `ARC_CHAIN_ID=5042002` configuration, plus the existing session configuration. The RPC endpoint remains server-side. It validates the RPC chain and reads Arc's native USDC balance at **18 decimals**, with no signing or payment configuration. It does not use the six-decimal ERC-20 interface or combine the two representations. Failures return a safe 503, never an assumed zero.

Balances refresh on selected-account/network changes, window focus, visibility restoration, and manual refresh. Old account requests are aborted and ignored. The response is private/no-store; the UI labels its last successful read. The selected wallet's current network does not force a chain switch: this surface always reads Arc Testnet.

Before any provider call, a service-role-only admission RPC rechecks workspace ownership and atomically enforces fixed-minute quotas: 12 requests per owner, 60 per IP, 600 globally. Selected addresses never choose quota identity or authorization. Only Vercel's overwritten forwarding header is trusted; other runtimes share a conservative IP bucket. The IP key is purpose-separated HMAC using the existing connector pepper. Admission timeout or malformed/unavailable admission fails closed with 503; quota denial returns 429 and `Retry-After: 60`. Each allowed request performs at most two parallel upstream calls, no retries, with eight-second transport timeouts. Fixed-minute limits allow a boundary burst; this is bounded admission, not a strict concurrent-connection counter. The counter table denies direct access to all API roles and cleans stale subject keys during successful admission.

Without JavaScript, server HTML explains that browser-wallet reads require JavaScript and no balance is assumed. No wallet permission or signature is requested during server rendering.

The default overview streams records independently of the wallet. A no-JavaScript link outside its streaming boundary opens `/app?view=static`, which waits for the same authorized overview read and renders records without Suspense reveal scripts. The non-streaming option changes rendering only, not workspace authority or query scope. Provider abort deadlines remain active through response-body consumption and cancel outstanding calls on completion or failure.

## Plugin Handoff

`/install` is public and deliberately passes `installation={null}` to `InstallPrompt` until the separate plugin work is ready. To enable it, replace that value with reviewed public metadata containing the exact prompt, official source URL, and verified supported-agent list. Do not derive it from connector credentials or infer readiness from active tokens.

The prompt must identify the real distribution, preserve existing agent configuration, request approval before configuration changes, keep authentication separate, and verify installation through discovery/read-only operations. No private keys, seed phrases, session cookies, or token-bearing URLs belong in it. Do not claim installation is working until the supported client flow has been tested.

## Verification

- `pnpm test:unit` covers exact metric animation, reduced motion, stale wallet requests, independent errors, and install clipboard/availability states.
- `pnpm test:db:local src/lib/db/drafts.integration.test.ts` covers full-workspace counts, missing legacy amounts, settlement removal, authorization, and RPC grants. This suite resets fixtures in the isolated local stack; do not run it alongside browser tests.
- `PAYR_TEST_PORT=3100 pnpm test:e2e tests/e2e/dashboard-invoices.spec.ts tests/e2e/install.spec.ts --workers=1` covers desktop and mobile. Fixtures and balance responses are synthetic; screenshots are not evidence of live wallet funds or a working plugin.
