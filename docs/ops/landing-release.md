# Landing Release

Target: v1.1.0. Base: v1.0.0, `2dbf93d917940d343483f1e2636e7e6d944456ca`.

## Scope

Landing-only functionality: clearer product/problem narrative, a five-stage scroll-driven Three.js workflow, local brand assets, responsive and reduced-motion/static fallbacks, and regression coverage. The invoice reads "Service delivered." The wallet illustration presses Pay and crossfades its contents to a verification check inside the same popup; the receipt finale layers a full-size document with a red PAID stamp.

No payment backend, dashboard, installation flow, database migration, contract, or authentication change is included. The current root checkout and its unrelated uncommitted work remain untouched. Package additions are limited to Three.js and its TypeScript definitions.

The released v1.0.0 base includes settlement authorization and operator-payment evidence, not the separate root browser-payment/reconciliation work. Landing and search copy mark client wallet payments, automatic reconciliation, Claude integration, and receipts as upcoming. The animation is inert, synthetic, and labeled illustrative.

## Verification and Rollout

Release preparation follows `docs/ops/versioning.md`. Database reset and destructive fixtures run only inside a fresh disposable Docker-in-Docker runner with a separate daemon and loopback network. No host Docker socket, host ports, live environment files, existing Supabase volumes, or preserved local/demo records are used.

The release PR records final automated evidence, merge SHA, and tag read-back. Earlier root worktree test counts in design notes are development evidence, not the release gate. No hosted rollout, migration, payment, or email is authorized by this release. Merge through the protected release workflow and retain immutable tags; any regression receives a forward-fix release.
