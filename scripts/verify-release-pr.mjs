#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  assertSingleVersionChange,
  assertUnchangedVersionHistory,
  compareVersions,
  latestVersionTag,
  normalizeVersionTag,
  parseStableVersion,
} from "./release-utils.mjs";

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
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) fail(result.stderr.trim() || `${command} ${args.join(" ")} failed`);
}

function remoteTagExists(tag) {
  const result = spawnSync("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`]);
  if (result.status === 0) return true;
  if (result.status === 2) return false;
  fail(`Unable to inspect remote tag ${tag}`);
}

function versionHistory(base, tip) {
  const commits = capture("git", ["rev-list", "--reverse", `${base}..${tip}`, "--", "package.json"])
    .split("\n")
    .filter(Boolean);
  return commits.map((commit) => ({
    commit,
    version: JSON.parse(capture("git", ["show", `${commit}:package.json`])).version,
  }));
}

const baseBranch = process.env.GITHUB_BASE_REF || "main";
run("git", [
  "fetch",
  "origin",
  `+refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`,
  "--tags",
]);

const baseRef = `refs/remotes/origin/${baseBranch}`;
const worktreeStatus = capture("git", ["status", "--porcelain", "--untracked-files=all"]);
if (worktreeStatus) fail("Release verification requires a clean worktree");

const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", baseRef, "HEAD"]);
if (ancestor.status !== 0) fail(`Release branch is not based on current origin/${baseBranch}`);

const currentPackageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const currentPackage = JSON.parse(currentPackageJson);
const basePackage = JSON.parse(capture("git", ["show", `${baseRef}:package.json`]));
parseStableVersion(currentPackage.version, "Release package version");
parseStableVersion(basePackage.version, "Base package version");

if (compareVersions(currentPackage.version, basePackage.version) <= 0) {
  fail(`Release package version ${currentPackage.version} must be greater than base ${basePackage.version}`);
}

const expectedTag = normalizeVersionTag(currentPackage.version);
const expectedSubject = `chore: release ${expectedTag}`;
if (capture("git", ["log", "-1", "--pretty=%s"]) !== expectedSubject) {
  fail(`Final integration commit subject must be exactly: ${expectedSubject}`);
}

const finalCommitFiles = capture("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
if (finalCommitFiles !== "package.json") fail("The final release commit must change only package.json");

const parentPackageJson = capture("git", ["show", "HEAD^:package.json"]);
const basePackageJson = capture("git", ["show", `${baseRef}:package.json`]);
try {
  assertUnchangedVersionHistory(basePackage.version, versionHistory(baseRef, "HEAD^"));
  assertSingleVersionChange(basePackageJson, parentPackageJson, currentPackageJson, expectedTag);
} catch (error) {
  fail(error.message);
}

const tags = capture("git", ["tag", "--list"]).split("\n").filter(Boolean);
const latestTag = latestVersionTag(tags);
const expectedPreviousTag = `v${basePackage.version}`;
if (!latestTag) fail("The current base must have an annotated baseline or release tag");
if (latestTag !== expectedPreviousTag) {
  fail(`Base package version ${basePackage.version} does not match latest tag ${latestTag}`);
}
if (capture("git", ["cat-file", "-t", `refs/tags/${latestTag}`]) !== "tag") {
  fail(`${latestTag} must be an annotated tag`);
}
if (capture("git", ["rev-list", "-n", "1", latestTag]) !== capture("git", ["rev-parse", baseRef])) {
  fail(`${latestTag} must target current origin/${baseBranch}`);
}
const taggedPackage = JSON.parse(capture("git", ["show", `${latestTag}:package.json`]));
if (taggedPackage.version !== basePackage.version) {
  fail(`${latestTag} package version does not match base ${basePackage.version}`);
}

if (tags.includes(expectedTag) || remoteTagExists(expectedTag)) fail(`Release tag ${expectedTag} already exists`);

console.log(`Verified release PR ${basePackage.version} -> ${currentPackage.version} (${expectedTag}).`);
