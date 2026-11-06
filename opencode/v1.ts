import type { Plugin } from "@opencode-ai/plugin";
import { join } from "node:path";
import { skillsDir } from "./skills.ts";

/** OpenCode 1: hooks returned from `server()`, with credentials read from the environment. */
export const server: Plugin = async () => {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  return {
    async config(input) {
      input.instructions ??= [];
      // @ts-expect-error -- opencode reads skills.paths, but the plugin SDK's Config type does not declare it yet
      input.skills ??= {};
      // @ts-expect-error -- see above
      input.skills.paths ??= [];

      // Add the bundled skills directory
      // @ts-expect-error -- see above
      input.skills.paths.push(skillsDir);
    },

    "shell.env": async (_input, output) => {
      if (apiKey) {
        output.env.BROWSERBASE_API_KEY = apiKey;
      }
      if (projectId) {
        output.env.BROWSERBASE_PROJECT_ID = projectId;
      }
    },
  };
};
