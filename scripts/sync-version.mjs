#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { getSourceVersion, replaceVersion, VERSION_TARGET_PATHS, SOURCE_VERSION_PATH } from "./version-sync.mjs";

const repoRoot = process.cwd();
const checkOnly = process.argv.includes("--check");

const sourceVersion = await getSourceVersion(repoRoot);
const outOfSync = [];

for (const relPath of VERSION_TARGET_PATHS) {
  const filePath = path.join(repoRoot, relPath);
  const raw = await fs.readFile(filePath, "utf8");
  const { updated, previousVersion } = replaceVersion(raw, sourceVersion);

  if (previousVersion === sourceVersion) {
    continue;
  }

  outOfSync.push(relPath);
  if (!checkOnly) {
    await fs.writeFile(filePath, updated, "utf8");
  }
}

if (outOfSync.length === 0) {
  console.log(`All manifest versions match ${SOURCE_VERSION_PATH} (${sourceVersion}).`);
  process.exit(0);
}

if (checkOnly) {
  console.error(
    `Out of sync with ${SOURCE_VERSION_PATH}'s version (${sourceVersion}): ${outOfSync.join(", ")}. Run \`node scripts/sync-version.mjs\` to fix.`
  );
  process.exit(1);
}

console.log(`Updated to ${sourceVersion}: ${outOfSync.join(", ")}.`);
