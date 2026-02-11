# Browserbase for Cursor

Browser automation plugins for the Cursor IDE Marketplace. Control a real Chrome browser through natural language -- navigate, click, type, extract data, and take screenshots.

## Plugins

| Plugin | Description |
|--------|-------------|
| [browse](plugins/browse/) | Automate browser interactions via MCP tools. Navigate pages, fill forms, extract data, take screenshots. No API key needed for local mode. |
| [functions](plugins/functions/) | Deploy serverless browser automation to Browserbase cloud using the `bb` CLI. |

## Quick start

### Browse plugin

```bash
cd plugins/browse
npm install      # Installs dependencies and auto-builds TypeScript
```

The MCP server starts automatically when the plugin is active in Cursor. Just ask:

- *"Go to Hacker News and get the top 5 stories"*
- *"Fill out the signup form on example.com"*
- *"Take a screenshot of localhost:3000"*

### Browserbase cloud (optional)

For stealth browsing, proxies, and CAPTCHA solving:

```bash
export BROWSERBASE_API_KEY="your-api-key"
export BROWSERBASE_PROJECT_ID="your-project-id"
```

Get credentials at [browserbase.com/settings](https://browserbase.com/settings).

## Architecture

The browse plugin runs an MCP server over stdio that wraps Playwright:

```
Cursor Model  ──MCP tool call──▶  MCP Server  ──Playwright──▶  Chrome
     ▲                                │
     │                                │
     └──── screenshot file path ──────┘
     └──── interactive elements ──────┘
```

- **No API key** needed for local Chrome automation
- **Headed browser** -- you can watch the automation happen
- **10 MCP tools**: navigate, click, type, snapshot, screenshot, scroll, evaluate, select, wait, close
- **Persistent sessions** -- cookies and login state carry over via Chrome profile

## Validation

```bash
node scripts/validate-template.mjs
```

## Troubleshooting

### Chrome not found

- **macOS/Windows**: Install from [google.com/chrome](https://www.google.com/chrome/)
- **Linux**: `sudo apt install google-chrome-stable`

### Profile refresh

```bash
rm -rf plugins/browse/.chrome-profile
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Browserbase](https://browserbase.com)
- [MCP Specification](https://modelcontextprotocol.io)
- [Cursor Marketplace](https://cursor.com)
