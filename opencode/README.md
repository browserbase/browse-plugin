# @browserbasehq/opencode

[OpenCode](https://opencode.ai) plugin for [Browserbase](https://browserbase.com) browser automation. It gives your agent the [browse CLI](https://github.com/browserbase/stagehand/tree/main/packages/cli) for navigating pages, extracting content, taking screenshots, and interacting with real web pages.

## Installation

The plugin supports OpenCode 2 and OpenCode 1 from the same package.

### OpenCode 2

```bash
opencode plugin add @browserbasehq/opencode
```

Or add it to `opencode.jsonc` yourself:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@browserbasehq/opencode"]
}
```

### OpenCode 1

Add it to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@browserbasehq/opencode"]
}
```

OpenCode installs the package on the next start.

### Install the browse CLI

The plugin bundles the browse skill, but you need the CLI installed globally:

```bash
npm install -g browse
```

Verify the installation:

```bash
which browse && browse --help
```

## Authentication

### Local browsing (no key required)

For local browser sessions, no API key is needed. The browse CLI uses Chrome or Chromium on your machine:

```bash
browse open https://example.com --local
browse snapshot
browse stop
```

### Browserbase cloud

For remote stealth sessions, proxies, and CAPTCHA solving, set your API key:

```bash
export BROWSERBASE_API_KEY=your-api-key
```

Get a key at [browserbase.com/settings](https://browserbase.com/settings).

Optionally set a project ID:

```bash
export BROWSERBASE_PROJECT_ID=your-project-id
```

The plugin passes these environment variables to shell commands automatically, so the browse CLI is authenticated without manual configuration in each session.

## Skills

The plugin bundles the browse CLI skill, which teaches your agent:

- Opening and navigating web pages
- Taking accessibility snapshots (structured page state)
- Taking screenshots
- Clicking, typing, and interacting with elements
- Managing browser sessions and tabs
- Using Browserbase cloud APIs
- Working with contexts, extensions, and functions

Just ask your agent:

- *"Go to Hacker News and get the top 5 stories."*
- *"Fill out the signup form on example.com."*
- *"Take a screenshot of localhost:3000."*

## Links

- [browse CLI documentation](https://github.com/browserbase/stagehand/tree/main/packages/cli)
- [Browserbase documentation](https://docs.browserbase.com)
- [OpenCode plugin docs](https://opencode.ai/v2/docs/plugins)
- [browse-plugin repository](https://github.com/browserbase/browse-plugin)

## License

MIT
