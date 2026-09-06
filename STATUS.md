# Status

Last updated: 2026-09-06

## Stage

R00-R04 are released through `v0.3.0`. R05 publication reservation/recovery, fenced artifact verification/finalization, status/Gmail reconstruction, explicit sharing, and atomic voiding are implemented and tested locally. Production has no synthetic document adapter: R06 must supply real PDF/QR/storage before new publication is enabled. Hosted rollout is not claimed.

## Single current objective

Complete the protected R05 `v0.4.0` release, then start R06 immutable documents and protected surfaces after tag and post-merge checks pass.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- Release R05 through the protected `v0.4.0` PR/tag flow; evidence is in `docs/ops/r05-publication.md`.
- Keep `https://payrlink.xyz` and its secret-free health route as the intended public origin; `https://payr-sandy.vercel.app` is the verified fallback.
- Keep R05 worktrees until the release tag and post-merge CI are green, then remove the merged branches with ordinary ancestry-safe deletion.
- Confirm the exact submission cutoff time and timezone in the authenticated ETHGlobal dashboard.
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

## Blockers

- Exact submission cutoff time/timezone remains unverified.
- Real EOA signatures and identity transactions pass against local Supabase; they are not a live funded-wallet payment, Claude connector, or email delivery.
- Resend sender-domain SPF/DKIM verification and two receipt-inbox tests are not yet proven.
- Hosted Supabase and deployment configuration remain unverified by this tranche. Local config, migrations, reset, and hostile-access tests pass.
- Real document generation/storage and protected routes remain R06 work; no new production publication is enabled through a fake adapter.
- Claude custom-connector availability and funded Arc deployment/payer balances require human confirmation.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, and native-USDC behavior are verified; Task 6 live deployment/payment still requires funded-wallet evidence.
- Arc mainnet-launch prize requires availability or deployment-readiness work through 30 September.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- R05 base release: annotated `v0.3.0` at `57638dcbfc34342ea680d42acfba9b3988ee2ad6`.
- R05 integration branch: `integration/r05-publication-v0.4.0`.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN — the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN — `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW - local publication protocol and recovery gates pass; real document, payment, and hosted integration proof remain.
- Demo: YELLOW — the causal three-minute sequence and honest fallback are defined, but unexercised.
- Submission: RED — the public repository and health shell exist, but there is no implemented product demo, architecture graphic, video, or final submission.

## Next review gate

R05 must be merged/tagged with `web`, `browser`, `database`, and release-metadata checks passing. R06 installs the real document adapter and protected routes without weakening frozen byte/hash/QR checks or recovery/fence guarantees; remaining human/live gates stay explicit.
