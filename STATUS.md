# Status

Last updated: 2026-09-05

## Stage

The Payr product framing, written design, and 10-task test-first implementation plan are reconciled. The runnable shell and its unit/browser test topology exist; product implementation has not started.

## Single current objective

Finish recording Task 1 prerequisite outcomes, then begin Task 2's domain and database contract without assuming blocked Arc or Vercel facts.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Now

- Record the remaining Task 1 prerequisite outcomes, then begin Task 2.
- Confirm the exact submission cutoff time and timezone in the authenticated ETHGlobal dashboard.
- Complete the live Task 1 Arc, DNS/TLS, Resend, Vercel, and connector prerequisite checks.
- Verify Arc details/balances, `payrlink.xyz` HTTPS, Resend DNS, and Claude connector behavior before relying on them; keep the Privy spike outside the committed schedule.
- Keep the untracked `assets/` directory unchanged pending a brand-ownership/tracking decision.

## Not now

- Autonomous payer agents or Circle Agent Stack.
- Dual-party invoice signatures or agent payout-wallet edits.
- Fiat onboarding, multiple chains/tokens, escrow, tax logic, reminders, or accounting integrations.
- Treating web-search results as confirmed legal identity data.
- Requiring Gmail PDF attachment for the core demo.
- Bazantic unless every core acceptance criterion passes early; then at most a one-hour out-of-schedule spike.
- Additional PDF templates or customization beyond one verified restrained layout.

## Blockers

- Exact submission cutoff time/timezone remains unverified.
- No product or sponsor integration has been exercised; only the application shell is runnable.
- `payrlink.xyz` nameservers/A records have begun resolving, but HTTPS and Resend SPF/DKIM verification are not yet proven.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, funded wallets, and native-USDC behavior must pass Task 1/Task 6 live checks.
- Arc mainnet-launch prize requires availability or deployment-readiness work through 30 September.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- Branch: `main`.
- The pre-existing untracked `assets/` directory remains untouched pending a brand-ownership/tracking decision.

## Readiness

- Product: GREEN — the user, pain, promise, onchain necessity, and non-goals are approved.
- Engineering: YELLOW — the architecture, executable plan, and verified shell exist, but no product integration proof exists.
- Demo: YELLOW — the causal three-minute sequence and honest fallback are defined, but unexercised.
- Submission: RED — the public repository exists, but there is no deployed app, architecture graphic, video, or final submission.

## Next review gate

The local Task 1 shell remains green and every external prerequisite has a recorded outcome. Task 2 may begin with Arc/Vercel blockers still explicit; a public preview is mandatory before Task 9 deployed connector proof and Task 10 release proof.
