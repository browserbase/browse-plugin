import { promises as fs } from "node:fs";
import path from "node:path";

export const SOURCE_VERSION_PATH = "plugin.json";

export const VERSION_TARGET_PATHS = [
  path.join(".claude-plugin", "plugin.json"),
  path.join(".cursor-plugin", "plugin.json"),
  path.join(".grok-plugin", "plugin.json"),
  "gemini-extension.json",
];

export async function getSourceVersion(repoRoot) {
  const raw = await fs.readFile(path.join(repoRoot, SOURCE_VERSION_PATH), "utf8");
  const parsed = JSON.parse(raw);
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(`${SOURCE_VERSION_PATH} is missing a "version" string.`);
  }
  return parsed.version;
}

// String-replaces the version value in place (rather than a JSON.parse +
// JSON.stringify round-trip) so each file's existing formatting, whether
// pretty-printed or single-line minified, is untouched.
export function replaceVersion(raw, newVersion) {
  const pattern = /"version"\s*:\s*"([^"]*)"/;
  const match = raw.match(pattern);
  if (!match) {
    throw new Error('no "version" field found');
  }
  const updated = raw.replace(pattern, `"version": "${newVersion}"`);
  return { updated, previousVersion: match[1] };
}
