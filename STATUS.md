# Status

Last updated: 2026-09-10

## Current Reconciliation

The user approved consolidation onto released main `cbcf7e28b9882d7ea3ee93599d2398381fe7938e`
(`v1.8.0`), with planned breaking `v2.0.0` scope: Privy onboarding/business-wallet
discovery, newer dashboard login/MCP guide and mandatory Publish & Send. The docs
lane starts at combined-source checkpoint `e76807a952b291dca0747977338b7f33d3bdca5e`.
Package/version changes and final gates belong to the coordinator; see
`docs/ops/reconciliation-v2.md`. The optional direct-MCP plugin is archive-only.

- New publication requires `approval:true` and `deliveryApproval:true` for the exact version and frozen client/issuer addresses. Disabled invoice email blocks fresh publication before reservation. Legacy finalized no-send replay is read-only, without backfill. Initial email uses the frozen PDF and private links; receipt delivery remains separately gated.
- Production is documented as base main `cbcf7e2` plus an uncommitted Privy snapshot, deployment `dpl_GLDNXmDkssP7DFaFJWBNcNYs9zXV`, not main alone or this candidate. `docs/ops/privy-onboarding.md` preserves the snapshot digest and 10 September evidence. Health identifies only the base commit.
- No real onboarding credentials were submitted in that verification. Live wallet ownership, existing-workspace linking with preserved bindings and genuine policy denial remain unproven. The guarded local-testnet payment attestor remains separate from the Privy receiving wallet.
- The recorded public gateway has eleven Payr operations without `get_account_context` or `void_invoice`; local upstream has twelve including context. Public discovery/missing-account denial and the earlier HTTP-body-credential smoke do not verify private per-user authentication in generated MCP or authenticated Claude/Cowork use. Never supply secrets in chat; see `docs/ops/mcp-onboarding.md`.
- Core acceptance still needs both-approval initial-email proof, a separately approved fresh payment, verified settlement/receipt artifacts and independently approved receipt-delivery evidence. Provider acceptance is not inbox delivery; same-address proof does not prove two inboxes. Do not repay or resend retained evidence.
- Fresh combined-source CI, isolated DB/browser gates and standards/spec/security review remain required. All counts below and in donor runbooks are dated source evidence, not candidate results. Migration/deployment, gateway reimport, Cron/Vault configuration and email activation require separate operator approval; consolidation grants no live writes.
- Preserve the dirty root/donor snapshots, root-only demo scripts v2/v3/v4, user diagrams/artwork, newer operational evidence, ignored secrets and retained data. The documented invoice-outbox credential is `PAYR_INVOICE_CRON_SECRET` with `CRON_SECRET` fallback only when absent; an explicit empty dedicated value fails closed.

Current objective: finish integrated reconciliation gates without replacing the
recorded production snapshot, then obtain the missing live acceptance and complete
the diagram/video/submission work within the existing calendar. No release,
deployment, new automated tests or new live checks are claimed by this docs update.

## Historical Status: 9 September 2026

Everything below retains the earlier checkpoint, including its then-current base,
"Now", readiness and next-review statements. The 10 September section above
supersedes those current-scope claims, especially plugin readiness, Privy's role,
publication/email behavior and production identity; it does not rewrite observed
R07/R08/R09 results or authorize reuse of consumed approvals.

## Stage (Historical)

