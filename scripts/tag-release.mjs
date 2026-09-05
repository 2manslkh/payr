#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

import {
  assertReleasePackageChange,
  compareVersions,
  latestVersionTag,
  normalizeVersionTag,
} from "./release-utils.mjs";

const usage = "Usage: pnpm release:tag -- <vX.Y.Z|X.Y.Z>";

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
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

const argumentsList = process.argv.slice(2);
if (argumentsList[0] === "--") argumentsList.shift();
if (argumentsList.length !== 1) fail(usage);

let releaseTag;
try {
  releaseTag = normalizeVersionTag(argumentsList[0]);
} catch (error) {
  fail(error.message);
}

run("git", ["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main", "--tags"]);
const remoteMain = capture("git", ["rev-parse", "refs/remotes/origin/main"]);
const parentLine = capture("git", ["rev-list", "--parents", "-n", "1", remoteMain]).split(/\s+/);
if (parentLine.length < 3) fail("origin/main must point to a merge commit before release tagging");

const releasePackageJson = capture("git", ["show", `${remoteMain}:package.json`]);
const firstParentPackage = JSON.parse(capture("git", ["show", `${remoteMain}^1:package.json`]));
const preReleasePackageJson = capture("git", ["show", `${remoteMain}^2^:package.json`]);
let releaseChange;
try {
  releaseChange = assertReleasePackageChange(preReleasePackageJson, releasePackageJson, releaseTag);
} catch (error) {
  fail(error.message);
}

if (compareVersions(releaseChange.releaseVersion, firstParentPackage.version) <= 0) {
  fail(`${releaseTag} must be greater than first-parent package version ${firstParentPackage.version}`);
}

const secondParentSubject = capture("git", ["log", "-1", "--pretty=%s", `${remoteMain}^2`]);
if (secondParentSubject !== `chore: release ${releaseTag}`) {
  fail(`Merged PR head must end with chore: release ${releaseTag}`);
}

const previousTags = capture("git", ["tag", "--list"])
  .split("\n")
  .filter((tag) => tag && tag !== releaseTag);
const previousTag = latestVersionTag(previousTags);
if (previousTag) {
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", previousTag, `${remoteMain}^1`]);
  if (ancestor.status !== 0) fail(`${previousTag} is not an ancestor of the release merge's first parent`);
  if (compareVersions(releaseChange.releaseVersion, previousTag.slice(1)) <= 0) {
    fail(`${releaseTag} must be greater than ${previousTag}`);
  }
}

const remoteTag = readRemoteTag(releaseTag);
if (remoteTag) {
  if (!remoteTag.commit) fail(`Remote ${releaseTag} is not an annotated tag`);
  if (remoteTag.commit !== remoteMain) fail(`Remote ${releaseTag} does not target current origin/main`);
  console.log(`Release ${releaseTag} is already published at ${remoteMain}.`);
  process.exit(0);
}

const localType = spawnSync("git", ["cat-file", "-t", `refs/tags/${releaseTag}`], { encoding: "utf8" });
if (localType.status === 0) {
  if (localType.stdout.trim() !== "tag") fail(`Local ${releaseTag} is not annotated`);
  if (capture("git", ["rev-list", "-n", "1", releaseTag]) !== remoteMain) {
    fail(`Local ${releaseTag} does not target current origin/main`);
  }
} else {
  run("git", ["tag", "--annotate", "--no-sign", releaseTag, remoteMain, "--message", releaseTag]);
}

run("git", ["push", "origin", `refs/tags/${releaseTag}`]);
const publishedTag = readRemoteTag(releaseTag);
if (!publishedTag?.commit || publishedTag.commit !== remoteMain) {
  fail(`Remote read-back for ${releaseTag} did not resolve to ${remoteMain}`);
}

console.log(`Published ${releaseTag} at merge commit ${remoteMain}.`);
