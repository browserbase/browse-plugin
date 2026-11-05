import type { Plugin, Skill } from "@opencode/plugin";
import { bundledSkills, installInstructions } from "./skills.ts";

/**
 * OpenCode 2: skills and shell credentials come from environment variables.
 * No custom tools are registered; the plugin bundles the browse CLI skill
 * and injects BROWSERBASE_API_KEY/BROWSERBASE_PROJECT_ID into shell commands.
 */
export const v2: Plugin.Plugin = {
  id: "browserbase",
  async setup(ctx) {
    const apiKey = () => process.env.BROWSERBASE_API_KEY;
    const projectId = () => process.env.BROWSERBASE_PROJECT_ID;

    const [skills, instructions] = await Promise.all([bundledSkills(), installInstructions()]);

    // Register bundled skills
    // SAFETY: Skill.Info's ids and paths are branded strings; the brands are compile-time only.
    await ctx.skill.transform((editor) =>
      skills.forEach((skill) => editor.add(skill as unknown as Skill.Info))
    );

    // Add install instructions to system prompt
    await ctx.session.hook("context", (event) => {
      event.system.push({ type: "text", text: instructions });
    });

    // Inject environment variables into shell commands
    await ctx.shell.hook("create.before", async (event) => {
      const key = apiKey();
      const project = projectId();
      if (key) event.env.BROWSERBASE_API_KEY = key;
      if (project) event.env.BROWSERBASE_PROJECT_ID = project;
    });
  },
};
