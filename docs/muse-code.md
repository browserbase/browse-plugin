# Browse CLI for Muse Code

Give Muse Code a browser through [Browse CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli). The plugin loads the shared Browse skill, which teaches Muse to navigate, inspect pages, fill forms, extract data, and take screenshots using shell commands. It also covers Browserbase cloud APIs, Functions, templates, and Browse.sh skills.

The plugin declares one skill and no hooks, MCP servers, commands, or reminders. Installing the plugin loads instructions; install the CLI separately. Local browsing needs Chrome or Chromium. Browserbase cloud browsing uses `BROWSERBASE_API_KEY` inherited from your shell or secret manager.

## Requirements

- Muse Code with plugin support. Tested with **1.3.0 (1.3.0-R3057.1)**.
- Node.js and npm, with `browse` available on the `PATH` used to launch Muse. A separate cloud browser smoke test used **Browse 0.9.6**.

```bash
npm install -g browse
browse --version
```

The tested Muse build gates plugin management behind an environment variable. If `muse plugins --help` reports that plugins are unavailable, enable it in your current shell:

```bash
export MUSE_EXPERIMENTAL_PLUGINS=1
```

## Install a local checkout

From this repository's root:

```bash
muse plugins validate . --json
muse plugins install . --scope user --json
muse plugins inspect browse --json
muse skills list --source plugin --json
```

The plugin should report `manifest_family: "native"`, `active: true`, and the effective skill `plugin:browse:browse`. The skills list should show that skill with `activation: "on"`.

Start a new Muse session after installation and ask:

> Use the Browse skill to open https://example.com in a local browser, read the page title, and close the browser session.

Or try:

- "Take a screenshot of localhost:3000."
- "Use Browserbase to extract the top five stories from Hacker News."
- "Find a Browse.sh skill for this website."

## Install from the marketplace

Once the Muse manifest is available on the repository's default branch:

```bash
muse plugins marketplace add browserbase https://github.com/browserbase/browse-plugin.git --json
muse plugins install browse@browserbase --json
muse plugins inspect browse --json
```

Muse accepts the existing `.agents/plugins/marketplace.json` catalog. The native `.muse-plugin/plugin.json` manifest points at the same `skills/browse/SKILL.md` used by the other clients.

To exercise marketplace installation before publishing, use the checkout's absolute path as the source instead of the Git URL:

```bash
muse plugins marketplace add browserbase "$PWD" --json
muse plugins install browse@browserbase --json
```

## Manage the plugin

```bash
muse plugins disable browse --json
muse plugins enable browse --json
muse plugins update browse --json
muse plugins remove browse --json
```

For marketplace installs, explicitly refresh the catalog before updating:

```bash
muse plugins marketplace update browserbase --json
muse plugins update browse --json
```

These operations manage the plugin package. Update the separately installed CLI with `npm install -g browse@latest`.

## Validation notes

Verified with the Muse CLI: local and marketplace installation, skill discovery, inspect, enable/disable, update, and removal. Separately verified Browse opening a Browserbase session, reading a page title, taking a screenshot, and closing the session. A model-driven Muse browsing task still needs verification with an authenticated Muse account.

Muse 1.3.0 accepts this repository with `valid: true` and full skill compatibility. It reports two warnings because the repository carries several clients' manifests: `ignored-root-manifest` for the Open Plugin manifest, and `multiple-manifests` when it selects the native Muse manifest ahead of Claude/Codex. These do not prevent installation or skill discovery.

`muse skills validate skills/browse --json` also reports that `allowed-tools: Bash` is advisory. It grants no additional tool permissions; Muse's shell approval and sandbox settings still apply. Use Muse's normal approval flow if a browser command needs additional access.

If the CLI cannot start a browser, run `browse doctor --json` and follow its diagnostics. Use `--local` for localhost and local Chrome/Chromium, or `--remote` for Browserbase cloud sessions. Stop only the named session created for your task when finished.

For repository checks, run:

```bash
node scripts/validate-template.mjs
node scripts/sync-version.mjs --check
```

The native manifest participates in the repository's version synchronization and validation. The shared skill remains the single source of browser instructions.
