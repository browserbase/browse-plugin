# Add a plugin

This repo is a **static, multi-marketplace catalog**. A plugin is a folder of manifests and content — no application code, no build step. Plugins are CLI-only (a `SKILL.md` that shells out to a real CLI) — no MCP config, so there's no API key to embed in this public, git-pinned repo. See the README's "Why CLI-only, not MCP" note for the reasoning.

## Layout

```text
.
├── .claude-plugin/marketplace.json      # Claude Code marketplace
├── .codex-plugin/plugin.json            # Codex plugin
├── .cursor-plugin/marketplace.json      # Cursor marketplace (repo validator reads this)
├── .agents/plugins/marketplace.json     # Generic .agents marketplace
├── .grok-plugin/plugin.json             # Grok plugin
├── gemini-extension.json                # Gemini CLI extension
├── GEMINI.md                            # Gemini context file (CLI-only, no mcpServers)
├── assets/logo.svg
└── plugins/
    └── <plugin>/
        ├── .claude-plugin/plugin.json
        ├── .codex-plugin/plugin.json
        ├── .cursor-plugin/plugin.json
        ├── .grok-plugin/plugin.json
        ├── assets/logo.svg
        └── skills/<skill-name>/SKILL.md # YAML frontmatter: name + description
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
  "skills": "./skills/"
}
```

## 2. Add the skill

- `skills/<skill-name>/SKILL.md` — YAML frontmatter must include `name` and `description`; `allowed-tools: Bash` and instructions for shelling out to the plugin's CLI.
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
- Broken relative paths for `logo` or `skills` in a manifest.
