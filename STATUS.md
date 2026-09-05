# Status

Last updated: 2026-09-06

## Stage

R00-R03 are released through `v0.2.0`. R04 draft creation/revision, immutable snapshots, idempotent replay, pending client proposals, and server-rendered invoice projections are implemented and verified locally. Publication and real documents remain later tranches. The public deployment remains the earlier health shell; hosted product activation is not claimed.

## Single current objective

Complete the protected R04 `v0.3.0` release. After its tag and post-merge checks pass, freeze the remaining F3 publication transactions and start R05 crash-safe publication.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- Release R04 through the protected `v0.3.0` PR/tag flow; evidence is in `docs/ops/r04-drafts.md`.
- Keep `https://payrlink.xyz` and its secret-free health route as the intended public origin; `https://payr-sandy.vercel.app` is the verified fallback.
- Keep R04 worktrees until the release tag and post-merge CI are green, then remove the merged branches with ordinary ancestry-safe deletion.
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
- Real EOA signatures and identity transactions pass against local Supabase; they are not a live funded-wallet payment, Claude connector, or email delivery.
- Resend sender-domain SPF/DKIM verification and two receipt-inbox tests are not yet proven.
- The hosted Supabase project is not configured. Local config, migrations, reset, and hostile-access tests now pass.
- Claude custom-connector availability and funded Arc deployment/payer balances require human confirmation.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, and native-USDC behavior are verified; Task 6 live deployment/payment still requires funded-wallet evidence.
- Arc mainnet-launch prize requires availability or deployment-readiness work through 30 September.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- R04 base release: annotated `v0.2.0` at `400fe13841cef8d54d0f7cd4ee11d92146ccdb4c`.
- R04 integration branch: `integration/r04-drafts-v0.3.0`.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN — the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN — `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW - local domain/database/auth/draft/console gates pass; publication, document, payment, and hosted integration proof remain.
- Demo: YELLOW — the causal three-minute sequence and honest fallback are defined, but unexercised.
- Submission: RED — the public repository and health shell exist, but there is no implemented product demo, architecture graphic, video, or final submission.

## Next review gate

R04 must be merged/tagged with `web`, `browser`, `database`, and release-metadata checks passing. R05 consumes the immutable draft/version contract and adds fenced publication without changing its identity or replay guarantees; remaining human/live gates stay explicit.
