#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

import {
  assertSingleVersionChange,
  assertUnchangedVersionHistory,
  compareVersions,
  normalizeVersionTag,
} from "./release-utils.mjs";

const usage = "Usage: pnpm release:tag -- [vX.Y.Z|X.Y.Z]";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function capture(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

function readRemoteTag(tag) {
  const output = capture("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  if (!output) return null;

  const refs = new Map(output.split("\n").map((line) => line.split(/\s+/).reverse()));
  return {
    tagObject: refs.get(`refs/tags/${tag}`) ?? null,
    commit: refs.get(`refs/tags/${tag}^{}`) ?? null,
  };
}

function versionHistory(base, tip) {
  const commits = capture("git", ["rev-list", "--full-history", "--reverse", `${base}..${tip}`, "--", "package.json"])
    .split("\n")
    .filter(Boolean);
  return commits.map((commit) => ({
    commit,
    version: JSON.parse(capture("git", ["show", `${commit}:package.json`])).version,
  }));
}

function validateReleaseCommit(commit, releaseTag) {
  const parentLine = capture("git", ["rev-list", "--parents", "-n", "1", commit]).split(/\s+/);
  if (parentLine.length !== 3) fail(`${commit} must be an exact two-parent merge commit`);

  const firstParent = parentLine[1];
  const secondParent = parentLine[2];
  const branchContainsBase = spawnSync("git", ["merge-base", "--is-ancestor", firstParent, secondParent]);
  if (branchContainsBase.status !== 0) fail("Merged release head was not based on the merge commit's first parent");
  const mergeTreeMatchesHead = spawnSync("git", ["diff", "--quiet", secondParent, commit]);
  if (mergeTreeMatchesHead.status !== 0) fail("Release merge tree differs from the reviewed integration head");

  const releasePackageJson = capture("git", ["show", `${commit}:package.json`]);
  const firstParentPackageJson = capture("git", ["show", `${firstParent}:package.json`]);
  const firstParentPackage = JSON.parse(firstParentPackageJson);
  const preReleaseCommit = `${secondParent}^`;
  const preReleasePackageJson = capture("git", ["show", `${preReleaseCommit}:package.json`]);
  let releaseChange;
  try {
    assertUnchangedVersionHistory(firstParentPackage.version, versionHistory(firstParent, preReleaseCommit));
    releaseChange = assertSingleVersionChange(
      firstParentPackageJson,
      preReleasePackageJson,
      releasePackageJson,
      releaseTag,
    );
  } catch (error) {
    fail(error.message);
  }

  const secondParentSubject = capture("git", ["log", "-1", "--pretty=%s", secondParent]);
  if (secondParentSubject !== `chore: release ${releaseTag}`) {
    fail(`Merged PR head must end with chore: release ${releaseTag}`);
  }
  const secondParentFiles = capture("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", secondParent]);
  if (secondParentFiles !== "package.json") fail("Merged release head's final commit must change only package.json");

  const previousTag = `v${firstParentPackage.version}`;
  const previousRemoteTag = readRemoteTag(previousTag);
  if (!previousRemoteTag?.commit) fail(`Remote ${previousTag} must be an annotated tag`);
  if (previousRemoteTag.commit !== firstParent) {
    fail(`${previousTag} must target the release merge's first parent exactly`);
  }
  const previousPackage = JSON.parse(capture("git", ["show", `${previousRemoteTag.commit}:package.json`]));
  if (previousPackage.version !== firstParentPackage.version) {
    fail(`${previousTag} package version does not match first-parent version ${firstParentPackage.version}`);
  }
  if (compareVersions(releaseChange.releaseVersion, previousTag.slice(1)) <= 0) {
    fail(`${releaseTag} must be greater than ${previousTag}`);
  }
}

const argumentsList = process.argv.slice(2);
if (argumentsList[0] === "--") argumentsList.shift();
if (argumentsList.length > 1) fail(usage);

run("git", ["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main", "--tags"]);
const remoteMain = capture("git", ["rev-parse", "refs/remotes/origin/main"]);

let requestedTag;
try {
  requestedTag = argumentsList[0] ? normalizeVersionTag(argumentsList[0]) : null;
} catch (error) {
  fail(error.message);
}

const requestedRemoteTag = requestedTag ? readRemoteTag(requestedTag) : null;
if (requestedRemoteTag && !requestedRemoteTag.commit) fail(`Remote ${requestedTag} is not an annotated tag`);

let targetCommit;
if (process.env.PAYR_RELEASE_COMMIT) {
  try {
    targetCommit = capture("git", ["rev-parse", "--verify", `${process.env.PAYR_RELEASE_COMMIT}^{commit}`]);
  } catch {
    fail("PAYR_RELEASE_COMMIT must resolve to a fetched commit");
  }
} else if (requestedRemoteTag?.commit) {
  targetCommit = requestedRemoteTag.commit;
} else {
  targetCommit = remoteMain;
}

const targetOnMain = spawnSync("git", ["merge-base", "--is-ancestor", targetCommit, remoteMain]);
if (targetOnMain.status !== 0) fail("Release target must be reachable from current origin/main");

const targetPackage = JSON.parse(capture("git", ["show", `${targetCommit}:package.json`]));
let releaseTag;
try {
  releaseTag = requestedTag ?? normalizeVersionTag(targetPackage.version);
} catch (error) {
  fail(error.message);
}

const remoteTag = readRemoteTag(releaseTag);
if (remoteTag && !remoteTag.commit) fail(`Remote ${releaseTag} is not an annotated tag`);
if (remoteTag?.commit && remoteTag.commit !== targetCommit) {
  fail(`Remote ${releaseTag} does not target requested release commit ${targetCommit}`);
}

validateReleaseCommit(targetCommit, releaseTag);

if (remoteTag?.commit) {
  console.log(`Release ${releaseTag} is already published at ${targetCommit}.`);
  process.exit(0);
}

const localType = spawnSync("git", ["cat-file", "-t", `refs/tags/${releaseTag}`], { encoding: "utf8" });
if (localType.status === 0) {
  if (localType.stdout.trim() !== "tag") fail(`Local ${releaseTag} is not annotated`);
  if (capture("git", ["rev-list", "-n", "1", releaseTag]) !== targetCommit) {
    fail(`Local ${releaseTag} does not target requested release commit`);
  }
} else {
  run("git", ["tag", "--annotate", "--no-sign", releaseTag, targetCommit, "--message", releaseTag]);
}

run("git", ["push", "origin", `refs/tags/${releaseTag}`]);
const publishedTag = readRemoteTag(releaseTag);
if (!publishedTag?.commit || publishedTag.commit !== targetCommit) {
  fail(`Remote read-back for ${releaseTag} did not resolve to ${targetCommit}`);
}

console.log(`Published ${releaseTag} at merge commit ${targetCommit}.`);
