# Review Reliability Fixes

Base: `v0.6.0` / `0d122231b0252f587a59868022b65dea83f6d525`. Worktree: `.worktrees/review-fixes`. This is a fixes-only integration, not the separate root client-payment/reconciliation slice. Package version changes only in the release tool's final commit; the merged PR and annotated tag establish completion.

Release target: `v1.0.0`, because requiring a reviewed profile ID changes the public HTTP contract. The repository's stable SemVer rules require a major bump, even for a safety correction. This version number is not a claim that receipts, durable delivery, browser-payment integration, or Claude MCP are complete.

## Changes

- Additive migration `202609080001_publication_fairness.sql` replaces only publication claim ordering: least-recent update first, then original creation order and ID. Claiming advances `updated_at`, so old retryable failures yield to untouched work. State checks, invoice locks, targeted selection, lease duration, fence increments, and function grants remain unchanged. Earlier migrations are not edited; the timestamp avoids the separately developed reconciliation migrations 006/007.
- Sender HTTP writes require the reviewed `expectedProfileId` as well as `expectedRevision`. The immutable ID is checked against the session-authorized profile before the existing transactional revision check. It never selects authority. Missing IDs fail validation; mismatches return redacted `PROFILE_CHANGED` without writing. Existing Settings tabs must reload and direct HTTP callers must include the reviewed ID. The internal SQL/RPC schema is unchanged.
- Conflict review and payout refresh cannot adopt another workspace's profile. The form captures its reviewed ID at mount, independently of later parent props. Form edits remain local and the user is told to reopen Settings.
- Email images explicitly style readable alternative text. Invoice workflow copy describes implemented publication/documents without claiming connected MCP.
- Receipt/email retry documentation follows the higher-priority framing spec: capped jittered backoff with deterministic injected samples in tests. F3 publication's distinct lease-expiry protocol is unchanged.

## Evidence

Before fixes, both real database queue regressions selected the older failing attempt instead of the newer invoice. The HTTP precondition test accepted a write without a reviewed profile identity; the form omitted that identity. Email computed styles confirmed zero-size alternative text.

After fixes, 103 focused database/real-signature route tests passed, including rendering/stored fairness, stale-fence rejection, and a real second login whose same-revision profile remains unchanged after a stale save. Focused profile, console, and email tests passed. Final release gates and independent review results are recorded in the PR.

Independent review found a parent-prop rebinding path through payout refresh. Both a direct form rerender and a Settings-level payout-refresh regression reproduced it before the correction. The complete database gate also identified one legacy-country HTTP test consumer missing the new precondition; that consumer was updated rather than relaxing admission. The F2 HTTP freeze now distinguishes the required request assertion from the unchanged internal RPC.

After those corrections, all 436 database tests across nine files and all 129 focused HTTP/console/email/copy tests passed. The pinned Foundry 1.4.0 gate passed 15 contract tests, including 256 fuzz runs, formatting, and ABI drift. Independent correctness/security and standards/spec reviewers rechecked their findings and reported no remaining material issues. Build, full unit, compiled-document, browser, and remote release results belong to the final release gate/PR record.

## Isolation And Rollout

Verification uses a dedicated Docker-in-Docker runner with a different daemon and loopback network, no host Docker socket, no published host ports, and no live environment files. The preserved demo and the existing R08 stack are never reset. Full database/browser fixtures run only inside this disposable runner.

This release request does not deploy a working-tree application, apply hosted migrations, broadcast payments, or send email. Integrate this fix with the separately deployed client-payment source before a hosted rollout; do not replace that deployment with the narrower patch snapshot. Apply the additive migration through the authorized database rollout process. Any post-merge regression receives a forward-fix release; never move an immutable tag.

## Diagram Gate

The user-owned `docs/architecture.excalidraw.svg` and unrelated brand images are deliberately excluded. Before submission, clearly label tokenization, credit scoring, financing pools and Aave-related elements as future scope, and distinguish the deployed invoicing/settlement path. No diagram content is silently overwritten by this patch.
