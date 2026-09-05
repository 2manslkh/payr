# Versioning

Payr uses stable Semantic Versioning. `package.json` is the version source of truth. Every merge into `main` is a release PR whose resulting merge commit receives one annotated Git tag named `vX.Y.Z`.

## Trigger

When the user says `cut new version`, execute this workflow in the same turn. If the user supplies a bump or exact version, use it. Otherwise inspect commits since the latest version tag and choose:

- `major` for an incompatible public API, persisted-data, contract, or behavior change;
- `minor` for backward-compatible functionality;
- `patch` for backward-compatible fixes, documentation, tests, build, or internal changes.

When no version tag exists, treat the current `package.json` version on `origin/main` as the baseline and create its annotated baseline tag before preparing the first release PR.

## Prepare The PR

1. Inspect `git status --short --branch`, `git diff`, `git log --oneline -10`, and existing version tags. Account for every tracked change before proceeding.
2. Work on a non-`main` integration branch based on current `origin/main`. Commit every intended file and remove unintended untracked files.
3. Run `pnpm release:prepare -- <major|minor|patch|X.Y.Z>`. It validates tag ancestry and uniqueness, runs `pnpm verify` and `pnpm test:e2e`, updates only `package.json`, and creates final branch commit `chore: release vX.Y.Z`. It does not tag.
4. Run `pnpm release:verify`. Push the integration branch and open or update a PR titled `[vX.Y.Z] <tranche summary>`.
5. Record the base tag/SHA, included tickets, migrations, contract/schema changes, automated and live evidence, blockers, and forward-fix strategy in the PR body.
6. Merge only when required checks pass and the branch is current. Use GitHub's merge-commit method; do not squash or rebase the release PR.

Use `pnpm release:prepare -- <version> --dry-run` to inspect the proposed version without changing files, committing, tagging, or running release checks.

## Tag The Merge

1. The `publish-release-tag` CI job runs `pnpm release:tag` after every push to `main`. Its checkout uses the dedicated `PAYR_RELEASE_TAG_SSH_KEY` write deploy key, which may create protected version tags but cannot update or delete them. The command fetches `origin/main`, proves exact two-parent merge topology, proves the reviewed head was current and ended with the only version change, creates the annotated tag on that merge commit, pushes only the tag, and reads it back from the remote.
2. Run `pnpm release:tag -- vX.Y.Z` manually as an idempotent read-back. To recover a missing tag after `main` advances, run `PAYR_RELEASE_COMMIT=<merge-sha> pnpm release:tag -- vX.Y.Z`.
3. Verify the tag target, `package.json` at the tagged commit, merged PR, and post-merge `main` CI.
4. GitHub deletes the remote integration branch after merge. Keep local agent branches and worktrees until the tag and post-merge CI are green.

Tags are immutable. If post-merge CI fails, preserve the tag and create a patch release PR. Never add a corrective commit directly to `main` and never move or delete a published version tag.
