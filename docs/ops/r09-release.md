# R09 Release

## Evidence Scope

This is the historical R09 `v1.3.0` release/deployment record. The repository baseline on `main` is now `v1.4.1` / `923ef3f` (PR #14 merged); that does not establish a newer production deployment. Root `integration/root-updates` retains unique discovery/roadmap commits and uncommitted dashboard/install/docs follow-up being integrated through approved feature-group commits and one combined PR into `main`. No final integration tests/PR outcome or release/deployment of that follow-up is claimed here.

## Authorization And Baseline

Target: `v1.3.0`, a backward-compatible minor release for client payments and the four-tool stateless MCP endpoint. Base: `v1.2.0` / `8a87a76898badfc03dd9dc506ea3c3637e74a9dc`, PR #11. The user explicitly authorized commit/deploy/release with recorded limits on 8 September 2026. Full deployed Claude and external-wallet acceptance remain unverified; no payment, email-send, connector-creation, or fixture-publication approval is implied.

The implementation and independent-review evidence is in `r09-implementation.md`: 1,948 unit/PDF tests, 467 isolated DB tests, 72 desktop/mobile browser tests, 10 release-tool tests, 35 compiled-document tests, lint, typecheck, build, and trace gates passed. Release preparation must rerun its required gates from clean committed source using the isolated daemon, never the retained root database.

## Production Preservation

Preflight read-back: `https://payrlink.xyz` resolves to Ready production deployment `dpl_Ave3eaQRB2L4YzTwk4LBiHN9zNFS`. Project `payr` is `prj_R4DxZQB45pzsJXipvcpmwa2xPni4`, Node 22, and its Git-triggered deployments are disabled. Keep that setting unchanged so a narrower or unintended branch snapshot cannot replace production.

The application origin and Arc testnet mode were read back. Sensitive Vercel variables are write-only in read-back responses; their empty exported values do not mean the configured production secrets are absent. Preserve existing project variables and enforce `PAYR_RECEIPT_EMAIL_ENABLED=false` on the approved deployment. Keep daily reconciliation/receipt/outbox schedules at 00:00/00:05/00:10 UTC. Do not change hosted data, frozen document links, or consumed send/payment journals.

No migrations, Solidity contracts, or ABI changes are introduced by R09. Hosted application of earlier fairness/jitter forward migrations was not established in the R08 evidence or this R09 preflight. That historical gap was later superseded by the [approved migration read-back](dashboard.md): all eleven repository migrations, including fairness, retry jitter, and dashboard overview, were applied and read back with matching names locally and on hosted Payr. That operation did not deploy application code.

## Outcome

The preflight above is historical. Release outcome was independently reconciled on 9 September 2026:

- [PR #12](https://github.com/2manslkh/payr/pull/12) merged on 8 September at 15:09:30 UTC as `2dfa8db159c19f95a5af9e99cb4a5a428b2c2e2a`.
- Remote annotated tag `v1.3.0`, object `10b9ce0c3084cb7cd11b1c443bd2f4ecca653279`, peels to that merge; tagged `package.json` is `1.3.0`.
- All required PR checks passed. [Post-merge CI run 34242942628](https://github.com/2manslkh/payr/actions/runs/34242942628) completed successfully.
- The PR records Ready/promoted production `dpl_JwRPqsTnqRgCnHRkNzSgrcEXpHDR`, `https://payr-himmxwrix-kenks-projects.vercel.app`, at reviewed release head `328fcdc26e5a817ded1a648771f301472637a240`. Git comparison confirms its tree is identical to the tagged merge.
- GETs to `https://payrlink.xyz/api/health` and `https://payr-sandy.vercel.app/api/health` during the 9 September R09 read-back returned `status: ok` and that exact release-head SHA. This is the recorded R09 health evidence, not a fresh check for the current integration or a new hosting-configuration audit.
- The PR's separately dated deployment read-back records generic invalid MCP HTTP 401, invalid invoice/receipt HTTP 404 with private headers, disabled Git-triggered deployments, preserved daily schedules, and `PAYR_RECEIPT_EMAIL_ENABLED=false`. No live mutation was needed for those checks.

Live Claude connector lifecycle, full external-wallet/mobile rehearsal under the approved WalletConnect CSP, human inbox opening, and unattended delivery remain outstanding. Hosted fairness/jitter migration read-back was outstanding at the R09 checkpoint but is now recorded separately in [dashboard operation](dashboard.md), alongside dashboard migration read-back. Release with recorded limits does not close the remaining live gates or authorize another payment/email. The retained pre-R09 production deployment is historical recovery evidence; this document does not freshly verify current deployed source.
