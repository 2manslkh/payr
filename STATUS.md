# Status

Last updated: 2026-09-05

## Stage

R00 and R01 are merged and tagged through `v0.1.2`. R02 domain, keyed-token security, hardened schema, and workspace-scoped repositories are implemented and verified locally. The public deployment remains the health shell; no end-user invoicing or payment workflow is exposed yet.

## Single current objective

Complete the protected R02 `v0.1.3` release with the new database CI gate. After its tag and post-merge checks pass, freeze F2 before starting wallet authentication and the console foundation.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- Release R02 through the protected `v0.1.3` PR/tag flow; evidence is in `docs/ops/r02-domain-database.md`.
- Keep `https://payrlink.xyz` and its secret-free health route as the intended public origin; `https://payr-sandy.vercel.app` is the verified fallback.
- Keep all four R02 worktrees until the release tag and post-merge CI are green.
- Confirm the exact submission cutoff time and timezone in the authenticated ETHGlobal dashboard.
- Complete the remaining Resend, funded-wallet, receipt-inbox, and Claude connector human prerequisite checks.
- Select and configure the intended hosted Supabase project before deployed product integration. Local Payr uses isolated `5732x` ports.
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
- No live product or sponsor integration has been exercised; local domain/database tests are not live payment or delivery evidence.
- Resend sender-domain SPF/DKIM verification and two receipt-inbox tests are not yet proven.
- The hosted Supabase project is not configured. Local config, migrations, reset, and hostile-access tests now pass.
- Claude custom-connector availability and funded Arc deployment/payer balances require human confirmation.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, and native-USDC behavior are verified; Task 6 live deployment/payment still requires funded-wallet evidence.
- Arc mainnet-launch prize requires availability or deployment-readiness work through 30 September.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- R02 base release: annotated `v0.1.2` at `7b49d404659bec59e8c8a58a55d96c478346a66d`.
- R02 integration branch: `integration/r02-domain-db-v0.1.3`.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN — the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN — `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW - local domain/database gates pass, but auth, publication, document, payment, and deployed integration proof remain.
- Demo: YELLOW — the causal three-minute sequence and honest fallback are defined, but unexercised.
- Submission: RED — the public repository and health shell exist, but there is no implemented product demo, architecture graphic, video, or final submission.

## Next review gate

R02 must be merged/tagged with `web`, `browser`, `database`, and release-metadata checks passing. F2 then freezes auth, session/origin, connector, and console interfaces; remaining human/live gates stay explicit.
