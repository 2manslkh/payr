#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import {
  bumpVersion,
  compareVersions,
  latestVersionTag,
  normalizeVersionTag,
  parseStableVersion,
} from "./release-utils.mjs";

const usage = "Usage: pnpm release:prepare -- <major|minor|patch|X.Y.Z> [--dry-run]";

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

function remoteTagExists(tag) {
  const result = spawnSync("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) return true;
  if (result.status === 2) return false;
  fail(result.stderr.trim() || `Unable to inspect remote tag ${tag}`);
}

const argumentsList = process.argv.slice(2);
if (argumentsList[0] === "--") argumentsList.shift();

const requested = argumentsList[0];
const dryRun = argumentsList.slice(1).includes("--dry-run");
const unknownArguments = argumentsList.slice(1).filter((argument) => argument !== "--dry-run");
if (!requested || unknownArguments.length > 0) fail(usage);

const packageJsonUrl = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
parseStableVersion(packageJson.version, "Current package version");

let nextVersion;
try {
  nextVersion = ["major", "minor", "patch"].includes(requested)
    ? bumpVersion(packageJson.version, requested)
    : normalizeVersionTag(requested).slice(1);
} catch (error) {
  fail(error.message);
}

if (compareVersions(nextVersion, packageJson.version) <= 0) {
  fail(`Requested version ${nextVersion} must be greater than current version ${packageJson.version}`);
}

const nextTag = `v${nextVersion}`;
const tags = capture("git", ["tag", "--list"]).split("\n").filter(Boolean);
const latestTag = latestVersionTag(tags);
if (latestTag && latestTag !== `v${packageJson.version}`) {
  fail(`Current package version ${packageJson.version} does not match latest tag ${latestTag}`);
}

if (tags.includes(nextTag) || remoteTagExists(nextTag)) fail(`Tag ${nextTag} already exists`);

if (dryRun) {
  console.log(`Release preparation dry run: ${packageJson.version} -> ${nextVersion} (${nextTag})`);
  process.exit(0);
}

const branch = capture("git", ["branch", "--show-current"]);
if (!branch || branch === "main") fail("Prepare releases on a non-main integration branch");

const status = capture("git", ["status", "--porcelain", "--untracked-files=all"]);
if (status) fail("Commit intended changes and remove unintended untracked files before preparing a release");

if (latestTag) {
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", latestTag, "HEAD"]);
  if (ancestor.status !== 0) fail(`${latestTag} is not an ancestor of the integration branch`);
  if (capture("git", ["rev-list", "-n", "1", latestTag]) === capture("git", ["rev-parse", "HEAD"])) {
    fail(`No commits exist after ${latestTag}`);
  }
}

run("pnpm", ["verify"]);
run("pnpm", ["test:e2e"]);

if (capture("git", ["status", "--porcelain", "--untracked-files=all"])) {
  fail("Release checks modified the worktree; review those changes before retrying");
}

capture("git", ["var", "GIT_AUTHOR_IDENT"]);
capture("git", ["var", "GIT_COMMITTER_IDENT"]);

writeFileSync(packageJsonUrl, `${JSON.stringify({ ...packageJson, version: nextVersion }, null, 2)}\n`);
run("git", ["add", "--", "package.json"]);

const stagedFiles = capture("git", ["diff", "--cached", "--name-only"]);
if (stagedFiles !== "package.json") fail(`Release commit must contain only package.json; staged: ${stagedFiles || "none"}`);

const releaseMessage = `chore: release ${nextTag}`;
run("git", ["commit", "--no-gpg-sign", "--only", "--message", releaseMessage, "--", "package.json"]);

if (capture("git", ["status", "--porcelain", "--untracked-files=all"])) {
  fail("Release preparation left worktree changes");
}

console.log(`Prepared ${nextTag} on ${branch}. Open or update the release PR; tag only its merge commit.`);
