# Repo layout

This repo is a **static, single-plugin catalog** — repo root **is** the `browse` plugin, one plugin per repo (matches [link-cli](https://github.com/stripe/link-cli), the reference this repo is modeled on). No application code, no build step. The plugin is CLI-only (a `SKILL.md` that shells out to a real CLI) — no MCP config, so there's no API key to embed in this public, git-pinned repo. See the README's "Why CLI-only, not MCP" note for the reasoning.

If Browserbase ever needs a second distinct plugin, per the settled positioning ("external directories list a single `browse` plugin"), that belongs in its own dedicated repo — not nested inside this one. An earlier revision nested content under `plugins/browse/` for exactly that multi-plugin case; it was flattened back once this repo committed to being single-plugin, since the nesting had no remaining beneficiary and broke third-party tools (e.g. Hermes Agent's skill "tap") that scan for `skills/` at repo root by convention.

## Layout

```text
.
├── .claude-plugin/marketplace.json      # Claude Code marketplace (source: ".")
├── .claude-plugin/plugin.json           # Claude Code plugin manifest
├── .codex-plugin/plugin.json            # Codex plugin
├── .cursor-plugin/marketplace.json      # Cursor marketplace (source: ".", repo validator reads this)
├── .cursor-plugin/plugin.json           # Cursor plugin manifest
├── .agents/plugins/marketplace.json     # Generic .agents marketplace (path: ".")
├── .grok-plugin/plugin.json             # Grok plugin
├── gemini-extension.json                # Gemini CLI extension
├── GEMINI.md                            # Gemini context file (CLI-only, no mcpServers)
├── assets/logo.svg
└── skills/browse/SKILL.md               # YAML frontmatter: name + description
```

Every per-format `plugin.json`'s `"skills"` and `"logo"` fields are relative to repo root (`./skills/`, `assets/logo.svg`), and every root marketplace file's `"source"`/`"path"` is `"."`.

## Updating the skill

- `skills/browse/SKILL.md` — YAML frontmatter must include `name` and `description`; `allowed-tools: Bash` and instructions for shelling out to `browse`. This is synced from the canonical copy in `stagehand/packages/cli/skills/browse/SKILL.md` — edit there, not here, once the copy-on-release sync exists (not yet built as of 2026-07-07; currently manual).
- `assets/logo.svg` — the marketplace display logo.

## Validate

```bash
node scripts/validate-template.mjs
```

Fix all reported errors before committing.

## Common pitfalls

- Plugin `name` not kebab-case, or not matching a marketplace entry name.
- Missing `.cursor-plugin/plugin.json` at repo root.
- Missing frontmatter keys (`name`, `description`) in `SKILL.md`.
- Broken relative paths for `logo` or `skills` in a manifest.
- A marketplace `source`/`path` pointing at anything other than `"."` — this repo has no nested plugin folder anymore.
