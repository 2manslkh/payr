# One-Click Mainnet Readiness

**Status:** Approved target, not implemented or verified deployment capability.
**Owner:** Keng, with implementation and review lanes under the existing orchestration runbook.
**Deadline:** 30 September 2026. This does not extend the MVP submission deadline of 13 September at 12:00 EDT / 16:00 UTC.

## Outcome

After one-time account, infrastructure, secret, and signer provisioning, one operator-triggered protected GitHub Actions workflow deploys a reviewed Payr release to Arc mainnet and its paired application environment. The operator selects an immutable release tag and reviews the target before approval; the workflow performs the remaining steps without manual SQL, address copying, or environment-file edits. Required environment approval is part of the safety boundary, not an obstacle to remove for a one-click claim.

This covers the existing invoicing and client-controlled payment product. It does not add autonomous spending, credit scores, lending, or escrow. The workflow and mainnet signer are future implementation work; this document is not evidence that they exist.

## Schedule

| Window | Deliverable | Gate |
| --- | --- | --- |
| Before 13 September submission | Finish the real testnet journey; capture deployment inputs/read-back; document the mainnet rollout and outstanding prerequisites in the submission | No mainnet-ready claim based only on a testnet payment or this plan |
| 14-20 September | Resolve official mainnet facts and sponsor readiness evidence; implement the protected workflow, isolated environment, and reviewed mainnet signing path | Keng records remaining effort and available operator time before work is dispatched |
| 21-27 September | Exercise the same deployment orchestration on a safe environment; test missing prerequisites, interrupted runs, retries, and verification failures | A clean runner completes without hidden workstation state or manual configuration edits |
| 28-29 September | Independent security/operations review, evidence capture, and operator go/no-go | All readiness checks below are evidenced; unresolved failures remain blockers |
| By 30 September | Mainnet deployment, if explicitly authorized and available, or sponsor-accepted deployment-readiness evidence | Record which outcome was actually achieved; do not describe a dry run as a mainnet deployment |

This work has a separate post-submission budget, to be estimated from the shipped testnet baseline. It must not consume the final MVP recording/submission reserve. If the estimate misses September 30, escalate immediately rather than assume uncommitted hours or weaken gates.

## One-Time Prerequisites

- Confirm current Arc mainnet availability, chain ID, RPC, explorer, native-USDC behavior, and deployment requirements from authoritative sources. Never invent mainnet values or silently substitute testnet endpoints.
- Provision the intended hosted application, private database/storage, domain/TLS, worker scheduling, and verified receipt-email sender. Select explicit project/environment identities, not whatever a developer CLI happens to have linked.
- Provision narrowly scoped CI credentials and a protected mainnet environment. Keep production secrets out of PR checks, logs, artifacts, source control, and local test fixtures.
- Implement and review a mainnet-appropriate adapter behind `PaymentSigner`, with exact chain/contract/message restrictions and separate attestor/deployer/payer authority. The testnet-only signer must still refuse mainnet; never enable it by bypassing its guard. Privy is a candidate only if its actual compatibility and policy tests pass, not an assumed dependency.
- Fund and approve the intended deployer and any explicitly authorized canary payer separately. Payr never receives the client's payer private key. Mainnet transaction budgets and recipient/amount review are operator decisions.
- Establish recovery, monitoring, retained-key handling, and the operator contact. Freeze the canonical origin before publishing immutable links; preserve testnet records, their original chain/contract bindings, origins, and keys in an isolated environment.

## Workflow Contract

Proposed implementation outputs are `.github/workflows/deploy-mainnet.yml`, a deployment orchestrator under `scripts/`, and a public verified deployment manifest under `contracts/deployments/`. Final file ownership and interfaces freeze before fanout. Do not create a decorative deploy button that bypasses this contract.

1. Accept one immutable release tag. Resolve its commit, require successful release checks and mainnet environment approval, and serialize deployment attempts. An ordinary push, pull request, or test job must never broadcast mainnet transactions.
2. Validate explicit target identities, official chain facts, bytecode/ABI, database migration compatibility, signer mode, secret presence, balances/budget, origin, and required services before any irreversible action. Dry-run/preflight mode makes no mainnet writes. Missing or unknown prerequisites fail closed.
3. Apply additive migrations to the isolated target database and verify constraints, private storage, and direct-access denial. Never run `db reset`, overwrite testnet data, or migrate old invoice bindings to the new contract.
4. Deploy the reviewed immutable-attestor contract, or resume a verified prior deployment for the same release/target. Read back receipt, chain, address, attestor, bytecode hash, and deployment block before publishing its manifest. Persist enough non-secret checkpoints to resolve an interrupted/ambiguous broadcast before retrying; never blindly deploy twice.
5. Automatically bind the verified deployment into the target application configuration and deploy that same release. Preserve historical deployment identities and immutable document URLs; no manual address copying or global retargeting of existing invoices.
6. Verify HTTPS health, exact configured chain/contract, auth, protected document serving, real PDF/QR/storage behavior, scheduled reconciliation/receipt/outbox work, and receipt-sender configuration. Exercise an explicitly approved capped payment if permitted; otherwise disclose the precise limit of non-broadcast verification.
7. Mark the deployment ready only after read-back succeeds. Report a secret-free summary containing release SHA, public contract/attestor addresses, transaction/bytecode facts, application origin, check outcomes, and outstanding limitations. Never include connector credentials, protected invoice/receipt URLs, payer keys, or private billing data.

## Failure And Evidence Gates

- A failed preflight broadcasts nothing. A partially completed run resumes from verified checkpoints or stops for operator resolution; an HTTP retry is not permission to repeat an irreversible transaction.
- The contract and chain history cannot be rolled back. A failed application rollout must not erase settlement evidence or rebind old invoices. Recover through a compatible known-good application release or a reviewed forward fix while preserving independent reconciliation.
- Test wrong-chain/missing-secret/testnet-signer refusal, failed migrations, interrupted contract deployment, repeated dispatch, denied private storage, failed post-deploy checks, and unchanged testnet bindings. Do not fund or send real-money negative tests without explicit approval.
- From a clean runner, one authorized dispatch against provisioned services must complete the workflow without manual repairs. Record the workflow URL, release and manifest, verification outcomes, and operator acceptance. Account provisioning and prior approvals must be disclosed when describing the one-click experience.
- Ask Arc what evidence it accepts as "deployment-ready" and whether additional registration is required. The prize page does not define the term operationally. A rehearsed testnet workflow, a runbook, or an unavailable mainnet does not automatically establish sponsor acceptance.
- If readiness cannot be evidenced by September 30, report that honestly and do not claim the Launch prize requirement is met. Preserve the separate DeFi/Onchain Finance submission and its actual testnet evidence.

## Sources

- Arc prize and September 30 condition: https://ethglobal.com/events/ethonline2026/prizes/arc
- Submission deadline and video requirements: https://ethglobal.com/events/ethonline2026/info/details
- Official Arc deployment documentation, to be rechecked for the selected network: https://docs.arc.io/integrate/deploy-on-arc.md

The deadline/prize sources were checked on 6 September 2026. No mainnet network values, signer acceptance, deployment, or sponsor readiness approval are asserted by this document.
