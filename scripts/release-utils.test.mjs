import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertReleasePackageChange,
  assertSingleVersionChange,
  assertUnchangedVersionHistory,
  bumpVersion,
  compareVersions,
  latestVersionTag,
  normalizeVersionTag,
  parseStableVersion,
} from "./release-utils.mjs";

test("parses stable semantic versions and rejects aliases or prereleases", () => {
  assert.deepEqual(parseStableVersion("0.8.1", "Version"), [0n, 8n, 1n]);
  assert.throws(() => parseStableVersion("v0.8.1", "Version"), /stable semantic version/);
  assert.throws(() => parseStableVersion("0.8.1-rc.1", "Version"), /stable semantic version/);
  assert.throws(() => parseStableVersion("01.2.3", "Version"), /stable semantic version/);
});

test("bumps each semantic version component", () => {
  assert.equal(bumpVersion("0.8.1", "major"), "1.0.0");
  assert.equal(bumpVersion("0.8.1", "minor"), "0.9.0");
  assert.equal(bumpVersion("0.8.1", "patch"), "0.8.2");
});

test("compares arbitrarily large stable versions", () => {
  assert.equal(compareVersions("999999999999999999.0.0", "2.0.0"), 1);
  assert.equal(compareVersions("0.8.1", "0.8.1"), 0);
  assert.equal(compareVersions("0.8.0", "0.8.1"), -1);
});

test("normalizes exact versions and annotated tag names", () => {
  assert.equal(normalizeVersionTag("0.8.1"), "v0.8.1");
  assert.equal(normalizeVersionTag("v0.8.1"), "v0.8.1");
  assert.throws(() => normalizeVersionTag("release-0.8.1"), /stable semantic version/);
});

test("selects the highest stable version tag and ignores unrelated tags", () => {
  assert.equal(latestVersionTag(["notes", "v0.10.0", "v1.0.0-rc.1", "v0.9.4"]), "v0.10.0");
  assert.equal(latestVersionTag(["notes", "v1.0.0-rc.1"]), null);
});

test("accepts a release commit that changes only the package version", () => {
  const before = JSON.stringify({ name: "payr", version: "0.8.0", scripts: { test: "vitest" } });
  const after = JSON.stringify({ name: "payr", version: "0.8.1", scripts: { test: "vitest" } });

  assert.doesNotThrow(() => assertReleasePackageChange(before, after, "v0.8.1"));
});

test("rejects release commits containing another package change", () => {
  const before = JSON.stringify({ name: "payr", version: "0.8.0", scripts: { test: "vitest" } });
  const after = JSON.stringify({ name: "payr", version: "0.8.1", scripts: { test: "node --test" } });

  assert.throws(() => assertReleasePackageChange(before, after, "v0.8.1"), /only package.json version/);
});

test("rejects a package version changed before the final release commit", () => {
  const base = JSON.stringify({ name: "payr", version: "0.8.0", scripts: { test: "vitest" } });
  const preRelease = JSON.stringify({ name: "payr", version: "0.9.0", scripts: { test: "node --test" } });
  const release = JSON.stringify({ name: "payr", version: "0.10.0", scripts: { test: "node --test" } });

  assert.throws(
    () => assertSingleVersionChange(base, preRelease, release, "v0.10.0"),
    /only in the final release commit/,
  );
});

test("rejects a temporary version change that was restored before release", () => {
  assert.throws(
    () =>
      assertUnchangedVersionHistory("0.8.0", [
        { commit: "feature-a", version: "9.0.0" },
        { commit: "feature-b", version: "0.8.0" },
      ]),
    /feature-a contains 9\.0\.0/,
  );
});

