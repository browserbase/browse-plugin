# Browserbase browse plugin

A **static, no-codebase marketplace catalog** for the `browse` plugin — Browserbase browser automation for AI agents. There is no application code here: this repo only contains the JSON manifests that let external agent marketplaces (Claude Code, Codex, Cursor, Gemini, Grok, and the generic `.agents` format) install and SHA-pin the `browse` plugin.

The plugin ships a single skill — the canonical [browse CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli) skill — and points every marketplace at the **hosted Browserbase MCP** at `https://mcp.browserbase.com/mcp`. No local server, no Playwright, no build step.

## What's inside

| Path | Marketplace format |
|------|--------------------|
| `.claude-plugin/marketplace.json` | Claude Code marketplace |
| `.codex-plugin/plugin.json` | Codex plugin |
| `.cursor-plugin/marketplace.json` | Cursor marketplace |
| `.agents/plugins/marketplace.json` | Generic `.agents` marketplace |
| `.grok-plugin/plugin.json` | Grok plugin |
| `gemini-extension.json` | Gemini CLI extension |
| `.mcp.json` | Hosted MCP server config (shared) |
| `server.json` | MCP registry server descriptor |

The `browse` plugin itself lives under `plugins/browse/`:

```text
plugins/browse/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── .cursor-plugin/plugin.json
├── .grok-plugin/plugin.json
├── .mcp.json                  # hosted MCP: https://mcp.browserbase.com/mcp
├── assets/logo.svg
└── skills/browse/SKILL.md     # canonical browse CLI skill
```

Each per-plugin manifest references `./skills/`, `./.mcp.json`, and the logo — all resolved relative to `plugins/browse/`.

## Hosted MCP

Every marketplace format points at the same remote server:

```json
{ "mcpServers": { "browserbase": { "type": "http", "url": "https://mcp.browserbase.com/mcp" } } }
```

Installing the plugin in any supported client wires up the Browserbase MCP tools plus the browse skill, which teaches the agent to drive the [`browse` CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli) for local and remote (Browserbase cloud) browser automation.

## Quick start

- **Claude Code**: add this repo as a plugin marketplace, then install the `browse` plugin.
- **Cursor**: add the marketplace, then install `browse`.
- **Codex / Grok**: add the repo as a plugin marketplace and install `browse`.
- **Gemini CLI**: install this repo as an extension (`gemini-extension.json`).

Then just ask your agent:

- *"Go to Hacker News and get the top 5 stories."*
- *"Fill out the signup form on example.com."*
- *"Take a screenshot of localhost:3000."*

### Browserbase cloud (optional)

Remote stealth sessions, proxies, and CAPTCHA solving use a Browserbase API key:

```bash
export BROWSERBASE_API_KEY="your-api-key"
```

Get a key at [browserbase.com/settings](https://browserbase.com/settings). Local mode uses Chrome/Chromium on your machine and needs no key.

## Validation

```bash
node scripts/validate-template.mjs
```

The validator checks the Cursor marketplace manifest and every referenced path (logo, skills, MCP config, plugin.json name match, skill frontmatter). See [`docs/add-a-plugin.md`](docs/add-a-plugin.md) for the full layout.

## Resources

- [browse CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli)
- [Browserbase](https://browserbase.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
