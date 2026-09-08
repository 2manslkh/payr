# R07 Settlement Authorization

Release update, 8 September 2026: R07 was released as annotated `v0.6.0` at `0d122231b0252f587a59868022b65dea83f6d525` in [PR #8](https://github.com/2manslkh/payr/pull/8), with successful post-merge CI. The completion/deployment observations below retain their original dates; statements that R07 was uncommitted or unreleased describe that earlier checkpoint. Later client-payment/reconciliation work is separate from this R07 evidence. Current review fixes are documented in [review-fixes.md](review-fixes.md).

## Scope

R07 adds the immutable Arc native-USDC settlement contract, EIP-712 authorization, a guarded local testnet signer, the protected authorization API, and manual operator deployment/payment tooling. R08 still owns reconciliation, receipts, and delivery; R09 owns browser payment and Claude MCP. Authorization never marks an invoice paid.

R07 implementation and its live operator-payment gate are complete. The settlement contract, repaired hosted authorization endpoint, one explicitly approved real testnet invoice payment, and its authorization-row read-back are verified below. Browser wallet payment, product reconciliation, receipts, and durable delivery are not claimed by R07. Privy is not installed or used and no Privy policy/prize claim is made. Release preparation targets `v0.6.0`; the protected merged PR, annotated tag, and post-merge checks are the authoritative release read-back. Historical working-tree evidence below predates that release.

## Completion Evidence

Verified on 7 September 2026 after the user requested completion and separately approved this exact payment:

- Invoice: `DEMO-2026-000001`, exactly `1 USDC` on Arc Testnet, chain `5042002`.
- Payer: `0x26a39136c8aed8ac6dad4959bed6e90e93204e45`; payee: `0x67838b890a2ced4d5175535b2da54985bc16ac29`.
- Payment: [`0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f`](https://testnet.arcscan.app/tx/0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f), successful at block `60875360`, `2026-09-07T07:27:40Z`. The sole configured-contract `InvoicePaid` event is log `507`; the receipt also contains two native-USDC system logs, which are not Payr settlement events.
- Verified the exact invoice key, commitment, payer, payee, amount, transaction input/hash/nonce, and canonical block identity. Payee balance increased by exactly `1 USDC`; contract and attestor balances remain zero. Actual gas cost: `0.00150551453184 USDC`, below the approved `0.1 USDC` maximum. Payer balance after payment: `18.99849448546816 USDC`.
- Independently read the authorization row through hosted service-only database access, scoped to its ID/workspace/invoice. Its typed-data digest and signature hash match the mined calldata; frozen facts, recovered attestor, `local-testnet` mode, `allowed:testnet-only` policy, and bounded deadlines match. The row existed before the payment and the authorization was valid at the payment block. No signature or bearer is recorded in this document.
- The first terminal launcher failed before starting the operator script and before any broadcast. The subsequent actual operator invocation broadcast once but stopped during immediate post-broadcast verification. The precise transient failure was not captured; do not label it a proven RPC timeout. Read-only recovery independently succeeded, including the actual `--recover` CLI with only public RPC/contract environment variables and no payer/attestor private key. No second transaction was submitted.
- Retain the owner-readable, secret-free recovery journal at `.worktrees/r07-finish/.operator-payment.json`. It is excluded from Git and deployment. Never delete an unresolved journal or rerun this already-paid fixture.
- Hosted read-back after payment still found zero `settlements` rows for this invoice. This is expected before R08 reconciliation, not a reason to pay again. No receipt or receipt email was generated, and no new invoice email was sent.

### Isolated Application Deployment

The shared root was receiving concurrent R08/R09 changes. A coordinator-only snapshot under `.worktrees/r07-finish`, based on `4decffbf6bf48ec0983b0e2c35fa1d43c2fd791d`, included only R07 authorization/chain/operator files, their tests, contract CI/dependencies, and the existing PDF trace repair. It excluded the new reconciliation routes/migration/cron, browser-payment UI, and wallet dependencies. No environment file was copied into the snapshot and no shared-root changes were reverted. This was packaging isolation, not implementation-agent fanout.

Vercel deployment `dpl_Em186jttjVwZWFxLA4ukZKdPJrLo` was independently inspected as `Ready` and aliased to `https://payrlink.xyz` and `https://payr-sandy.vercel.app`. The authorization endpoint changed from observed HTTP `400` before deployment to HTTP `200` with private/no-store headers afterward. Health, protected invoice HTML, and PDF returned `200` after payment; the PDF remained exactly 18,795 bytes and matched its frozen hash. No contract redeployment, database migration, credential replacement, or release/tag was performed.

### Repair Verification

- Fixed the Next Node adapter's zero-byte POST stream being mistaken for a submitted payload. Tests cover the installed adapter, an actual HTTP request, immediate rejection/cancellation on the first byte, a five-second body deadline, and redacted stream failures.
- Operator submission now prepares/signs locally, calculates the public transaction hash, exclusively creates a `0600` journal, and synchronizes both file and parent directory before broadcast. The journal stores no private key, signature, raw signed transaction, or protected URL. Existing journals block another submission; `--recover` is read-only and needs no payer key.
- Recovery checks canonical payment-block identity before and after balance reads, alongside transaction, event, pre-payment block, and balance evidence. Tests cover accepted-but-timeout broadcast, competing invocations, corrupt journals, persistence/sync failures, deferred synchronization, wrong facts, pending/reverted transactions, reorgs, concurrent balances, and the gas cap.
- Split the contract deadline tests into equality, strictly-overlong authorization, and payable-boundary cases. Contract bytecode and ABI are unchanged.
- The isolated snapshot passed `pnpm verify`: lint, typecheck, **1,694 unit tests** (13 skipped), 10 release-tool tests, production build, trace-conflict check, and **35 compiled-document tests**. Its 15 Foundry tests passed, including 256 fuzz runs; formatting, ABI drift, and tracked whitespace checks passed.
- Independent standards and specification/security review found a canonical-payment-block verification gap; it was reproduced, fixed, and re-reviewed with no remaining medium/high findings. Successful keyless recovery has live CLI evidence but no automated CLI-success fixture; recovery-helper behavior and CLI approval guards are automated. Recovery diagnostics remain deliberately generic and require operator inspection on failure.
- The shared-root gate initially encountered concurrent UI/typecheck failures; these were not R07 edits. A later root run passed lint/typecheck, 1,729 unit tests, release tests, and build but reached the tool timeout during the package tests; the separate 35-test package gate passed. The complete isolated snapshot gate above is the deployment evidence.
- Database/browser fixture suites were not rerun during completion because they truncate the preserved demo database. The earlier 434 DB and 44 browser passes below remain historical evidence, not fresh completion results. Re-run them in a disposable database before the protected release gate.

## Verified Deployment

- Contract: [`0x21bf4df6beb22edb1a71f6dc7b92ffbab122a49a`](https://testnet.arcscan.app/address/0x21bf4df6beb22edb1a71f6dc7b92ffbab122a49a).
- Transaction: [`0xf1b341101893e172ce4590decbd9f047d59ede2455675d435749173caefdfd30`](https://testnet.arcscan.app/tx/0xf1b341101893e172ce4590decbd9f047d59ede2455675d435749173caefdfd30), block `60849043`, chain `5042002`.
- Immutable attestor: `0x8b403c73c428ccbc6c1c90219d772f09a93d3f51`. The existing local attestor key was preserved, its matching public address saved, and its zero balance verified. No new attestor key replaced existing credentials.
- Deployer: `0x67838B890a2ced4D5175535B2Da54985bc16Ac29`. Actual deployment fee: `0.0166128817088 USDC`; remaining balance: `19.9833871182912 USDC`. Contract balance after deployment: `0 USDC`.
- Payer: `0x26A39136c8aed8Ac6DaD4959BeD6E90e93204e45`, funded with `20 USDC`; no invoice payment was authorized or sent in this deployment step.
- Read-back metadata: [`../../contracts/deployments/arc-testnet.json`](../../contracts/deployments/arc-testnet.json), including runtime bytecode hash. This is RPC verification, not a claim of explorer source-code verification.

The operator-approved deployment used a temporary local viem runner with the exact Foundry creation bytecode and constructor arguments. It verified chain identity, separate unfunded attestor, successful creation simulation, balance, and a gas budget below 1 testnet USDC before signing. The public transaction hash was journaled before broadcast to prevent accidental duplicate deployment. Keys were read only from ignored `.env.local`, never command-line arguments or logs. The temporary runner and completed journal were removed after successful authoritative verification.

`node --env-file=.env.local --import tsx scripts/verify-deployment.ts` independently passed read-back after deployment. Local `.env.local` now has the verified contract/transaction, attestor binding, and explicit testnet signer configuration with permissions `600`; existing unrelated settings were preserved. No credentials were uploaded to hosted services and no publication records were rewritten.

## Local Evidence

The working F4 interface is in [`../superpowers/freezes/2026-09-07-f4-settlement.md`](../superpowers/freezes/2026-09-07-f4-settlement.md).

- Foundry tests cover exact forwarding/event facts, wrong value/facts/signer/domain/types, deadline boundaries, replay, forwarding rollback, cross-invoice reentrancy, zero attestor, and 256 fuzz inputs. A shared golden digest pins Solidity/TypeScript EIP-712 encoding.
- Unit tests cover the opt-in/money-mode/chain/key guards, recovery, persistence failure, post-sign bearer revalidation, exact expiry, public response redaction, trusted historical contracts, and runtime onchain attestor/chain checks.
- The local database suite includes real bearer resolution, EOA signing, RPC persistence and digest/signature-hash read-back. No authorization signature is stored and no settlement is created by issuance.
- A dedicated secret-free `contracts` CI job runs formatting, Foundry, and generated ABI drift checks. CI execution for this work is not yet claimed.

Initial local evidence on 7 September 2026, before the completion repairs above:

| Gate | Result |
| --- | --- |
| `pnpm verify` | Passed lint, typecheck, 1,650 unit tests (13 skipped), 10 release-tool tests, production build, and 35 compiled-document package tests |
| `pnpm test:db:local` | 434 tests passed across 9 files, including the new real-signature authorization persistence test |
| `forge fmt --root contracts --check` | Passed |
| `forge build --root contracts` | Contract and deployment script compiled; only naming-style lint notes |
| `forge test --root contracts` | 13 tests passed, including 256 fuzz runs |
| `pnpm contracts:abi:check` | Generated ABI matches compiled contract |
| `pnpm test:e2e` | 44 tests passed across desktop and mobile Chromium; regression coverage, not live wallet payment |
| `pnpm tsx scripts/operator-pay.ts` without an interactive approved invocation | Failed closed as intended before any payment |
| `git diff --check` | Passed |

The database stack was initially stopped; it was started locally. The first full DB attempt hit the tool's two-minute timeout; rerunning with an adequate timeout passed. Independent specification and security/correctness reviews found a historical-contract binding bug and a reentrancy-test weakness. Both were fixed and re-reviewed with no remaining medium/high findings reported. The new cross-invoice test would fail if reentrancy protection were removed. Local Foundry is `1.4.0-nightly` (`fcdf5b1`); CI is pinned to stable `v1.4.0` and still needs remote execution.

## Signer Configuration

Set server secrets/configuration through the existing secret store, never source control:

```dotenv
PAYR_SIGNER_MODE=local-testnet
ALLOW_TESTNET_LOCAL_SIGNER=true
PAYR_MONEY_MODE=testnet
ARC_CHAIN_ID=5042002
ARC_RPC_URL=https://rpc.testnet.arc.network
```

Supply `TESTNET_ATTESTOR_PRIVATE_KEY`, its matching public `PAYR_ATTESTOR_ADDRESS`, and the verified `NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS`. Keep the attestor unfunded and distinct from deployment/payer wallets. A production-hosted web app may serve testnet, but mainnet/production-money signing fails closed. Configuration is read at runtime, not during imports/builds.

When publishing against a new deployment with the same attestor, retain prior verified contract addresses in comma-separated `PAYR_RETAINED_SETTLEMENT_CONTRACTS` while their invoices remain payable. The signer checks the invoice's frozen deployment against this allowlist and reads its immutable attestor. It never rewrites an old invoice to the new default. Attestor-key rotation is not implemented; keep the existing key until those authorizations are no longer needed or design a separately reviewed retained-key registry.

`POST /api/invoice/<bearer>/authorize` takes no body. Amount, payee, chain, contract, commitment, and deadlines come only from the frozen publication. Signature responses are private/no-store/no-referrer and disclose `local-testnet` / `Arc Testnet`. The signature is returned only after the service-only RPC rechecks invoice state/facts and records its hash. Voiding cannot revoke an already returned signature; the bounded residual window remains at most ten minutes and always ends before invoice expiry.

## Deployment Procedure

The deployment above is complete. The following procedure is retained for a separately approved future deployment, not an instruction to deploy again. Confirm operator capacity, wallet funding, and broadcast approval for every new deployment. Preserve the 11 September feature freeze and final recording/submission reserves. Do not infer approval from this runbook.

1. Run `pnpm install --frozen-lockfile`, `forge test --root contracts`, and `pnpm contracts:abi:check`. Use the pinned compiler and lockfile. Do not rebuild with a different compiler/settings between deployment and verification.
2. Select a distinct, unfunded attestor and a funded deployment wallet held in a local Foundry keystore. Read back Arc chain ID and balances. Set the public `PAYR_ATTESTOR_ADDRESS` and credential-free `ARC_RPC_URL`.
3. After approval, set `RUN_LIVE_ARC_DEPLOYMENT=1` and run `forge script --root contracts script/DeployPayr.s.sol:DeployPayr --rpc-url "$ARC_RPC_URL" --account <local-keystore-name> --broadcast`. The script checks chain and nonzero attestor before broadcast. Never pass a private key as a command-line argument.
4. Set `PAYR_DEPLOYMENT_TRANSACTION` to the resulting public transaction hash. Run `pnpm tsx scripts/verify-deployment.ts --write`. The verifier matches exact reviewed creation bytecode and constructor arguments, successful receipt, deployed code, and immutable attestor before writing `contracts/deployments/arc-testnet.json`. It refuses credential-bearing RPC URLs and existing evidence overwrite.
5. Run `pnpm tsx scripts/verify-deployment.ts` without `--write` to read back the retained evidence again. Only then configure publication with that verified contract. Preserve the canonical origin and all existing document bindings.

Deployment metadata contains public chain ID, RPC host, explorer base, contract, attestor, deployment transaction/block, and runtime bytecode hash. There is intentionally no placeholder `arc-testnet.json`.

## Live Payment Gate

1. Deploy the reviewed server code/configuration and verify hosted Supabase plus R06 protected publication/storage first. Create and approve one low-value fixture through the existing API/agent path. Do not add a browser invoice-authoring shortcut.
2. On the operator machine only, supply `NEXT_PUBLIC_APP_URL`, `PAYR_OPERATOR_INVOICE_URL`, `ARC_RPC_URL`, `NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS`, `PAYR_ATTESTOR_ADDRESS`, and `OPERATOR_PAYER_PRIVATE_KEY` through private environment injection. Never place the payer key on the Payr server. Use a separate funded EOA; this proof script rejects self-payment and attestor payment.
3. After approval, run `RUN_LIVE_ARC_PAYMENT=1 pnpm tsx scripts/operator-pay.ts` in a real terminal. The script fetches a persisted authorization without printing the bearer/signature, verifies domain/types/chain/contract/attestor, and requires typing the displayed exact chain/payee/USDC amount.
4. After confirmation, it simulates and estimates the exact call, enforces a maximum gas cost of `0.1 testnet USDC`, and checks value plus gas reserve. It prepares/signs locally and persists the public transaction identity to `.operator-payment.json` in the working directory before broadcasting. Exclusive creation prevents overwriting an earlier attempt. Both file and directory are synchronized before submission; signatures and raw signed transactions remain memory-only.
5. The script checks successful receipt, exactly one configured-contract event and exact invoice/commitment/payer/payee/amount, zero contract balance, and exact payee balance delta. Concurrent payee activity or forced contract funds require explicit investigation, not a false success claim. The printed authorization ID is not settlement evidence.
6. Separately read back the authorization row by its ID through authorized server/database tooling and record only redacted evidence. R08 must independently reconcile the chain event before the product displays Paid or issues a receipt.

If submission or receipt verification stops, preserve the journal and run `pnpm tsx scripts/operator-pay.ts --recover` from the same working directory. Supply only `ARC_RPC_URL` and the expected `NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS`; no payer key, bearer, signing opt-in, or TTY is required. Recovery never broadcasts. It checks canonical receipt-block hashes around historical balance reads, so a pending, reverted, reorganized, or ambiguous payment fails closed. Inspect the journal's public transaction hash and chain evidence before taking any further action. A failed invocation is not proof that no payment occurred.

The scripts do not automatically load `.env.local`, copy credentials, deploy hosted infrastructure, or run during default unit/browser tests. Simulation and mocked receipt checks do not satisfy the live gate.

## Remaining Gates

- Confirm remaining operator/integration capacity for R08-R10. The one-payment approval above is consumed and authorizes no additional spending.
- Browser wallet payment and the remaining reconciliation/receipt/durable delivery implementation; the one-off initial invoice email is not an R08 receipt/outbox implementation.
- R08 must consume the already-verified payment above, not send another payment merely to reproduce R07 evidence.
- Protected CI/release review and versioning. Package version remains `0.5.0`; no commit, tag, push, or PR was made by this implementation session.

## Approved Demo Follow-Up

On 7 September the user approved a fictional developer invoice for exactly 1 USDC, the displayed payout/client details, and use of the configured Resend sender as a one-off exception to the initial-email-via-Gmail plan. The user then prioritized sending that invoice email. This approval does not authorize an invoice payment or change the general email architecture. The original draft remains in the local database; its IDs are retained only in ignored local configuration. An exact commercial-facts copy was created and published through the hosted owner-authenticated HTTP APIs, as recorded below. Do not run destructive local test fixtures against the local database before preserving the demo.

Read-only hosted preflight after approval, updated after the user's integration/key changes:

- The early shell was replaced by Vercel production deployment `dpl_3aqrtPyAoz1NfFdUcvAddnAet5AP`, verified `Ready` and aliased to `payrlink.xyz` and the stable Vercel fallback. It is a working-tree deployment, not a tagged release. Health reports base commit `4decffbf6bf48ec0983b0e2c35fa1d43c2fd791d`; that SHA alone does not identify uncommitted deployment changes.
- The user selected Supabase project `grutkfsoekcpwdksgasm` (`supabase-claret-lighthouse`) through the Vercel integration. Authoritative project discovery reports `ACTIVE_HEALTHY` in `ap-northeast-1`. All five existing migrations were dry-run, applied without seeds or reset, and checked again as up to date. The hosted `documents` bucket was read back as private.
- The original Resend domains API HTTP 401 was later identified as `restricted_api_key`, not evidence of an invalid sending credential. The key did not permit administrative domain reads. The user then supplied a full-access key in ignored `.env.local`.
- Reading the updated key directly from `.env.local`, without an inherited environment override, returned HTTP 200 from `https://api.resend.com/domains`. The configured sender domain `noreply.payrlink.xyz` is `verified`. No email was sent during those preflight reads; the single actual send is recorded below.

### Hosted Publication And Email

- Production runtime configuration uses `https://payrlink.xyz`, the verified Arc contract, fresh production session/link/connector/cron keys, and the separate unfunded testnet attestor. Deployer/payer private keys and the full-access Resend key were not uploaded to Vercel. Ignored `.env.hosted.local` is owner-readable only and preserves the operator-side hosted configuration/evidence. `.vercelignore` explicitly excludes environment files and temporary operator scripts.
- The first hosted build compiled but Vercel rejected the function package: PDF tracing included both canvas symlinks and their child paths. A new post-build trace check reproduced four conflicts locally. Narrowing only the canvas includes to real pnpm targets eliminated the conflicts while all 35 isolated compiled-document checks still passed. The next deployment reached `Ready`; its CLI polling timed out, so completion was established by an independent inspect rather than deploying again.
- After the packaging repair, lint, production build/typecheck, all 1,650 unit tests (13 skipped), the 35 compiled-document tests, and the new trace conflict check passed. A focused independent correctness/security review reported no medium/high findings. Database/browser fixture suites were not rerun during this send operation, to preserve the approved local draft; the real hosted publication and served-byte checks supplied the operational verification.
- The approved local draft was read using the running local Supabase credentials because the service key in `.env.local` no longer matched that stack. No local records or local credentials were overwritten. Hosted login used a real owner EOA signature; profile setup, draft creation, and publication used the production HTTP APIs. Sender/client facts, line items, amount, dates, deadline, memo, and payout matched the approved local snapshot before publication.
- Published `DEMO-2026-000001` for exactly `1 USDC`, issue date 7 September and due date 14 September. The hosted PDF is 18,795 bytes. Both protected public endpoints returned successfully; downloaded PDF bytes matched the frozen content hash. The canonical origin and QR use `https://payrlink.xyz`, never localhost. Bearer links are deliberately omitted from repository documentation.
- One Resend email was accepted and then independently read back with `last_event=delivered`. Recipient, subject, text, and HTML matched the approved one-off payload. Subject: `[DEMO] Invoice DEMO-2026-000001 from Demo Bytecraft Development`. Recipient and provider ID are retained in private operator evidence, not this public document.
- The send used a stable invoice-scoped idempotency key and recorded the request hash/time before sending, then the provider ID before polling. No second send was made. The email includes verified invoice/PDF links, labels the commercial facts as fictional, and explicitly says browser payment is not yet enabled and not to substitute a direct transfer. It is not a receipt or evidence of settlement.

This earlier milestone proved the protected invoice/PDF and initial invoice email. The later completion evidence above adds the real operator payment and persisted authorization proof. Browser wallet payment, reconciliation, receipt, and durable delivery still require their own evidence; the complete product journey is not claimed here.