test("verifies a release PR and tags the resulting merge commit", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "payr-release-"));
  const repository = join(fixtureRoot, "repository");
  const remote = join(fixtureRoot, "remote.git");
  const sourceScripts = dirname(fileURLToPath(import.meta.url));

  const git = (args, cwd = repository) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  try {
    execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
    execFileSync("git", ["init", "--initial-branch=main", repository], { stdio: "ignore" });
    git(["config", "user.name", "Release Test"]);
    git(["config", "user.email", "release@example.test"]);
    git(["config", "commit.gpgsign", "false"]);
    git(["config", "tag.gpgSign", "false"]);
    git(["remote", "add", "origin", remote]);

    mkdirSync(join(repository, "scripts"));
    for (const filename of [
      "release-utils.mjs",
      "prepare-release.mjs",
      "verify-release-pr.mjs",
      "tag-release.mjs",
    ]) {
      copyFileSync(join(sourceScripts, filename), join(repository, "scripts", filename));
    }

    const writePackage = (version, checkCommand) => {
      writeFileSync(
        join(repository, "package.json"),
        `${JSON.stringify({ name: "payr", version, private: true, scripts: { check: checkCommand } }, null, 2)}\n`,
      );
    };

    writePackage("0.1.0", "node baseline.mjs");
    git(["add", "package.json", "scripts"]);
    git(["commit", "-m", "chore: baseline"]);
    git(["tag", "--annotate", "--no-sign", "v0.1.0", "--message", "v0.1.0"]);
    git(["push", "origin", "main", "refs/tags/v0.1.0"]);

    git(["switch", "-c", "integration/test"]);
    writePackage("0.1.0", "node feature.mjs");
    git(["add", "package.json"]);
    git(["commit", "-m", "feat: add release fixture"]);

    const preparation = spawnSync(process.execPath, ["scripts/prepare-release.mjs", "patch", "--dry-run"], {
      cwd: repository,
      encoding: "utf8",
    });
    assert.equal(preparation.status, 0, preparation.stderr);
    assert.match(preparation.stdout, /Release preparation dry run: 0\.1\.0 -> 0\.1\.1/);

    writePackage("0.2.0", "node feature.mjs");
    git(["add", "package.json"]);
    git(["commit", "-m", "chore: release v0.2.0"]);

    const verification = spawnSync(process.execPath, ["scripts/verify-release-pr.mjs"], {
      cwd: repository,
      encoding: "utf8",
    });
    assert.equal(verification.status, 0, verification.stderr);
    assert.match(verification.stdout, /Verified release PR 0\.1\.0 -> 0\.2\.0/);

    git(["switch", "main"]);
    git(["merge", "--no-ff", "integration/test", "-m", "Merge pull request #1 from integration/test"]);
    const mergeCommit = git(["rev-parse", "HEAD"]);
    git(["push", "origin", "main"]);
    git(["config", "--unset", "user.name"]);
    git(["config", "--unset", "user.email"]);

    const tagging = spawnSync(process.execPath, ["scripts/tag-release.mjs"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: "github-actions[bot]",
        GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
        PAYR_RELEASE_COMMIT: mergeCommit,
      },
    });
    assert.equal(tagging.status, 0, tagging.stderr);
    assert.match(tagging.stdout, /Published v0\.2\.0 at merge commit/);

    const remoteTarget = git(["rev-parse", "v0.2.0^{}"], remote);
    assert.equal(remoteTarget, mergeCommit);
    assert.equal(JSON.parse(readFileSync(join(repository, "package.json"), "utf8")).version, "0.2.0");

    git(["config", "user.name", "Release Test"]);
    git(["config", "user.email", "release@example.test"]);
    writeFileSync(join(repository, "after-release.txt"), "later main state\n");
    git(["add", "after-release.txt"]);
    git(["commit", "-m", "test: advance main after release"]);
    git(["push", "origin", "main"]);

    const unsafeCurrentTagging = spawnSync(process.execPath, ["scripts/tag-release.mjs"], {
      cwd: repository,
      encoding: "utf8",
    });
    assert.notEqual(unsafeCurrentTagging.status, 0);
    assert.match(unsafeCurrentTagging.stderr, /does not target requested release commit/);

    const repeatedTagging = spawnSync(process.execPath, ["scripts/tag-release.mjs", "v0.2.0"], {
      cwd: repository,
      encoding: "utf8",
    });
    assert.equal(repeatedTagging.status, 0, repeatedTagging.stderr);
    assert.match(repeatedTagging.stdout, /already published/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
