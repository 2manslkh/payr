# Status

Last updated: 2026-09-06

## Stage

R00-R06 are released through `v0.5.0` at `482c5768a3a1c411716daaff3bc9d7552ad2ed7a`. R06 real invoice PDF/QR, immutable private Storage, protected HTML/PDF routes, compiled publication, and positioned money-row verification passed local and protected CI gates. The annotated tag and post-merge checks are verified in PR #7. Hosted product rollout is not claimed.

## Single current objective

Reconcile useful pending work in atomic commits, then proceed to R07 under the corrected calendar and confirmed operator capacity. Complete the deployed core product before final video recording; the official submission deadline is 13 September 2026 at 12:00 EDT / 16:00 UTC, with an internal 14:00 UTC upload target.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- Preserve the completed R06 implementation and its [verified release read-back](https://github.com/2manslkh/payr/pull/7#issuecomment-5560122806); do not repeat released work.
- Preserve the required post-build package gate: `web` and local `pnpm verify` run `pnpm test:documents:package`, not only pre-build units.
- Keep `https://payrlink.xyz` and its secret-free health route as the intended public origin; `https://payr-sandy.vercel.app` is the verified fallback.
- Use the official 13 September 12:00 EDT / 16:00 UTC submission deadline; cross-check the authenticated dashboard and resolve discrepancies using the earlier cutoff. The original September 15 freeze is superseded.
- Reconcile remaining human capacity with the implementation plan's R07-R10 dated gates. Its 27-hour figure was an R05-checkpoint estimate, not current availability; account for completed R06 and operator/integration costs. Freeze features on 11 September at 23:59 UTC and protect final proof/recording on 12 September plus two hours of core-blocker contingency before upload.
- The user is building `docs/architecture.excalidraw.svg` in parallel. Preserve it; review its final content against deployed behavior. Record the final 2-4 minute video only after the product flow works, before submission.
- Plan the separate one-click mainnet readiness milestone by 30 September under `docs/ops/mainnet-readiness.md`; implementation and readiness are not yet claimed.
- Complete the remaining Resend, funded-wallet, receipt-inbox, and Claude connector human prerequisite checks.
- Verify the intended hosted Supabase configuration before deployed product integration. Local Payr uses API `57321`, Postgres `58322`, and shadow port `57320`.
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
- Resend sender-domain SPF/DKIM verification and two receipt-inbox tests are not yet proven.
- Hosted Supabase and deployment configuration remain unverified by this tranche. Local config, migrations, reset, and hostile-access tests pass.
- Hosted R06 validation remains open. Real publication requires configured chain/contract/link keys and Supabase; no fake adapter or browser authoring is provided.
- PDF fields support printable ASCII plus LF only; unsupported text fails closed without transliteration or invented legal facts. Receipts are R08, wallet authorization/payment R07/R09, and MCP R09; R06 does not deliver payments, receipts, or email.
- Claude custom-connector availability and funded Arc deployment/payer balances require human confirmation.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, and native-USDC behavior are verified; Task 6 live deployment/payment still requires funded-wallet evidence.
- One-click mainnet deployment-readiness is an approved target due 30 September, but its workflow, mainnet signer/environment, official network facts, and sponsor-accepted readiness evidence remain unverified.

## Known Risks

Unchanged R05 reliability risk: pre-release nonce issuance twice returned `400` locally; one failure reached the existing strict timestamp guard. Subsequent 21 isolated auth-flow runs and a fresh complete 406-test database gate passed. Transient cross-runtime clock sensitivity remains unresolved and suspected, not proven; keep strict auth checks and stop release preparation on recurrence. Details: `docs/ops/r05-publication.md`.

Protected HTML has a remaining verification gap for denial-status uniformity if a credential becomes invalid after live admission. This is not an established confidentiality bypass: the request was live at admission. PDF post-download access revalidation is covered. Details: `docs/ops/r06-documents.md`.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- Latest release: `v0.5.0` at `482c5768a3a1c411716daaff3bc9d7552ad2ed7a`, [PR #7](https://github.com/2manslkh/payr/pull/7).
- Root pending work is being reconciled on `integration/root-updates`; the clean R06 release worktree remains at `.worktrees/r06-integration`.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN - the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN - `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW - released document/publication and structural security gates pass; live payment and hosted integration proof remain.
- Demo: YELLOW - the causal three-minute sequence and honest fallback are defined, but unexercised by this tranche.
- Submission: RED - repository and health shell exist; the user-owned architecture diagram is in progress. End-to-end product proof, final diagram verification, post-product video recording, and submitted dashboard confirmation remain outstanding.

## Next review gate

Confirm remaining capacity and R07's F4 contract/signing/deployment interfaces before fanout. R07 requires adversarial contract tests and a real operator testnet payment; no live transaction is authorized by this status document. The implementation plan targets R07 by 8 September, R08 by 10 September, and R09 by the 11 September feature freeze. Escalate missed gates rather than consuming the final video/submission reserve. Historical evidence retains its observation dates.
