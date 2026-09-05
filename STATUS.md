# Status

Last updated: 2026-09-04

## Stage

Revised product framing has been grilled and incorporated into the written design; the updated artifact is awaiting user review. Implementation planning has not started.

## Single current objective

Review and approve the revised `docs/superpowers/specs/2026-09-04-payr-framing-design.md`, then convert it into a testable vertical-slice implementation plan.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Now

- Review the revised written framing/design spec for scope or product corrections.
- Confirm the exact submission cutoff time and timezone in the authenticated ETHGlobal dashboard.
- After written approval, produce an implementation plan with vertical-slice gates.
- Verify Arc details/balances, `payrlink.xyz` HTTPS, Resend DNS, Claude Gmail, and the Privy allow/deny policy spike before relying on them.

## Not now

- Application scaffolding or contract implementation before written-spec approval.
- Autonomous payer agents or Circle Agent Stack.
- Dual-party invoice signatures or agent payout-wallet edits.
- Fiat onboarding, multiple chains/tokens, escrow, tax logic, reminders, or accounting integrations.
- Treating web-search results as confirmed legal identity data.
- Requiring Gmail PDF attachment for the core demo.
- Bazantic beyond a one-hour spike after the Arc journey works.
- Additional PDF templates or customization beyond one verified restrained layout.

## Blockers

- Written design has not yet been reviewed by the user.
- Exact submission cutoff time/timezone remains unverified.
- No integration has been exercised; there is no runnable build.
- `payrlink.xyz` nameservers/A records have begun resolving, but HTTPS and Resend SPF/DKIM verification are not yet proven.
- Privy's policy-controlled EIP-712 signing and contract compatibility are unproven.
- Arc mainnet-launch prize requires availability or deployment-readiness work through 30 September.

## Readiness

- Product: GREEN — narrow user, firsthand pain, promise, and non-goals are defined.
- Engineering: YELLOW — credible design exists, but no code or integration proof exists.
- Demo: YELLOW — causal three-minute sequence and honest fallback are defined, but unexercised.
- Submission: RED — framing is committed locally, but there is no public repository, deployment, architecture graphic, video, or final submission.

## Next review gate

User approves the written design spec. The following action is implementation planning, not coding.
