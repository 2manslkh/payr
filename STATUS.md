# Status

Last updated: 2026-09-06

## Stage

R00-R05 are released through `v0.4.0`. R06 real invoice PDF/QR, immutable private Storage, protected HTML/PDF routes, and compiled publication are integrated and verified locally. Positioned PDF rows close the final money-binding security finding; standards/specification/security findings are resolved within the reviewed scope. The protected release and post-merge checks remain the completion gate. Hosted rollout is not claimed.

## Single current objective

Complete the protected R06 `v0.5.0` release, verify its tag and post-merge checks, then proceed to R07 under the user's current calendar and operator-capacity plan. This is a pre-release evidence snapshot; the merged PR read-back supersedes it.

## Selected concept

Payr: one agent instruction creates a confirmed invoice, PDF, QR, and protected Arc USDC payment link for an independent developer; a verified settlement automatically produces and emails a linked receipt.

## Selected experience

`Commit Ledger`: an agent-first operations console and protected client payment experience built around document clarity, separate commercial/payment state, and concentrated Arc settlement proof. The arrow-R monogram remains and the wordmark is standardized as `Payr`; `DESIGN.md` is the pre-implementation visual contract.

## Now

- Release the integrated structural repair `8fb06d3`; final local evidence is in `docs/ops/r06-documents.md`.
- Preserve the required post-build package gate: `web` and local `pnpm verify` run `pnpm test:documents:package`, not only pre-build units.
- Keep `https://payrlink.xyz` and its secret-free health route as the intended public origin; `https://payr-sandy.vercel.app` is the verified fallback.
- Keep R06 worktrees until the release tag and post-merge CI are green, then remove the merged branches with ordinary ancestry-safe deletion.
- Submission calendar and roadmap are owned by the user's separate current planning, not this R06 release snapshot; concurrent planning/branding/email/diagram edits are not imported here.
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

- Real EOA signatures and identity transactions pass against local Supabase; they are not a live funded-wallet payment, Claude connector, or email delivery.
- Resend sender-domain SPF/DKIM verification and two receipt-inbox tests are not yet proven.
- Hosted Supabase and deployment configuration remain unverified by this tranche. Local config, migrations, reset, and hostile-access tests pass.
- R06's protected release/tag and hosted validation remain open. Real publication requires configured chain/contract/link keys and Supabase; no fake adapter or browser authoring is provided.
- PDF fields support printable ASCII plus LF only; unsupported text fails closed without transliteration or invented legal facts. Receipts are R08, wallet authorization/payment R07/R09, and MCP R09; R06 does not deliver payments, receipts, or email.
- Claude custom-connector availability and funded Arc deployment/payer balances require human confirmation.
- Privy's optional policy-controlled EIP-712 signing and contract compatibility are unproven and are not a core blocker.
- Arc testnet RPC, chain, explorer, and native-USDC behavior are verified; Task 6 live deployment/payment still requires funded-wallet evidence.
- Arc mainnet-launch prize requires availability or deployment-readiness work through 30 September.

## Known Risks

Unchanged R05 reliability risk: pre-release nonce issuance twice returned `400` locally; one failure reached the existing strict timestamp guard. Subsequent 21 isolated auth-flow runs and a fresh complete 406-test database gate passed. Transient cross-runtime clock sensitivity remains unresolved and suspected, not proven; keep strict auth checks and stop release preparation on recurrence. Details: `docs/ops/r05-publication.md`.

Protected HTML has a remaining verification gap for denial-status uniformity if a credential becomes invalid after live admission. This is not an established confidentiality bypass: the request was live at admission. PDF post-download access revalidation is covered. Details: `docs/ops/r06-documents.md`.

## Repository

- Public repository: `https://github.com/2manslkh/payr`.
- R06 base release: `v0.4.0` at `6761096fba1ed2900d5fedfc91416d1b270dafdd`.
- R06 integration branch: `integration/r06-documents-v0.5.0`, isolated in `.worktrees/r06-integration`; documentation handoff baseline `7a8a8e7`.
- Public shell: `https://payrlink.xyz`; health reports the deployed integration commit without configuration details.
- The four approved `assets/brand/` reference files are part of R00.

## Readiness

- Product: GREEN - the user, pain, promise, onchain necessity, and non-goals are approved.
- Design: GREEN - `Commit Ledger`, the responsive surface model, and brand treatment are approved; implemented fidelity remains unproven.
- Engineering: YELLOW - local document/publication and structural security gates pass; protected release, live payment, and hosted integration proof remain.
- Demo: YELLOW - the causal three-minute sequence and honest fallback are defined, but unexercised by this tranche.
- Submission: RED - R06 does not establish a live product demo, final architecture graphic, video, or submission; separate user artifact work is outside this snapshot.

## Next review gate

Prepare the final version-only commit after the clean local gate. The release PR must pass `web`, `browser`, `database`, and `release-metadata`. Trusted CI tags the merge; verify the tag and post-merge checks before removing merged lane worktrees. Preserve the user's dirty root worktree rather than forcing a fast-forward or overwriting concurrent changes. Remaining human/live gates stay explicit.
