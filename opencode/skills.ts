import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

export const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "skills");

export type BundledSkill = {
  id: string;
  name: string;
  description?: string;
  path: string;
  content: string;
};

/** The bundled skills, for OpenCode 2, which takes skills from plugins as entries rather than directories. */
export async function bundledSkills(): Promise<BundledSkill[]> {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillPath = join(skillsDir, entry.name, "SKILL.md");
        const raw = await readFile(skillPath, "utf8");
        const { data, content } = matter(raw);
        return {
          id: entry.name,
          name: (data.name as string) ?? entry.name,
          ...(data.description && { description: data.description as string }),
          path: skillPath,
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
