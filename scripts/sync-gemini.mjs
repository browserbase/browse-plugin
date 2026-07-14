#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { computeExpectedGemini, GEMINI_PATH } from "./gemini-sync.mjs";

const repoRoot = process.cwd();
const checkOnly = process.argv.includes("--check");

const expected = await computeExpectedGemini(repoRoot);
const geminiPath = path.join(repoRoot, GEMINI_PATH);
const actual = await fs.readFile(geminiPath, "utf8").catch(() => null);

if (actual === expected) {
  console.log(`${GEMINI_PATH} is in sync with skills/browse/SKILL.md.`);
  process.exit(0);
}

if (checkOnly) {
  console.error(
    `${GEMINI_PATH} is out of sync with skills/browse/SKILL.md. Run \`node scripts/sync-gemini.mjs\` to fix.`
  );
  process.exit(1);
}

await fs.writeFile(geminiPath, expected, "utf8");
console.log(`Rewrote ${GEMINI_PATH} from skills/browse/SKILL.md.`);
