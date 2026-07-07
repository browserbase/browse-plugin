# Add a plugin

This repo is a **static, multi-marketplace catalog**. A plugin is a folder of manifests and content — no application code, no build step. Every marketplace format points at the hosted Browserbase MCP.

## Layout

```text
.
├── .claude-plugin/marketplace.json      # Claude Code marketplace
├── .codex-plugin/plugin.json            # Codex plugin
├── .cursor-plugin/marketplace.json      # Cursor marketplace (repo validator reads this)
├── .agents/plugins/marketplace.json     # Generic .agents marketplace
├── .grok-plugin/plugin.json             # Grok plugin
├── gemini-extension.json                # Gemini CLI extension
├── .mcp.json                            # hosted MCP config (shared)
├── server.json                          # MCP registry descriptor
├── assets/logo.svg
└── plugins/
    └── <plugin>/
        ├── .claude-plugin/plugin.json
        ├── .codex-plugin/plugin.json
        ├── .cursor-plugin/plugin.json
        ├── .grok-plugin/plugin.json
        ├── .mcp.json                    # hosted MCP: https://mcp.browserbase.com/mcp
        ├── assets/logo.svg
        └── skills/<skill-name>/SKILL.md # YAML frontmatter: name + description
```

## Hosted MCP

Every `.mcp.json` points at the same remote server — no local process is spawned:

```json
{ "mcpServers": { "browserbase": { "type": "http", "url": "https://mcp.browserbase.com/mcp" } } }
```

## 1. Create the plugin directory

Create `plugins/<plugin>/` and add a per-marketplace manifest for each format you want to support. Each `plugin.json` uses relative references resolved from the plugin folder:

```json
{
  "name": "<plugin>",
  "version": "0.1.0",
  "description": "Describe what this plugin does",
  "author": { "name": "Your Org" },
  "logo": "assets/logo.svg",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
```

## 2. Add the skill and MCP config

- `skills/<skill-name>/SKILL.md` — YAML frontmatter must include `name` and `description`.
- `.mcp.json` — the hosted MCP server config shown above.
- `assets/logo.svg` — the marketplace display logo.

## 3. Register in the Cursor marketplace manifest

Edit `.cursor-plugin/marketplace.json` and append an entry. This is the manifest the repo's own validator reads:

```json
{
  "name": "<plugin>",
  "source": "plugins/<plugin>",
  "description": "Describe your plugin"
}
```

`source` is the relative path from the repository root to the plugin folder, and must match the plugin's `.cursor-plugin/plugin.json` `name`.

Add matching entries to the other root marketplace manifests (`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`) as needed.

## 4. Validate

```bash
node scripts/validate-template.mjs
```

Fix all reported errors before committing.

## 5. Common pitfalls

- Plugin `name` not kebab-case, or not matching the `source` folder / entry name.
- Missing `.cursor-plugin/plugin.json` in the plugin folder.
- Missing frontmatter keys (`name`, `description`) in `SKILL.md`.
- Broken relative paths for `logo`, `skills`, or `mcpServers` in a manifest.
- Pointing `.mcp.json` at a local command instead of the hosted `https://mcp.browserbase.com/mcp` URL.
