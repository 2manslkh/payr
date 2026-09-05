# Status

Last updated: 2026-09-05

## Stage

The Payr product framing, `Commit Ledger` design, 10-task test-first implementation plan, and multi-agent release-tranche orchestration are approved. R00 is merged and tagged as `v0.1.1`. R01 external evidence and the public Vercel health proof are being finalized; product implementation has not started.

## Single current objective

Review and tag the R01 preflight release as `v0.1.2`, then begin Task 2 domain/database work from that tagged release.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- Finalize R01 evidence and release it through the protected `v0.1.2` PR/tag flow.
- Keep `https://payrlink.xyz` and its secret-free health route as the intended public origin; `https://payr-sandy.vercel.app` is the verified fallback.
- Begin Task 2 from the tagged R01 release using repository-root `.worktrees/` lanes.
- Confirm the exact submission cutoff time and timezone in the authenticated ETHGlobal dashboard.
- Complete the remaining Resend, funded-wallet, receipt-inbox, and Claude connector human prerequisite checks.
- Initialize the intended Supabase project/schema lane in Task 2; Docker is available locally.
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
- No product or sponsor integration has been exercised; only the application shell is runnable.
- Resend sender-domain SPF/DKIM verification and two receipt-inbox tests are not yet proven.
- The intended Supabase project and local `supabase/config.toml` are not configured.
- Claude custom-connector availability and funded Arc deployment/payer balances require human confirmation.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, and native-USDC behavior are verified; Task 6 live deployment/payment still requires funded-wallet evidence.
- Arc mainnet-launch prize requires availability or deployment-readiness work through 30 September.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- Current protected release: annotated `v0.1.1` at the R00 merge commit.
- Active preflight branch: `integration/r01-preflight-v0.1.2`.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN — the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN — `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW — the architecture, executable plan, and verified shell exist, but no product integration proof exists.
- Demo: YELLOW — the causal three-minute sequence and honest fallback are defined, but unexercised.
- Submission: RED — the public repository and health shell exist, but there is no implemented product demo, architecture graphic, video, or final submission.

## Next review gate

R01 evidence passes review and is merged/tagged as `v0.1.2`; then Task 2 begins with Supabase configuration and all remaining human/live blockers explicit. Public Vercel/custom-domain health is already proven.
