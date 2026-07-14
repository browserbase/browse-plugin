import { promises as fs } from "node:fs";
import path from "node:path";

export const SKILL_PATH = path.join("skills", "browse", "SKILL.md");
export const GEMINI_PATH = "GEMINI.md";

function normalizeNewlines(content) {
  return content.replace(/\r\n/g, "\n");
}

// GEMINI.md has no place to reference a skill file, so it carries the same
// instructions as SKILL.md's body, verbatim, without the skill frontmatter.
export function stripFrontmatter(content) {
  const normalized = normalizeNewlines(content);
  if (!normalized.startsWith("---\n")) {
    return normalized;
  }
  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return normalized;
  }
  return normalized.slice(closingIndex + "\n---\n".length).replace(/^\n+/, "");
}

export async function computeExpectedGemini(repoRoot) {
  const skillRaw = await fs.readFile(path.join(repoRoot, SKILL_PATH), "utf8");
  return stripFrontmatter(skillRaw);
}
