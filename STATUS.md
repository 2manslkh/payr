# Status

Last updated: 2026-09-08

## Stage

R08 is released as `v1.2.0` at `8a87a76898badfc03dd9dc506ea3c3637e74a9dc` (PR #11). R09 client payment integration and four-tool Claude MCP are implemented and locally verified in `.worktrees/r09-client-mcp`, preserving the released R08 and landing/review fixes. R09 changes are uncommitted, undeployed, and unreleased; live Claude and full external-wallet proof remain separate gates.

## Single current objective

Obtain the next R09 checkpoint/release and deployment approvals, then perform the redacted deployed Claude smoke and separately approved external-wallet rehearsal. Local gates and review repairs are recorded in `docs/ops/r09-implementation.md`; operator steps are in `docs/ops/mcp-claude-smoke.md`. Do not repay either demo invoice or resend the delivered receipt. Production-wide receipt email remains disabled. Preserve the 11 September feature freeze and final recording/upload buffers before the 13 September 16:00 UTC submission deadline.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- R09 work is isolated on `integration/r09-client-mcp`, based on released `v1.2.0` and committed F5. Root was a read-only wallet donor; its dashboard/install/branding work, environment files, demo database, and journals remain untouched. R08's verified-event-prefix, receipt/outbox, fairness/jitter, and protected access boundaries are preserved.
- Preserve the completed R06 implementation and its [verified release read-back](https://github.com/2manslkh/payr/pull/7#issuecomment-5560122806); do not repeat released work.
- R07 uses the existing service-only authorization RPC, pinned OpenZeppelin/Foundry contract, explicit testnet guards, and retained frozen-deployment allowlisting. Privy is not used.
- R07 contract deployed with explicit user approval on 7 September: `0x21bf4df6beb22edb1a71f6dc7b92ffbab122a49a`, Arc testnet block `60849043`. Creation bytecode, receipt, code, and immutable unfunded attestor were read back; metadata is in `contracts/deployments/arc-testnet.json`.
- Preserve `DEMO-2026-000001` and its original payment `0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f`, block `60875360`, log `507`. The user separately approved `DEMO-2026-000002` for real receipt delivery because the original frozen issuer address is non-deliverable. The new 0.01 testnet USDC payment, reconciled receipt, and one same-address/both-role delivered email are recorded in the R08 runbook; neither payment may be repeated under the consumed approvals.
- R07 release passed `pnpm verify` (1,694 unit tests, 10 release tests, build, 35 compiled-document tests), 434 isolated database tests, 44 browser tests, 15 Foundry tests (256 fuzz runs), formatting, ABI drift, and protected pre/post-merge CI. The preserved demo database was not reset. R08 requires its own later release gates.
- The original R07 zero-settlement observation is historical; later root browser/reconciliation work recorded the same event without repaying. Preserve its separate deployment evidence. Full fixture gates use an isolated private daemon, never the retained demo.
- Preserve the required post-build package gate: `web` and local `pnpm verify` run `pnpm test:documents:package`, not only pre-build units.
- Keep `https://payrlink.xyz` and its secret-free health route as the intended public origin; `https://payr-sandy.vercel.app` is the verified fallback.
- Use the official 13 September 12:00 EDT / 16:00 UTC submission deadline; cross-check the authenticated dashboard and resolve discrepancies using the earlier cutoff. The original September 15 freeze is superseded.
- Reconcile remaining human capacity with the implementation plan's R07-R10 dated gates. Its 27-hour figure was an R05-checkpoint estimate, not current availability; account for completed R06 and operator/integration costs. Freeze features on 11 September at 23:59 UTC and protect final proof/recording on 12 September plus two hours of core-blocker contingency before upload.
- The user is building `docs/architecture.excalidraw.svg` in parallel. Preserve it; review its final content against deployed behavior. Record the final 2-4 minute video only after the product flow works, before submission.
- Plan the separate one-click mainnet readiness milestone by 30 September under `docs/ops/mainnet-readiness.md`; implementation and readiness are not yet claimed.
- Complete the remaining receipt-inbox and Claude connector human prerequisite checks. Resend sender-domain verification and one approved invoice delivery are proven. Deployment/payer wallets were funded with 20 testnet USDC each and verified; keep their keys local-only.
- Preserve the selected hosted Supabase project and production keys. Local Payr remains separate on API `57321`, Postgres `58322`, and shadow port `57320`; the local approved draft must not be wiped by test fixtures.
- Track the four approved `assets/brand/` reference files unchanged; derive production web assets separately.
- Apply `DESIGN.md` as core interface work inside Tasks 3-8; do not defer the approved system to contingency polish.

## Not now

- Autonomous payer agents or Circle Agent Stack.
- Dual-party invoice signatures or agent payout-wallet edits.
- Fiat onboarding, multiple chains/tokens, escrow, tax logic, reminders, or accounting integrations.
- Treating web-search results as confirmed legal identity data.
- Requiring Gmail PDF attachment for the core demo.
- Bazantic unless every core acceptance criterion passes early; then at most a one-hour out-of-schedule spike.
- Additional PDF templates or customization beyond one verified restrained layout.
- Direct web invoice authoring or a visible incoming Bills workflow in the MVP.
- Marketplace escrow, invoice-history credit scoring, and undercollateralized lending. These are approved future directions, conditional on real underwriting, privacy, anti-manipulation, and Circle/Arc integration validation.

## Blockers

- Remaining capacity must fit the confirmed submission deadline and final recording/upload buffers; a missed calendar gate requires an explicit scope or availability decision.
- Real EOA signatures and identity transactions pass against local Supabase; they are not a live funded-wallet payment, Claude connector, or email delivery.
- Resend reports the approved receipt email delivered to one user-approved deduplicated issuer/client address. Downloaded attachment bytes and canonical payload matched, and a worker rerun caused no second send. Human inbox opening and unattended scheduled delivery are not claimed; production receipt email remains disabled.
- Hosted Supabase project `grutkfsoekcpwdksgasm` is established with private document storage. R08 migrations through `202609040008` were applied and read back. Preserve later migrations from current `main`; never amend hosted-applied SQL.
- Hosted R06 publication and protected page/PDF read-back passed for approved demo invoice `DEMO-2026-000001`. The PDF is 18,795 bytes and matches its frozen hash. One explicitly approved initial-invoice email was sent through Resend and read back as delivered; this is not an R08 receipt or durable-outbox implementation.
- PDF fields support printable ASCII plus LF only; unsupported text fails closed without transliteration or invented legal facts. Receipts are R08, wallet authorization/payment R07/R09, and MCP R09; R06 does not deliver payments, receipts, or email.
- Claude custom-connector availability remains unverified. Arc operator payment and scoped reconciled receipt/delivery are proven; the full R09 browser-wallet/Claude journey remains separate.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, native-USDC behavior, Task 6 contract deployment, real operator payment, and authorization-row read-back are verified. No additional payment is authorized by this document.
- One-click mainnet deployment-readiness is an approved target due 30 September, but its workflow, mainnet signer/environment, official network facts, and sponsor-accepted readiness evidence remain unverified.

## Known Risks

Unchanged R05 reliability risk: pre-release nonce issuance twice returned `400` locally; one failure reached the existing strict timestamp guard. Subsequent 21 isolated auth-flow runs and a fresh complete 406-test database gate passed. Transient cross-runtime clock sensitivity remains unresolved and suspected, not proven; keep strict auth checks and stop release preparation on recurrence. Details: `docs/ops/r05-publication.md`.

Protected HTML has a remaining verification gap for denial-status uniformity if a credential becomes invalid after live admission. This is not an established confidentiality bypass: the request was live at admission. PDF post-download access revalidation is covered. Details: `docs/ops/r06-documents.md`.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- Latest locally verified release baseline: `v1.2.0`, [PR #11](https://github.com/2manslkh/payr/pull/11), `8a87a76898badfc03dd9dc506ea3c3637e74a9dc`. R09 starts here and has no release tag yet.
- Root pending work is being reconciled on `integration/root-updates`; the clean R06 release worktree remains at `.worktrees/r06-integration`.
- The R07 deployment snapshot and retained payment journal remain in `.worktrees/r07-finish`. Its implementation was subsequently released through PR #8. Vercel `dpl_Em186jttjVwZWFxLA4ukZKdPJrLo` was verified `Ready` before tagging; this does not claim deployment of any R08/R09 changes.
- Production wallet UI lives in a separately approved combined deployment. Do not replace it with the narrower release snapshot without integrating and checking the wallet source.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN - the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN - `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW - R08 is released; R09 passes 1,948 unit/PDF, 467 isolated DB, 72 desktop/mobile browser, 10 release-tool, and 35 compiled-document tests plus build/lint/typecheck. Protected R09 CI/release, deployed Claude, and external-wallet proof remain outstanding.
- Demo: YELLOW - the causal three-minute sequence and honest fallback are defined, but unexercised by this tranche.
- Submission: RED - repository and health shell exist; the user-owned architecture diagram is in progress. End-to-end product proof, final diagram verification, post-product video recording, and submitted dashboard confirmation remain outstanding.

## Next review gate

Review the R09 handoff and authorize its next checkpoint/deployment or release step. Both independent review axes have no unresolved findings after repairs; the complete local and disposable Linux gates pass. R08's earlier intermittent 18-page PDF timeout remains historical risk, not hidden by the current pass. Operator mode is explicit, not unattended delivery proof. See `docs/ops/r09-implementation.md` and preserve R08's separately dated live evidence. This status document grants no new external-operation approval. Preserve final recording/upload reserves and the R09 feature-freeze deadline.
