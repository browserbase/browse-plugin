---
name: browser-automation
description: Automate web browser interactions using MCP tools. Use when the user asks to browse websites, navigate web pages, extract data from websites, take screenshots, fill forms, click buttons, or interact with web applications.
---

# Browser Automation

Control a real Chrome browser through MCP tools. The browser launches automatically on first use via a background daemon -- no API keys required for local mode.

## Available Tools

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Go to a URL (auto-starts browser daemon) |
| `browser_snapshot` | Get accessibility tree with element refs |
| `browser_click` | Click an element by ref (e.g., `@0-5`) |
| `browser_type` | Type text (goes to focused element) |
| `browser_fill` | Fill an input field by ref |
| `browser_press` | Press a key (Enter, Tab, Escape, Cmd+A, etc.) |
| `browser_select` | Pick a dropdown option by ref |
| `browser_screenshot` | Capture the current page |
| `browser_scroll` | Scroll at coordinates |
| `browser_hover` | Hover at coordinates |
| `browser_drag` | Drag from one point to another |
| `browser_click_xy` | Click at exact coordinates |
| `browser_evaluate` | Run JavaScript in the page |
| `browser_get` | Get page info (url, title, text, html, value, box) |
| `browser_wait` | Wait for load state, selector, or timeout |
| `browser_back` | Go back in history |
| `browser_forward` | Go forward in history |
| `browser_reload` | Reload current page |
| `browser_pages` | List all open tabs |
| `browser_new_tab` | Open a new tab |
| `browser_switch_tab` | Switch to a tab by index |
| `browser_close_tab` | Close a tab by index |
| `browser_network` | Capture/inspect HTTP requests |
| `browser_close` | Stop the browser daemon |

## Core Workflow

Every browser task follows this loop:

1. **Navigate** to the target URL with `browser_navigate`
2. **Snapshot** the page with `browser_snapshot` to get the accessibility tree with element refs
3. **Act** using `browser_click`, `browser_fill`, `browser_press`, `browser_select` with the **refs** from the snapshot
4. **Verify** with `browser_screenshot` to confirm the action worked
5. **Repeat** steps 2-4 until the task is complete
6. **Close** the browser with `browser_close` when done

## How Element Refs Work

Call `browser_snapshot` -- it returns an accessibility tree where every interactive element has a **ref** like `[0-5]`. Use that ref to target the element.

```
RootWebArea "Example" url="https://example.com"
  [0-0] link "Home"
  [0-1] link "About"
  [0-2] button "Sign In"
  [0-5] textbox "Search"
```

Then act on elements using their ref:

```
browser_click({ ref: "@0-2" })        → clicks "Sign In"
browser_fill({ ref: "@0-5", value: "my query" })  → fills the search box
```

Refs are more reliable than CSS selectors because they're tied to the accessibility tree and work across iframes.

### Ref formats (all equivalent)

- `@0-5` -- @ prefix
- `0-5` -- plain ref
- `ref=0-5` -- explicit prefix

### Snapshot also provides maps

The full snapshot output includes:
- **xpathMap**: Cross-frame XPath selectors
- **cssMap**: CSS selectors when available
- **urlMap**: URLs extracted from links

Use the compact flag (`-c`) for a concise tree without the maps.

## Common Patterns

### Fill out a form

```
1. browser_navigate({ url: "https://example.com/signup" })
2. browser_snapshot()
   → Find refs: [0-3] textbox "Email", [0-4] textbox "Password", [0-7] button "Submit"
3. browser_fill({ ref: "@0-3", value: "user@example.com" })
4. browser_fill({ ref: "@0-4", value: "securepassword" })
5. browser_click({ ref: "@0-7" })
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
3. browser_snapshot()  → Find the "Next" button ref
4. browser_click({ ref: "@0-12" })
5. browser_wait({ type: "load" })
6. browser_evaluate({ script: "..." })  → Extract data from page 2
```

### Deal with elements not in view

```
1. browser_snapshot()  → Target element not found
2. browser_scroll({ x: 0, y: 0, deltaX: 0, deltaY: 500 })
3. browser_snapshot()  → Now the element appears
4. browser_click({ ref: "@0-8" })
```

### Wait for dynamic content

```
1. browser_click({ ref: "@0-3" })
2. browser_wait({ type: "selector", value: ".new-content", timeout: 10000 })
3. browser_snapshot()  → New elements available
```

### Multi-tab workflow

```
1. browser_navigate({ url: "https://example.com" })
2. browser_new_tab({ url: "https://other.com" })
3. browser_pages()  → See tab indices
4. browser_switch_tab({ index: 0 })  → Back to first tab
5. browser_close_tab({ index: 1 })  → Close second tab
```

### Keyboard shortcuts

```
1. browser_press({ key: "Cmd+A" })     → Select all
2. browser_press({ key: "Cmd+C" })     → Copy
3. browser_press({ key: "Tab" })       → Move to next field
4. browser_press({ key: "Enter" })     → Submit
5. browser_press({ key: "Escape" })    → Close modal
```

### Network inspection

```
1. browser_network({ action: "on" })     → Start capturing
2. browser_navigate({ url: "https://api.example.com" })
3. browser_network({ action: "path" })   → Get capture directory
4. browser_network({ action: "off" })    → Stop capturing
```

## Error Recovery

- **Element not found**: Call `browser_snapshot` again -- the page may have changed. Refs update on each snapshot.
- **Page not loaded**: Use `browser_wait({ type: "load" })` before interacting.
- **Click intercepted**: Another element is covering the target. Scroll or close modals first.
- **Timeout**: Increase the timeout parameter or check if the page requires interaction first.
- **Stale page**: After navigation or form submission, always snapshot again before acting.
- **Daemon crashed**: Commands self-heal -- the daemon auto-restarts on the next command.

## Tips

- **Always navigate first** before any other interaction.
- **Always snapshot before acting** to get current refs -- refs change when the page changes.
- **Take screenshots after key actions** to verify state.
- **Use refs, not CSS selectors** -- they are more reliable across iframes and dynamic pages.
- **Use `browser_fill` for form inputs** -- it's designed for input fields and presses Enter by default.
- **Use `browser_type` for raw text** -- goes to the currently focused element.
- **Use `browser_press` for keyboard shortcuts** -- Enter, Tab, Escape, Cmd+A, etc.
- **Close the browser when done** to free system resources.
- **Use `browser_evaluate` for bulk extraction** -- it's faster than scraping element by element.
- **Use `browser_get` for quick info** -- url, title, text, html, value, box without a full snapshot.

## Environment Modes

The browser tools automatically detect which mode to use. No code changes or extra configuration from the model is needed -- just call the tools normally. The same tools work identically in both modes.

- **Local** (default): Uses the user's installed Chrome. No API keys needed. A background daemon manages the browser lifecycle.
- **Browserbase cloud**: Activates automatically when a `.env` file in the plugin root contains `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. Provides stealth browsing, proxy support, and CAPTCHA solving. The CLI wrapper creates a cloud session and connects the daemon via WebSocket.

The model should NEVER try to configure credentials or environment variables. If the user wants to switch modes, they edit the `.env` file themselves.
