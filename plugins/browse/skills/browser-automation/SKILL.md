---
name: browser-automation
description: Automate web browser interactions using MCP tools. Use when the user asks to browse websites, navigate web pages, extract data from websites, take screenshots, fill forms, click buttons, or interact with web applications.
---

# Browser Automation

Control a real Chrome browser through MCP tools. The browser launches automatically on first use -- no API keys required for local mode.

## Available Tools

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | Get all interactive elements with CSS selectors |
| `browser_click` | Click an element by CSS selector |
| `browser_type` | Clear and type into an input field |
| `browser_screenshot` | Capture the current page |
| `browser_scroll` | Scroll up/down/left/right |
| `browser_select` | Pick a dropdown option |
| `browser_evaluate` | Run JavaScript in the page |
| `browser_wait` | Wait for an element or a fixed delay |
| `browser_close` | Close the browser |

## Core Workflow

Every browser task follows this loop:

1. **Navigate** to the target URL with `browser_navigate`
2. **Snapshot** the page with `browser_snapshot` to see interactive elements and their selectors
3. **Act** using `browser_click`, `browser_type`, `browser_select` with the selectors from the snapshot
4. **Verify** with `browser_screenshot` to confirm the action worked
5. **Repeat** steps 2-4 until the task is complete
6. **Close** the browser with `browser_close` when done

## How to Find the Right Selector

Call `browser_snapshot` -- it returns every interactive element with the best CSS selector for it. The output looks like:

```json
{
  "elements": [
    { "index": 0, "tag": "a", "selector": "#logo", "text": "Home", "href": "/" },
    { "index": 1, "tag": "button", "selector": "#login-btn", "text": "Sign In" },
    { "index": 2, "tag": "input", "selector": "input[name=\"email\"]", "type": "email", "placeholder": "Enter email" },
    { "index": 3, "tag": "input", "selector": "input[name=\"password\"]", "type": "password" }
  ]
}
```

Use the `selector` field directly in `browser_click` or `browser_type` calls.

### Selector Priority (if building selectors manually)

1. `#id` -- Most reliable
2. `[data-testid="..."]` -- Designed for automation
3. `[aria-label="..."]` -- Accessible and stable
4. `input[name="..."]` -- Forms
5. `.unique-class` -- If class is specific enough
6. `tag:nth-of-type(n)` -- Last resort

## Common Patterns

### Fill out a form

```
1. browser_navigate({ url: "https://example.com/signup" })
2. browser_snapshot()
   → Find input selectors: input[name="email"], input[name="password"]
3. browser_type({ selector: "input[name='email']", text: "user@example.com" })
4. browser_type({ selector: "input[name='password']", text: "securepassword" })
5. browser_click({ selector: "button[type='submit']" })
6. browser_screenshot()  → Verify success
```

### Extract data from a page

```
1. browser_navigate({ url: "https://example.com/products" })
2. browser_evaluate({ script: "JSON.stringify(Array.from(document.querySelectorAll('.product')).map(el => ({ name: el.querySelector('h2')?.textContent, price: el.querySelector('.price')?.textContent })))" })
```

### Handle pagination

```
1. browser_navigate({ url: "https://example.com/results" })
2. browser_evaluate({ script: "..." })  → Extract data from page 1
3. browser_snapshot()  → Find the "Next" button
4. browser_click({ selector: "a.next-page" })
5. browser_wait({ selector: ".results-loaded" })
6. browser_evaluate({ script: "..." })  → Extract data from page 2
```

### Deal with elements not in view

```
1. browser_snapshot()  → Target element not found
2. browser_scroll({ direction: "down" })
3. browser_snapshot()  → Now the element appears
4. browser_click({ selector: "..." })
```

### Wait for dynamic content

```
1. browser_click({ selector: "#load-more" })
2. browser_wait({ selector: ".new-content", timeout: 10000 })
3. browser_snapshot()  → New elements available
```

## Error Recovery

- **Element not found**: Call `browser_snapshot` again -- the page may have changed. Try alternative selectors.
- **Page not loaded**: Use `browser_wait({ selector: "..." })` before interacting.
- **Click intercepted**: Another element is covering the target. Scroll or close modals first.
- **Timeout**: Increase the timeout parameter or check if the page requires interaction first.
- **Stale page**: After navigation or form submission, always snapshot again before acting.

## Tips

- **Always navigate first** before any other interaction.
- **Always snapshot before clicking** to get current selectors -- pages change.
- **Take screenshots after key actions** to verify state.
- **Be specific with selectors** -- prefer `#id` or `[name=...]` over generic `.button`.
- **Close the browser when done** to free system resources.
- **Use `browser_evaluate` for bulk extraction** -- it's faster than scraping element by element.

## Environment Modes

The browser tools automatically detect which mode to use. No code changes or extra configuration from the model is needed -- just call the tools normally. The same tools work identically in both modes.

- **Local** (default): Uses the user's installed Chrome. No API keys needed.
- **Browserbase cloud**: Activates automatically when a `.env` file in the plugin root contains `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. Provides stealth browsing, proxy support, and CAPTCHA solving.

The model should NEVER try to configure credentials or environment variables. If the user wants to switch modes, they edit the `.env` file themselves.
