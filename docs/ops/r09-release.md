# R09 Release

## Authorization And Baseline

Target: `v1.3.0`, a backward-compatible minor release for client payments and the four-tool stateless MCP endpoint. Base: `v1.2.0` / `8a87a76898badfc03dd9dc506ea3c3637e74a9dc`, PR #11. The user explicitly authorized commit/deploy/release with recorded limits on 8 September 2026. Full deployed Claude and external-wallet acceptance remain unverified; no payment, email-send, connector-creation, or fixture-publication approval is implied.

The implementation and independent-review evidence is in `r09-implementation.md`: 1,948 unit/PDF tests, 467 isolated DB tests, 72 desktop/mobile browser tests, 10 release-tool tests, 35 compiled-document tests, lint, typecheck, build, and trace gates passed. Release preparation must rerun its required gates from clean committed source using the isolated daemon, never the retained root database.

## Production Preservation

Preflight read-back: `https://payrlink.xyz` resolves to Ready production deployment `dpl_Ave3eaQRB2L4YzTwk4LBiHN9zNFS`. Project `payr` is `prj_R4DxZQB45pzsJXipvcpmwa2xPni4`, Node 22, and its Git-triggered deployments are disabled. Keep that setting unchanged so a narrower or unintended branch snapshot cannot replace production.

The application origin and Arc testnet mode were read back. Sensitive Vercel variables are write-only in read-back responses; their empty exported values do not mean the configured production secrets are absent. Preserve existing project variables and enforce `PAYR_RECEIPT_EMAIL_ENABLED=false` on the approved deployment. Keep daily reconciliation/receipt/outbox schedules at 00:00/00:05/00:10 UTC. Do not change hosted data, frozen document links, or consumed send/payment journals.

No migrations, Solidity contracts, or ABI changes are introduced by R09. Hosted application of earlier fairness/jitter forward migrations was not established in the R08 evidence and is not silently asserted here.

## Outcome

Deployment and protected release are pending at the implementation commit. Record the deployment ID/URL, commit SHA, health read-back, generic MCP denial, preserved configuration, PR URL, merge/tag, and post-merge CI in the next evidence checkpoint and protected PR. Live Claude and external-wallet smoke remain explicitly outside the release acceptance claim.
