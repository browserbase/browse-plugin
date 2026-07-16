# browse plugin marketplace

Install the [`browse`](https://github.com/browserbase/stagehand/tree/main/packages/cli) CLI as a native plugin in Claude Code, Cursor, Codex, Grok, and Gemini CLI.

This repo has no application code. It's a set of static JSON manifests that let each agent marketplace install and SHA-pin the `browse` plugin, plus the skill that teaches the agent to drive `browse` from the shell.

## What's inside

| Path | Marketplace format |
|------|--------------------|
| `.claude-plugin/marketplace.json` | Claude Code marketplace |
| `.codex-plugin/plugin.json` | Codex plugin |
| `.cursor-plugin/marketplace.json` | Cursor marketplace |
| `.agents/plugins/marketplace.json` | Generic `.agents` marketplace |
| `.grok-plugin/plugin.json` | Grok plugin |
| `gemini-extension.json` | Gemini CLI extension (`GEMINI.md` context file) |

See [`docs/add-a-plugin.md`](docs/add-a-plugin.md) for the full repo layout and how to update the plugin.

## Quick start

- **Claude Code**: add this repo as a plugin marketplace, then install the `browse` plugin.
- **Cursor**: add the marketplace, then install `browse`.
- **Codex / Grok**: add the repo as a plugin marketplace and install `browse`.
- **Gemini CLI**: install this repo as an extension (`gemini-extension.json` + `GEMINI.md`).

Then just ask your agent:

- *"Go to Hacker News and get the top 5 stories."*
- *"Fill out the signup form on example.com."*
- *"Take a screenshot of localhost:3000."*

No local server, no build step, no API key required for local browsing.

### Browserbase cloud (optional)

Remote stealth sessions, proxies, and CAPTCHA solving use a Browserbase API key:

```bash
export BROWSERBASE_API_KEY="your-api-key"
```

Get a key at [browserbase.com/settings](https://browserbase.com/settings). Local mode uses Chrome/Chromium on your machine and needs no key.

## Resources

- [browse CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli)
- [Adding or updating the plugin](docs/add-a-plugin.md)
- [Browserbase](https://browserbase.com)