The clean root-updates release candidate is based on `v1.6.0` at `aebcd15` ([PR #16](https://github.com/2manslkh/payr/pull/16)). It retains main's opt-in sender tools and public discovery. User-approved replay on `integration/root-updates-v1.7.0` preserves `integration/root-updates` without rewriting history. See `docs/ops/root-release-manifest.md` for current execution and gates; release/deployment are not implied by source integration.

Separately, R09 was released as `v1.3.0` at `2dfa8db159c19f95a5af9e99cb4a5a428b2c2e2a` ([PR #12](https://github.com/2manslkh/payr/pull/12)), including released R08 receipts/durable delivery, client wallet payments, and four-tool Claude MCP. Its annotated remote tag and post-merge CI were verified. The recorded 9 September health read-back showed production serving the identical reviewed release-head tree at `328fcdc26e5a817ded1a648771f301472637a240`. This is R09 deployment evidence, not verification of deployed `v1.4.1` or follow-up source, and retains the live Claude/external-wallet limits. See `docs/ops/r09-release.md`.

## Single current objective

Complete R10 production proof and submission, not another R08/R09 implementation pass. Finish the redacted deployed Claude smoke and separately approved external-wallet rehearsal, verify the user-owned diagram, then record and rehearse the demo. Operator steps are in `docs/ops/mcp-claude-smoke.md`. Do not repay either demo invoice or resend the delivered receipt. Production-wide receipt email remains disabled. Preserve the 11 September feature freeze and final recording/upload buffers before the 13 September 16:00 UTC deadline, with an internal 14:00 UTC upload target.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- `integration/root-updates` is preserved at `72629a3`; its committed dashboard/wallet/install/roadmap/docs tree was replayed onto current main on `integration/root-updates-v1.7.0` with explicit user approval. The primary `integration/agent-readiness` worktree is separate and untouched. The pre-cleanup root snapshot remains in stash `d8b9351cb799c3e6a1f8b95fd2e7cfd763e02d3e`. `docs/ops/repository-cleanup.md` records historical inventory/recovery, not current branch state.
- The earlier local dashboard migration-version collision is historical. `docs/ops/dashboard.md` records the later approved application/read-back of all eleven repository migrations with matching names locally and on hosted Payr, including `202609080003_dashboard_overview.sql`, with unchanged recorded counts and no application deployment. Cleanup itself made no database changes. Preserve the retained demo; do not run resets or fixture suites against it.
- Preserve the completed R06 implementation and its [verified release read-back](https://github.com/2manslkh/payr/pull/7#issuecomment-5560122806); do not repeat released work.
- R07 uses the existing service-only authorization RPC, pinned OpenZeppelin/Foundry contract, explicit testnet guards, and retained frozen-deployment allowlisting. Privy is not used.
- R07 contract deployed with explicit user approval on 7 September: `0x21bf4df6beb22edb1a71f6dc7b92ffbab122a49a`, Arc testnet block `60849043`. Creation bytecode, receipt, code, and immutable unfunded attestor were read back; metadata is in `contracts/deployments/arc-testnet.json`.
- Preserve `DEMO-2026-000001` and its original payment `0xf909a57a92e1b1bc046da1ae20a340108daf730d63e6772796c4225c49c6b84f`, block `60875360`, log `507`. The user separately approved `DEMO-2026-000002` for real receipt delivery because the original frozen issuer address is non-deliverable. The new 0.01 testnet USDC payment, reconciled receipt, and one same-address/both-role delivered email are recorded in the R08 runbook; neither payment may be repeated under the consumed approvals.
- R09 release preparation passed 1,948 unit/PDF tests, 467 isolated DB tests, 72 desktop/mobile browser tests, 10 release-tool tests, and 35 compiled-document tests, plus lint/typecheck/build and independent review repairs. Protected pre/post-merge CI passed. These are released-source results, not evidence for the uncommitted dashboard follow-up.
- The original R07 zero-settlement observation is historical; later root browser/reconciliation work recorded the same event without repaying. Preserve its separate deployment evidence. Full fixture gates use an isolated private daemon, never the retained demo.
- Preserve the required post-build package gate: `web` and local `pnpm verify` run `pnpm test:documents:package`, not only pre-build units.
- Keep `https://payrlink.xyz` and its secret-free health route as the intended public origin; `https://payr-sandy.vercel.app` is the verified fallback.
- Use the official 13 September 12:00 EDT / 16:00 UTC submission deadline; cross-check the authenticated dashboard and resolve discrepancies using the earlier cutoff. The original September 15 freeze is superseded.
- Re-estimate remaining human capacity for R10; the plan's 27-hour figure was an R05-checkpoint estimate, not current availability. R07-R09 implementation/release gates are complete with the recorded live limits. Freeze features on 11 September at 23:59 UTC and protect final proof/recording on 12 September plus two hours of core-blocker contingency before upload.
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
- Hosted Supabase project `grutkfsoekcpwdksgasm` is established with private document storage. R08 recorded migrations through `202609040008`; at that checkpoint, hosted fairness/jitter application was unverified. The later approved read-back in `docs/ops/dashboard.md` supersedes that gap: all eleven migrations, including fairness, retry jitter, and dashboard overview, were applied and independently read back on hosted Payr and locally. This does not establish application deployment. Never amend hosted-applied SQL or infer hosted history from the local database.
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
- Release-candidate base: `v1.6.0`, [PR #16](https://github.com/2manslkh/payr/pull/16), `aebcd15`. The separately recorded R09 release is `v1.3.0`, PR #12, `2dfa8db159c19f95a5af9e99cb4a5a428b2c2e2a`; its [post-merge CI](https://github.com/2manslkh/payr/actions/runs/34242942628) passed, not evidence for the current integration.
- Root follow-up release work is on `integration/root-updates-v1.7.0`; `integration/root-updates` remains evidence. Current gates are in `docs/ops/root-release-manifest.md`; historical worktree and stash decisions are in `docs/ops/repository-cleanup.md`.
- The R07 deployment snapshot and retained payment journal remain in `.worktrees/r07-finish`. Its implementation was subsequently released through PR #8. Vercel `dpl_Em186jttjVwZWFxLA4ukZKdPJrLo` was verified `Ready` before tagging; this does not claim deployment of any R08/R09 changes.
- Recorded R09 production deployment `dpl_JwRPqsTnqRgCnHRkNzSgrcEXpHDR` served the R09 release-head tree at read-back. No fresh deployment check is claimed here. Preserve disabled Git-triggered deployments, the published origin, existing secrets, all three daily schedules, and `PAYR_RECEIPT_EMAIL_ENABLED=false`. Local cleanup/integration is not deployment approval.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN - the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN - `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW - this candidate starts from `v1.6.0`; R09 has separately recorded deployment and green protected CI evidence. Historical local/hosted eleven-migration read-back is recorded in the dashboard runbook. It does not prove application of later sender or hardening migrations. Deployed Claude, external-wallet, human inbox/unattended-delivery proof, and candidate release/deployment gates remain separately tracked.
- Demo: YELLOW - the causal three-minute sequence and honest fallback are defined, but unexercised by this tranche.
- Submission: RED - repository and health shell exist; the user-owned architecture diagram is in progress. End-to-end product proof, final diagram verification, post-product video recording, and submitted dashboard confirmation remain outstanding.

## Next review gate

Review the historical cleanup inventory alongside the current integration diff and verify retained follow-up changes in a disposable environment. Complete R10's live acceptance matrix and two rehearsals before final recording/upload. R08's earlier intermittent 18-page PDF timeout remains historical risk, not hidden by the released green gates. Operator mode is explicit, not unattended delivery proof. Preserve the separately dated R07/R08/R09 evidence. This status document grants no new external-operation approval; protect the final recording/upload reserves.
