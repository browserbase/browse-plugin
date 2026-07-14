# Repo layout

This repo is a **static, single-plugin catalog** — repo root **is** the `browse` plugin, one plugin per repo. No application code, no build step. The plugin is CLI-only (a `SKILL.md` that shells out to a real CLI) — no MCP config, so there's no API key to embed in this public, git-pinned repo.

If Browserbase ever needs a second distinct plugin, it belongs in its own dedicated repo — not nested inside this one. A nested `plugins/<name>/` layout breaks third-party tools (e.g. Hermes Agent's skill "tap") that scan for `skills/` at repo root by convention.

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
├── plugin.json                          # Open Plugin spec manifest (vendor-neutral, e.g. `npx plugins add`)
├── assets/logo.svg
├── skills/browse/SKILL.md               # YAML frontmatter: name + description
└── scripts/
    ├── validate-template.mjs            # run by CI and locally, see "Validate" below
    ├── gemini-sync.mjs                  # shared logic: derive GEMINI.md's expected content from SKILL.md
    └── sync-gemini.mjs                  # regenerates GEMINI.md; --check fails without writing
```

Every per-format `plugin.json`'s `"skills"` and `"logo"` fields are relative to repo root (`./skills/`, `assets/logo.svg`), and every root marketplace file's `"source"`/`"path"` is `"."`. The root `plugin.json` is a separate, vendor-neutral manifest ([Open Plugin spec](https://github.com/vercel-labs/open-plugin-spec) v1.0.0); it doesn't replace or override any per-client manifest and only needs updating when the plugin's name, version, or metadata changes.

## Updating the skill

- `skills/browse/SKILL.md` — YAML frontmatter must include `name` and `description`; `allowed-tools: Bash` and instructions for shelling out to `browse`. This is a manual copy of the canonical `stagehand/packages/cli/skills/browse/SKILL.md` — edit there and re-copy here. Automated copy-on-release sync is tracked in [stagehand#2330](https://github.com/browserbase/stagehand/pull/2330).
- `GEMINI.md` — Gemini's extension format has no way to reference an external skill file, so it carries the same instructions as `SKILL.md`'s body, verbatim. After editing `skills/browse/SKILL.md`, run `node scripts/sync-gemini.mjs` to regenerate `GEMINI.md`. CI fails if the two drift out of sync.
- `assets/logo.svg` — the marketplace display logo.

## Validate

```bash
node scripts/validate-template.mjs
```

Fix all reported errors before committing. This also runs in CI on every pull request and on pushes to `main` (`.github/workflows/validate.yml`).

## Common pitfalls

- Plugin `name` not kebab-case, or not matching a marketplace entry name.
- Missing `.cursor-plugin/plugin.json` at repo root.
- Missing frontmatter keys (`name`, `description`) in `SKILL.md`.
- Broken relative paths for `logo` or `skills` in a manifest.
- A marketplace `source`/`path` pointing at anything other than `"."` — this repo has no nested plugin folder anymore.
- Editing `skills/browse/SKILL.md` without running `node scripts/sync-gemini.mjs` afterward — CI fails if `GEMINI.md` drifts out of sync.
