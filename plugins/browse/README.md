# Browserbase Browse

Browser automation plugin for Cursor. Control a real Chrome browser using MCP tools -- navigate pages, click elements, fill forms, extract data, and take screenshots.

**Zero API keys required** for local mode. Just install and go.

## How it works

The plugin runs an MCP server that wraps Playwright. Cursor's model sees the page through screenshots and interactive element snapshots, then issues precise tool calls (`browser_click`, `browser_type`, etc.) to control the browser.

## Setup

```bash
cd plugins/browse
npm install      # Dependencies install + TypeScript auto-builds
```

The MCP server starts automatically when Cursor activates the plugin.

## Usage

Once installed, ask Cursor to browse:

- *"Go to Hacker News and summarize the top 5 posts"*
- *"Fill out the contact form on example.com"*
- *"Take a screenshot of my dashboard at localhost:3000"*
- *"Extract all product prices from this page"*

## Tools

| Tool | Description |
|------|-------------|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | List interactive elements with CSS selectors |
| `browser_click` | Click an element |
| `browser_type` | Type into an input field |
| `browser_screenshot` | Capture the current page |
| `browser_scroll` | Scroll the page |
| `browser_select` | Pick a dropdown option |
| `browser_evaluate` | Run JavaScript |
| `browser_wait` | Wait for elements or time |
| `browser_close` | Close the browser |

## Browserbase Cloud (optional)

For stealth browsing, proxy support, and CAPTCHA solving, set environment variables:

```bash
export BROWSERBASE_API_KEY="your-api-key"
export BROWSERBASE_PROJECT_ID="your-project-id"
```

Get credentials at [browserbase.com/settings](https://browserbase.com/settings).

## Troubleshooting

### Chrome not found

Install Chrome for your platform:
- **macOS/Windows**: [google.com/chrome](https://www.google.com/chrome/)
- **Linux**: `sudo apt install google-chrome-stable`

### Profile refresh

To re-copy cookies from your main Chrome profile:

```bash
rm -rf .chrome-profile
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Browserbase](https://browserbase.com)
- [MCP Specification](https://modelcontextprotocol.io)
