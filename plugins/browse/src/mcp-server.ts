#!/usr/bin/env node

/**
 * MCP server for browser automation.
 *
 * Two backends depending on environment:
 *
 * - **Local mode** (default): shells out to @browserbasehq/browse-cli.
 *   The browse daemon manages Chrome lifecycle and keeps state between calls.
 *
 * - **Browserbase cloud mode** (BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID):
 *   keeps a Playwright CDP connection alive in-process. This is required
 *   because BB sessions die when the last client disconnects, so the
 *   per-command `--ws` approach doesn't work.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { isBrowserbaseMode, clearCachedSession } from './browserbase.js';
import * as bb from './bb-browser.js';

// ---------- Resolve paths & load env ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

dotenv.config({ path: join(PLUGIN_ROOT, '.env') });

const BROWSE_BIN = join(PLUGIN_ROOT, 'node_modules', '.bin', 'browse');
const BB_MODE = isBrowserbaseMode();

const execFileAsync = promisify(execFile);

if (BB_MODE) {
  console.error('[mcp] Browserbase cloud mode — using in-process Playwright connection');
} else {
  console.error('[mcp] Local mode — using browse-cli daemon');
}

// ---------- Local mode: browse-cli runner ----------

async function runBrowse(...args: string[]): Promise<Record<string, unknown>> {
  const { stdout, stderr } = await execFileAsync(BROWSE_BIN, ['--json', ...args], {
    timeout: 60_000,
    env: process.env,
  });

  if (stderr) {
    console.error('[browse]', stderr.trim());
  }

  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return { output: stdout.trim() };
  }
}

// ---------- Helper ----------

function json(obj: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

async function safeTool(fn: () => Promise<Record<string, unknown>>) {
  try {
    return json(await fn());
  } catch (err) {
    return json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      true,
    );
  }
}

// ---------- MCP Server ----------

const server = new McpServer({ name: 'browser', version: '2.0.0' });

// --- browser_navigate ---
server.registerTool(
  'browser_navigate',
  {
    description:
      'Navigate to a URL in the browser. Launches Chrome automatically on first call. Returns page title and URL.',
    inputSchema: {
      url: z.string().describe('The URL to navigate to (include https://)'),
    },
  },
  async ({ url }) =>
    safeTool(async () => (BB_MODE ? bb.bbNavigate(url) : runBrowse('open', url))),
);

// --- browser_click ---
server.registerTool(
  'browser_click',
  {
    description:
      'Click an element on the page by ref. Use browser_snapshot first to get element refs. Refs look like @0-5.',
    inputSchema: {
      ref: z.string().describe('Element ref from snapshot (e.g., @0-5)'),
    },
  },
  async ({ ref }) =>
    safeTool(async () => (BB_MODE ? bb.bbClick(ref) : runBrowse('click', ref))),
);

// --- browser_click_xy ---
server.registerTool(
  'browser_click_xy',
  {
    description: 'Click at exact page coordinates.',
    inputSchema: {
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
    },
  },
  async ({ x, y }) =>
    safeTool(async () =>
      BB_MODE ? bb.bbClickXY(x, y) : runBrowse('click_xy', String(x), String(y)),
    ),
);

// --- browser_type ---
server.registerTool(
  'browser_type',
  {
    description:
      'Type text into the currently focused element. Use browser_click or browser_fill to focus an element first.',
    inputSchema: {
      text: z.string().describe('Text to type'),
      delay: z.number().optional().describe('Delay between keystrokes in ms'),
    },
  },
  async ({ text, delay }) =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbType(text, delay);
      const args = ['type', text];
      if (delay !== undefined) args.push('-d', String(delay));
      return runBrowse(...args);
    }),
);

// --- browser_fill ---
server.registerTool(
  'browser_fill',
  {
    description:
      'Fill an input field by ref. Clears the field first. Presses Enter after by default.',
    inputSchema: {
      ref: z.string().describe('Element ref from snapshot (e.g., @0-5)'),
      value: z.string().describe('Value to fill'),
      pressEnter: z
        .boolean()
        .optional()
        .describe('Whether to press Enter after filling (default: true)'),
    },
  },
  async ({ ref, value, pressEnter }) =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbFill(ref, value, pressEnter ?? true);
      const args = ['fill', ref, value];
      if (pressEnter === false) args.push('--no-press-enter');
      return runBrowse(...args);
    }),
);

// --- browser_press ---
server.registerTool(
  'browser_press',
  {
    description:
      'Press a key or key combination. Examples: Enter, Tab, Escape, Cmd+A, Shift+Tab.',
    inputSchema: {
      key: z.string().describe('Key to press (e.g., Enter, Tab, Cmd+A)'),
    },
  },
  async ({ key }) =>
    safeTool(async () => (BB_MODE ? bb.bbPress(key) : runBrowse('press', key))),
);

// --- browser_select ---
server.registerTool(
  'browser_select',
  {
    description: 'Select option(s) in a <select> element by ref.',
    inputSchema: {
      ref: z.string().describe('Element ref from snapshot (e.g., @0-5)'),
      values: z.array(z.string()).describe('Value(s) to select'),
    },
  },
  async ({ ref, values }) =>
    safeTool(async () =>
      BB_MODE ? bb.bbSelect(ref, values) : runBrowse('select', ref, ...values),
    ),
);

// --- browser_snapshot ---
server.registerTool(
  'browser_snapshot',
  {
    description:
      'Get the accessibility tree snapshot with element refs. Use refs from the output to target elements in browser_click, browser_fill, and browser_select.',
    inputSchema: {
      compact: z
        .boolean()
        .optional()
        .describe('Compact output without maps (default: true)'),
    },
  },
  async ({ compact }) =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbSnapshot(compact ?? true);
      const args = ['snapshot'];
      if (compact !== false) args.push('-c');
      return runBrowse(...args);
    }),
);

// --- browser_screenshot ---
server.registerTool(
  'browser_screenshot',
  {
    description:
      'Take a screenshot of the current page. Returns the file path.',
    inputSchema: {
      path: z.string().optional().describe('File path to save screenshot to'),
      fullPage: z.boolean().optional().describe('Capture the full scrollable page'),
    },
  },
  async ({ path, fullPage }) =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbScreenshot(path, fullPage);
      const args = ['screenshot'];
      if (path) args.push(path);
      if (fullPage) args.push('--full-page');
      return runBrowse(...args);
    }),
);

// --- browser_scroll ---
server.registerTool(
  'browser_scroll',
  {
    description: 'Scroll the page at given coordinates.',
    inputSchema: {
      x: z.number().describe('X coordinate to scroll at'),
      y: z.number().describe('Y coordinate to scroll at'),
      deltaX: z.number().optional().describe('Horizontal scroll amount (default: 0)'),
      deltaY: z.number().optional().describe('Vertical scroll amount (default: 500)'),
    },
  },
  async ({ x, y, deltaX, deltaY }) =>
    safeTool(async () =>
      BB_MODE
        ? bb.bbScroll(x, y, deltaX ?? 0, deltaY ?? 500)
        : runBrowse('scroll', String(x), String(y), String(deltaX ?? 0), String(deltaY ?? 500)),
    ),
);

// --- browser_hover ---
server.registerTool(
  'browser_hover',
  {
    description: 'Hover at exact page coordinates.',
    inputSchema: {
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
    },
  },
  async ({ x, y }) =>
    safeTool(async () =>
      BB_MODE ? bb.bbHover(x, y) : runBrowse('hover', String(x), String(y)),
    ),
);

// --- browser_drag ---
server.registerTool(
  'browser_drag',
  {
    description: 'Drag from one point to another.',
    inputSchema: {
      fromX: z.number().describe('Start X coordinate'),
      fromY: z.number().describe('Start Y coordinate'),
      toX: z.number().describe('End X coordinate'),
      toY: z.number().describe('End Y coordinate'),
    },
  },
  async ({ fromX, fromY, toX, toY }) =>
    safeTool(async () =>
      BB_MODE
        ? bb.bbDrag(fromX, fromY, toX, toY)
        : runBrowse('drag', String(fromX), String(fromY), String(toX), String(toY)),
    ),
);

// --- browser_evaluate ---
server.registerTool(
  'browser_evaluate',
  {
    description:
      'Run JavaScript in the browser page context. Returns the result as a string.',
    inputSchema: {
      script: z.string().describe('JavaScript code to execute in the page context'),
    },
  },
  async ({ script }) =>
    safeTool(async () => (BB_MODE ? bb.bbEvaluate(script) : runBrowse('eval', script))),
);

// --- browser_get ---
server.registerTool(
  'browser_get',
  {
    description:
      'Get page info: url, title, text, html, value, or box. For text/html/value/box, provide a CSS selector.',
    inputSchema: {
      what: z
        .enum(['url', 'title', 'text', 'html', 'value', 'box'])
        .describe('What to get'),
      selector: z
        .string()
        .optional()
        .describe('CSS selector (required for text, html, value, box)'),
    },
  },
  async ({ what, selector }) =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbGet(what, selector);
      const args = ['get', what];
      if (selector) args.push(selector);
      return runBrowse(...args);
    }),
);

// --- browser_wait ---
server.registerTool(
  'browser_wait',
  {
    description:
      'Wait for a load state, CSS selector, or fixed timeout.',
    inputSchema: {
      type: z
        .enum(['load', 'selector', 'timeout'])
        .describe('What to wait for: load state, CSS selector, or timeout'),
      value: z
        .string()
        .optional()
        .describe(
          'For load: state name (load/domcontentloaded/networkidle). For selector: CSS selector. For timeout: milliseconds.',
        ),
      timeout: z
        .number()
        .optional()
        .describe('Maximum wait time in milliseconds'),
    },
  },
  async ({ type, value, timeout }) =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbWait(type, value, timeout);
      const args = ['wait', type];
      if (value) args.push(value);
      if (timeout !== undefined) args.push('-t', String(timeout));
      return runBrowse(...args);
    }),
);

// --- browser_back ---
server.registerTool(
  'browser_back',
  {
    description: 'Go back in browser history.',
    inputSchema: {},
  },
  async () => safeTool(async () => (BB_MODE ? bb.bbBack() : runBrowse('back'))),
);

// --- browser_forward ---
server.registerTool(
  'browser_forward',
  {
    description: 'Go forward in browser history.',
    inputSchema: {},
  },
  async () => safeTool(async () => (BB_MODE ? bb.bbForward() : runBrowse('forward'))),
);

// --- browser_reload ---
server.registerTool(
  'browser_reload',
  {
    description: 'Reload the current page.',
    inputSchema: {},
  },
  async () => safeTool(async () => (BB_MODE ? bb.bbReload() : runBrowse('reload'))),
);

// --- browser_pages ---
server.registerTool(
  'browser_pages',
  {
    description: 'List all open browser tabs.',
    inputSchema: {},
  },
  async () => safeTool(async () => (BB_MODE ? bb.bbPages() : runBrowse('pages'))),
);

// --- browser_new_tab ---
server.registerTool(
  'browser_new_tab',
  {
    description: 'Open a new browser tab, optionally navigating to a URL.',
    inputSchema: {
      url: z.string().optional().describe('URL to open in the new tab'),
    },
  },
  async ({ url }) =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbNewTab(url);
      const args = ['newpage'];
      if (url) args.push(url);
      return runBrowse(...args);
    }),
);

// --- browser_switch_tab ---
server.registerTool(
  'browser_switch_tab',
  {
    description: 'Switch to a browser tab by index.',
    inputSchema: {
      index: z.number().describe('Tab index (from browser_pages)'),
    },
  },
  async ({ index }) =>
    safeTool(async () =>
      BB_MODE ? bb.bbSwitchTab(index) : runBrowse('tab_switch', String(index)),
    ),
);

// --- browser_close_tab ---
server.registerTool(
  'browser_close_tab',
  {
    description: 'Close a browser tab by index. Defaults to the last tab.',
    inputSchema: {
      index: z.number().optional().describe('Tab index to close (defaults to last)'),
    },
  },
  async ({ index }) =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbCloseTab(index);
      const args = ['tab_close'];
      if (index !== undefined) args.push(String(index));
      return runBrowse(...args);
    }),
);

// --- browser_highlight ---
server.registerTool(
  'browser_highlight',
  {
    description: 'Highlight an element on the page for visual debugging.',
    inputSchema: {
      ref: z.string().describe('Element ref or CSS selector to highlight'),
    },
  },
  async ({ ref }) =>
    safeTool(async () => {
      if (BB_MODE) {
        // No highlight in BB mode — just acknowledge
        return { highlighted: ref, note: 'Highlight not available in cloud mode' };
      }
      return runBrowse('highlight', ref);
    }),
);

// --- browser_network ---
server.registerTool(
  'browser_network',
  {
    description:
      'Network capture: on (start), off (stop), path (get capture dir), clear (delete captures).',
    inputSchema: {
      action: z
        .enum(['on', 'off', 'path', 'clear'])
        .describe('Network capture action'),
    },
  },
  async ({ action }) =>
    safeTool(async () => {
      if (BB_MODE) {
        return { note: 'Network capture not available in Browserbase cloud mode' };
      }
      return runBrowse('network', action);
    }),
);

// --- browser_status ---
server.registerTool(
  'browser_status',
  {
    description: 'Check the browser daemon status.',
    inputSchema: {},
  },
  async () =>
    safeTool(async () => {
      if (BB_MODE) {
        return { mode: 'browserbase', connected: true };
      }
      return runBrowse('status');
    }),
);

// --- browser_close ---
server.registerTool(
  'browser_close',
  {
    description:
      'Stop the browser daemon and free resources. Call this when done with browser automation.',
    inputSchema: {},
  },
  async () =>
    safeTool(async () => {
      if (BB_MODE) return bb.bbClose();
      const result = await runBrowse('stop');
      clearCachedSession();
      return result;
    }),
);

// ---------- Start ----------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
