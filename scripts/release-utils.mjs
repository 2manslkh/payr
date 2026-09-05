import { isDeepStrictEqual } from "node:util";

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseStableVersion(value, label = "Version") {
  const match = semverPattern.exec(value);
  if (!match) {
    throw new Error(`${label} must be a stable semantic version in X.Y.Z form`);
  }

  return match.slice(1).map(BigInt);
}

export function formatVersion(parts) {
  return parts.map(String).join(".");
}

export function compareVersions(left, right) {
  const leftParts = Array.isArray(left) ? left : parseStableVersion(left);
  const rightParts = Array.isArray(right) ? right : parseStableVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }

  return 0;
}

export function bumpVersion(currentVersion, bump) {
  const [major, minor, patch] = parseStableVersion(currentVersion, "Current package version");
  if (bump === "major") return formatVersion([major + 1n, 0n, 0n]);
  if (bump === "minor") return formatVersion([major, minor + 1n, 0n]);
  if (bump === "patch") return formatVersion([major, minor, patch + 1n]);
  throw new Error(`Unknown semantic version bump: ${bump}`);
}

export function normalizeVersionTag(value) {
  const version = value.startsWith("v") ? value.slice(1) : value;
  parseStableVersion(version, "Release version");
  return `v${version}`;
}

export function latestVersionTag(tags) {
  const stableTags = tags.filter((tag) => tag.startsWith("v") && semverPattern.test(tag.slice(1)));
  stableTags.sort((left, right) => compareVersions(right.slice(1), left.slice(1)));
  return stableTags[0] ?? null;
}

export function assertReleasePackageChange(beforeJson, afterJson, expectedTag) {
  const before = JSON.parse(beforeJson);
  const after = JSON.parse(afterJson);
  const normalizedTag = normalizeVersionTag(expectedTag);

  parseStableVersion(before.version, "Previous package version");
  parseStableVersion(after.version, "Release package version");

  if (`v${after.version}` !== normalizedTag) {
    throw new Error(`Release package version ${after.version} does not match ${normalizedTag}`);
  }

  if (compareVersions(after.version, before.version) <= 0) {
    throw new Error(`Release package version ${after.version} must be greater than ${before.version}`);
  }

  const { version: beforeVersion, ...beforeWithoutVersion } = before;
  const { version: afterVersion, ...afterWithoutVersion } = after;
  void beforeVersion;
  void afterVersion;

  if (!isDeepStrictEqual(afterWithoutVersion, beforeWithoutVersion)) {
    throw new Error("The release commit may change only package.json version");
  }

  return { previousVersion: before.version, releaseVersion: after.version, tag: normalizedTag };
}

export function assertSingleVersionChange(baseJson, preReleaseJson, releaseJson, expectedTag) {
  const base = JSON.parse(baseJson);
  const preRelease = JSON.parse(preReleaseJson);
  parseStableVersion(base.version, "Base package version");
  parseStableVersion(preRelease.version, "Pre-release package version");

  if (preRelease.version !== base.version) {
    throw new Error(
      `The package version may change only in the final release commit; found ${base.version} -> ${preRelease.version} earlier in the PR`,
    );
  }

  return assertReleasePackageChange(preReleaseJson, releaseJson, expectedTag);
}

export function assertUnchangedVersionHistory(baseVersion, entries) {
  parseStableVersion(baseVersion, "Base package version");
  for (const { commit, version } of entries) {
    parseStableVersion(version, `Package version at ${commit}`);
    if (version !== baseVersion) {
      throw new Error(
        `The package version may change only in the final release commit; ${commit} contains ${version}, expected ${baseVersion}`,
      );
    }
  }
}
