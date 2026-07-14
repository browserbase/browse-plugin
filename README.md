# Browserbase browse plugin

A **static, no-codebase marketplace catalog** for the `browse` plugin, Browserbase browser automation for AI agents. There is no application code here: this repo only contains the JSON manifests that let external agent marketplaces (Claude Code, Codex, Cursor, Gemini, Grok, and the generic `.agents` format) install and SHA-pin the `browse` plugin.

The plugin ships a single skill, the canonical [browse CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli) skill, that teaches the agent to drive `browse` via the shell. No local server, no Playwright, no build step, no MCP config, no API key required for local browsing.

**Why CLI-only, not MCP:** this catalog targets agents with shell access (Claude Code, Codex, Cursor, Gemini CLI, Grok), so a bundled MCP server adds no reach for this audience while requiring a Browserbase API key that a static, git-pinned public manifest can't safely embed. The hosted MCP remains the right integration for shell-less surfaces (ChatGPT, claude.ai). That's tracked separately, gated on OAuth support for those directories.

## What's inside

| Path | Marketplace format |
|------|--------------------|
| `.claude-plugin/marketplace.json` | Claude Code marketplace |
| `.codex-plugin/plugin.json` | Codex plugin |
| `.cursor-plugin/marketplace.json` | Cursor marketplace |
| `.agents/plugins/marketplace.json` | Generic `.agents` marketplace |
| `.grok-plugin/plugin.json` | Grok plugin |
| `gemini-extension.json` | Gemini CLI extension (`GEMINI.md` context file, CLI-only) |

This repo is a single flat plugin: repo root **is** the plugin.

```text
.claude-plugin/plugin.json
.codex-plugin/plugin.json
.cursor-plugin/plugin.json
.grok-plugin/plugin.json
assets/logo.svg
skills/browse/SKILL.md     # canonical browse CLI skill
```

Each per-format `plugin.json` references `./skills/` and the logo relative to repo root, and each root marketplace file's `source` points at `.`, so there's no nested `plugins/<name>/` indirection. A nested `plugins/<name>/` layout breaks third-party tools (e.g. Hermes Agent's skill "tap") that scan for `skills/` at repo root by convention, so this repo stays flat.

Installing the plugin in any supported client wires up the browse skill, which teaches the agent to drive the [`browse` CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli) for local and remote (Browserbase cloud) browser automation.

## Quick start

- **Claude Code**: add this repo as a plugin marketplace, then install the `browse` plugin.
- **Cursor**: add the marketplace, then install `browse`.
- **Codex / Grok**: add the repo as a plugin marketplace and install `browse`.
- **Gemini CLI**: install this repo as an extension (`gemini-extension.json` + `GEMINI.md`).

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

The validator checks the Cursor marketplace manifest and every referenced path (logo, skills, plugin.json name match, skill frontmatter). See [`docs/add-a-plugin.md`](docs/add-a-plugin.md) for the full layout.

## Resources

- [browse CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli)
- [Browserbase](https://browserbase.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
