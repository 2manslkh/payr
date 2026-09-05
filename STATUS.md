# Status

Last updated: 2026-09-05

## Stage

The Payr product framing, `Commit Ledger` design, 10-task test-first implementation plan, and multi-agent release-tranche orchestration are approved. R00 is establishing the protected PR-first release baseline; product implementation has not started.

## Single current objective

Complete and tag the R00 bootstrap release, configure repository protections, then execute R01 prerequisite read-backs before Task 2 fanout.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- Complete R00 through a versioned PR, merge-commit tag, and protected repository settings.
- Execute R01 prerequisite evidence, then begin Task 2 from the tagged release.
- Confirm the exact submission cutoff time and timezone in the authenticated ETHGlobal dashboard.
- Complete the live Task 1 Arc, DNS/TLS, Resend, Vercel, and connector prerequisite checks.
- Verify Arc details/balances, `payrlink.xyz` HTTPS, Resend DNS, and Claude connector behavior before relying on them; keep the Privy spike outside the committed schedule.
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
- `payrlink.xyz` nameservers/A records have begun resolving, but HTTPS and Resend SPF/DKIM verification are not yet proven.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, funded wallets, and native-USDC behavior must pass Task 1/Task 6 live checks.
- Arc mainnet-launch prize requires availability or deployment-readiness work through 30 September.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- Active bootstrap branch: `integration/r00-bootstrap-v0.1.1`.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN — the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN — `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW — the architecture, executable plan, and verified shell exist, but no product integration proof exists.
- Demo: YELLOW — the causal three-minute sequence and honest fallback are defined, but unexercised.
- Submission: RED — the public repository exists, but there is no deployed app, architecture graphic, video, or final submission.

## Next review gate

R00 is merged, tagged, and protected; then every Task 1 external prerequisite has a recorded outcome. Task 2 may begin with Arc/Vercel blockers still explicit; a public preview is mandatory before Task 9 deployed connector proof and Task 10 release proof.
