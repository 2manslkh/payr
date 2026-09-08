# Status

Last updated: 2026-09-08

## Stage

R00-R07 are released through `v0.6.0` at `0d122231b0252f587a59868022b65dea83f6d525` ([PR #8](https://github.com/2manslkh/payr/pull/8)). The annotated tag and post-merge CI are verified. R07 includes the contract, authorization, and real operator-payment gate, not the complete browser-payment/receipt/Claude journey. The current patch adds review fixes; release completion is identified by its merged PR and tag, not by this pre-release document.

## Single current objective

Release the isolated publication/profile reliability fixes under `docs/ops/review-fixes.md`, then continue receipts, durable delivery, and Claude integration using the existing verified payment. Preserve the separate root client-payment/reconciliation work and its deployment evidence; it is not included in this patch. Do not pay the demo invoice again. Complete the deployed core product before final video recording; submission is due 13 September at 16:00 UTC, with an internal 14:00 UTC upload target.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- Preserve the completed R06 implementation and its [verified release read-back](https://github.com/2manslkh/payr/pull/7#issuecomment-5560122806); do not repeat released work.
- R07 uses the existing service-only authorization RPC, pinned OpenZeppelin/Foundry contract, explicit testnet guards, and retained frozen-deployment allowlisting. Privy is not used.
- R07 contract deployed with explicit user approval on 7 September: `0x21bf4df6beb22edb1a71f6dc7b92ffbab122a49a`, Arc testnet block `60849043`. Creation bytecode, receipt, code, and immutable unfunded attestor were read back; metadata is in `contracts/deployments/arc-testnet.json`.
- The separately approved `1 USDC` operator payment for `DEMO-2026-000001` succeeded in transaction `0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f`, block `60875360`, log `507`. Exact event/balance facts and hosted authorization digest/signature hash were independently verified. Gas was `0.00150551453184 USDC`. The zero-settlement observation in the R07 record is historical; later root client-payment evidence records reconciliation of that same event. This patch does not repeat the payment or modify hosted records.
- R07 completion snapshot `.worktrees/r07-finish` passed `pnpm verify` (1,694 unit tests, 10 release tests, build, 35 compiled-document tests), 15 Foundry tests (256 fuzz runs), formatting, and ABI drift. PR #8 and post-merge CI passed; R07 is released. Patch gates use a separate disposable daemon and loopback network, never the preserved demo fixtures.
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
- Resend reports `noreply.payrlink.xyz` verified and the approved demo invoice email delivered. Two real receipt-inbox tests and durable receipt delivery remain unproven.
- Hosted Supabase project `grutkfsoekcpwdksgasm` and production Payr configuration are now established. All five existing migrations were applied and read back as up to date; the documents bucket is private.
- Hosted R06 publication and protected page/PDF read-back passed for approved demo invoice `DEMO-2026-000001`. The PDF is 18,795 bytes and matches its frozen hash. One explicitly approved initial-invoice email was sent through Resend and read back as delivered; this is not an R08 receipt or durable-outbox implementation.
- PDF fields support printable ASCII plus LF only; unsupported text fails closed without transliteration or invented legal facts. Receipts are R08, wallet authorization/payment R07/R09, and MCP R09; R06 does not deliver payments, receipts, or email.
- Claude custom-connector availability remains unverified. Arc operator payment is proven; browser-wallet and reconciled receipt/delivery proof remain.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, native-USDC behavior, Task 6 contract deployment, real operator payment, and authorization-row read-back are verified. No additional payment is authorized by this document.
- One-click mainnet deployment-readiness is an approved target due 30 September, but its workflow, mainnet signer/environment, official network facts, and sponsor-accepted readiness evidence remain unverified.

## Known Risks

Unchanged R05 reliability risk: pre-release nonce issuance twice returned `400` locally; one failure reached the existing strict timestamp guard. Subsequent 21 isolated auth-flow runs and a fresh complete 406-test database gate passed. Transient cross-runtime clock sensitivity remains unresolved and suspected, not proven; keep strict auth checks and stop release preparation on recurrence. Details: `docs/ops/r05-publication.md`.

Protected HTML has a remaining verification gap for denial-status uniformity if a credential becomes invalid after live admission. This is not an established confidentiality bypass: the request was live at admission. PDF post-download access revalidation is covered. Details: `docs/ops/r06-documents.md`.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- Verified release baseline: `v0.6.0` at `0d122231b0252f587a59868022b65dea83f6d525`, [PR #8](https://github.com/2manslkh/payr/pull/8). Consult annotated tags and merged PRs for subsequent release completion.
- Root pending work is being reconciled on `integration/root-updates`; the clean R06 release worktree remains at `.worktrees/r06-integration`.
- The historical R07-only deployment snapshot and payment journal remain in `.worktrees/r07-finish`. The reviewed R07 source was subsequently released in PR #8. Root browser/reconciliation deployment work has its own evidence and must not be overwritten by deploying this narrower patch snapshot.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN - the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN - `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW - released document/publication, hosted invoice/email, and real R07 operator payment are verified. Root browser/reconciliation work remains outside this patch; receipt generation, durable receipt delivery, and the complete Claude journey remain completion gates.
- Demo: YELLOW - the causal three-minute sequence and honest fallback are defined, but unexercised by this tranche.
- Submission: RED - repository and health shell exist; the user-owned architecture diagram is in progress. End-to-end product proof, final diagram verification, post-product video recording, and submitted dashboard confirmation remain outstanding.

## Next review gate

Review the completed R07 evidence and working F4 interface in `docs/superpowers/freezes/2026-09-07-f4-settlement.md`, then complete R08 against the recorded payment. The snapshot used coordinator-only packaging isolation, not implementation-agent fanout. Preserve its payment journal and do not redeploy the contract or repay the invoice to repeat verification. Protected release/CI and disposable DB/browser regressions remain separate gates. Confirm remaining capacity and F5 before implementation fanout. No further live transaction is authorized by this status document. The implementation plan targets R07 by 8 September, R08 by 10 September, and R09 by the 11 September feature freeze. Escalate missed gates rather than consuming the final video/submission reserve. Historical evidence retains its observation dates.
