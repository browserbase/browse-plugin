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
├── .muse-plugin/plugin.json             # Muse Code native plugin (uses .agents marketplace)
├── .antigravity-plugin/plugin.json      # Antigravity plugin (discovers skills/ automatically)
├── gemini-extension.json                # Gemini CLI extension
├── GEMINI.md                            # Gemini context file (CLI-only, no mcpServers)
├── plugin.json                          # Open Plugin spec manifest (vendor-neutral, e.g. `npx plugins add`)
├── assets/logo.svg
├── assets/logo-antigravity.svg          # Antigravity logo with transparent padding
├── skills/browse/SKILL.md               # YAML frontmatter: name + description
├── opencode/                            # OpenCode npm plugin package
│   ├── package.json                     # npm manifest for @browserbasehq/opencode
│   ├── index.ts                         # entrypoint (exports v1 + v2)
│   ├── v1.ts                            # OpenCode 1 plugin hooks
│   ├── v2.ts                            # OpenCode 2 plugin setup
│   ├── skills.ts                        # bundled skills loader
│   ├── skills/browse/SKILL.md           # copy of the shared skill
│   └── README.md                        # OpenCode-specific install docs
└── scripts/
    ├── validate-template.mjs            # run by CI and locally, see "Validate" below
    ├── gemini-sync.mjs                  # shared logic: derive GEMINI.md's expected content from SKILL.md
    ├── sync-gemini.mjs                  # regenerates GEMINI.md; --check fails without writing
    ├── version-sync.mjs                 # shared logic: reads the version every manifest must match
    └── sync-version.mjs                 # propagates plugin.json's version to the others; --check fails without writing
```

Every per-format `plugin.json`'s `"skills"` and `"logo"` fields are relative to repo root (`./skills/`, `assets/logo.svg`), and every root marketplace file's `"source"`/`"path"` is `"."`. Muse uses `capabilities.skills[].path` to reference `skills/browse/SKILL.md` from the same repo root; see [Muse Code setup](muse-code.md). The root `plugin.json` is a separate, vendor-neutral manifest ([Open Plugin spec](https://github.com/vercel-labs/open-plugin-spec) v1.0.0); it doesn't replace or override any per-client manifest and only needs updating when the plugin's name, version, or metadata changes.

## Updating the skill

- `skills/browse/SKILL.md` — YAML frontmatter must include `name` and `description`; `allowed-tools: Bash` and instructions for shelling out to `browse`. This is a manual copy of the canonical `stagehand/packages/cli/skills/browse/SKILL.md` — edit there and re-copy here. Automated copy-on-release sync is tracked in [stagehand#2330](https://github.com/browserbase/stagehand/pull/2330).
- `GEMINI.md` — Gemini's extension format has no way to reference an external skill file, so it carries the same instructions as `SKILL.md`'s body, verbatim. After editing `skills/browse/SKILL.md`, run `node scripts/sync-gemini.mjs` to regenerate `GEMINI.md`. CI fails if the two drift out of sync.
- `assets/logo.svg` — the marketplace display logo.

## Bumping the version

`plugin.json`'s `version` tracks this repo's own release tags (`v0.1.0`, `v0.2.0`, ...), the same as the git tags already used for GitHub Releases. The published Cursor marketplace listing is built by `release.yml`, which only runs on a tag push — merging to `main` alone doesn't update it. `plugin.json` is the single source of truth for the other six: `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.grok-plugin/plugin.json`, `.muse-plugin/plugin.json`, `.antigravity-plugin/plugin.json`, and `gemini-extension.json` must all match it exactly.

To cut a release, bump `plugin.json`'s `version` and run:

```bash
node scripts/sync-version.mjs
```

CI fails if any of the seven drift out of sync. Once that PR merges to `main`, a second CI job (`tag-release`, in `.github/workflows/validate.yml`) detects the version change and pushes the matching `vX.Y.Z` tag automatically — no one runs `git tag` by hand. That tag push is what triggers `release.yml` to actually validate, package, and publish the release. If `plugin.json`'s version didn't change on a given push to `main`, or a tag for that version already exists, `tag-release` is a no-op.

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
- Bumping `plugin.json`'s `version` without running `node scripts/sync-version.mjs` afterward — CI fails if the other manifests drift out of sync.

## OpenCode plugin

Unlike the other agent marketplaces that use static JSON manifests, OpenCode distributes plugins as npm packages. The `opencode/` directory is a publishable npm package (`@browserbasehq/opencode`) that:

- Supports both OpenCode 1 (`plugin` config) and OpenCode 2 (`plugins` config) from the same package
- Bundles the browse skill (a copy of `skills/browse/SKILL.md`)
- Injects `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` into shell commands when present

### CI publishing

The `.github/workflows/publish-opencode.yml` workflow publishes the package to npm automatically when `opencode/package.json`'s version changes on push to main. It uses npm OIDC trusted publishing (no `NPM_TOKEN` secret required).

#### First-time setup (one-time, requires @browserbasehq npm org access)

Before CI can publish, someone with access to the `@browserbasehq` npm organization must:

1. **Create the package on npm** (if it doesn't exist):
   ```bash
   cd opencode && npm publish --access public
   ```
   Or just let the first CI run create it (it will fail, but the package name will be reserved).

2. **Configure trusted publishing** on npmjs.com:
   - Go to [npmjs.com/package/@browserbasehq/opencode](https://www.npmjs.com/package/@browserbasehq/opencode) → Settings → Publishing access
   - Add a new trusted publisher:
     - **Repository**: `browserbase/browse-plugin`
     - **Workflow**: `publish-opencode.yml`
     - **Environment**: (leave blank for default)

After this one-time setup, CI will publish automatically on version bumps.

### Updating the OpenCode plugin

1. Update `opencode/skills/browse/SKILL.md` when the shared skill changes (currently a manual copy)
2. Bump the version in `opencode/package.json`
3. Merge to main — CI publishes automatically once trusted publishing is configured

For manual publishing (before trusted publishing is set up):
```bash
cd opencode && npm publish --access public
```

### Installing for users

```bash
opencode plugin add @browserbasehq/opencode
npm install -g browse
```

Or in `opencode.jsonc`:

```jsonc
{
  "plugins": ["@browserbasehq/opencode"]
}
```
