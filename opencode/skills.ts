import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "skills");

export type BundledSkill = {
  id: string;
  name: string;
  description?: string;
  path: string;
  content: string;
};

/**
 * Reads `name` and `description` from a SKILL.md frontmatter block, including `|` block scalars.
 * Covers the plain and block-scalar values the bundled skills use, not general YAML.
 */
function frontmatter(text: string) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { fields: {} as Record<string, string>, content: text };
  const fields: Record<string, string> = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const field = /^([\w-]+):\s*(.*)$/.exec(lines[i]);
    if (!field) continue;
    let value = field[2];
    if (value === "|") {
      const block: string[] = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith("  ") || lines[i + 1] === ""))
        block.push(lines[++i].trimStart());
      value = block.join("\n").trim();
    }
    fields[field[1]] = value;
  }
  return { fields, content: text.slice(match[0].length) };
}

/** The bundled skills, for OpenCode 2, which takes skills from plugins as entries rather than directories. */
export async function bundledSkills(): Promise<BundledSkill[]> {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(skillsDir, entry.name, "SKILL.md");
        const raw = await readFile(path, "utf8");
        const { fields, content } = frontmatter(raw);
        return {
          id: entry.name,
          name: fields.name ?? entry.name,
          ...(fields.description && { description: fields.description }),
          path,
          content,
        };
      })
  );
}

/** The CLI install instructions for the system prompt. */
export async function installInstructions() {
  return `## Browse CLI Setup

Install the browse CLI globally to enable browser automation:

\`\`\`bash
npm install -g browse
\`\`\`

Verify the installation:

\`\`\`bash
which browse && browse --help
\`\`\`

For remote Browserbase sessions, set your API key:

\`\`\`bash
export BROWSERBASE_API_KEY=your-api-key
\`\`\`

Get an API key at https://browserbase.com/settings. Local mode uses Chrome/Chromium on your machine and needs no key.
`;
}
