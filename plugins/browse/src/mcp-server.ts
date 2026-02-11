#!/usr/bin/env node

/**
 * MCP server for browser automation.
 *
 * Holds the Playwright browser connection **in-process** so the WebSocket
 * stays open across tool calls.  This is critical for Browserbase cloud
 * mode where the session dies as soon as every client disconnects.
 *
 * For local Chrome mode the old CLI-spawning approach also worked (Chrome
 * stays alive independently), but keeping everything in-process is simpler
 * and consistent for both modes.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  findLocalChrome,
  prepareChromeProfile,
  takeScreenshot,
  extractInteractiveElements,
} from './browser-utils.js';

// ---------- Resolve paths & load env ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/src/mcp-server.js -> dist/src -> dist -> plugin-root
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

dotenv.config({ path: join(PLUGIN_ROOT, '.env') });

const CDP_PORT = 9222;

// ---------- Persistent browser state ----------

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;
let _page: Page | null = null;
let _chromeProcess: ChildProcess | null = null;

/**
 * Check if Chrome is already running on the CDP port.
 */
async function isChromeRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the WebSocket debugger URL from a running Chrome instance.
 */
async function getWsUrl(): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const data = (await response.json()) as { webSocketDebuggerUrl: string };
  return data.webSocketDebuggerUrl;
}

/**
 * Returns the current page, lazily initialising the browser on first call.
 * Subsequent calls reuse the same connection.
 */
async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) {
    return _page;
  }

  // If we had a stale reference, reset everything
  _browser = null;
  _context = null;
  _page = null;

  const bbApiKey = process.env.BROWSERBASE_API_KEY;
  const bbProjectId = process.env.BROWSERBASE_PROJECT_ID;

  if (bbApiKey && bbProjectId) {
    // --- Browserbase cloud mode ---
    console.error('[browser] Creating Browserbase session…');

    const sessionRes = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bb-api-key': bbApiKey,
      },
      body: JSON.stringify({ projectId: bbProjectId }),
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      throw new Error(
        `Browserbase session creation failed (${sessionRes.status}): ${errText}`,
      );
    }

    const session = (await sessionRes.json()) as { id: string; connectUrl: string };
    console.error('[browser] Connected to Browserbase session', session.id);

    _browser = await chromium.connectOverCDP(session.connectUrl);
    _context = _browser.contexts()[0] ?? (await _browser.newContext());
    _page = _context.pages()[0] ?? (await _context.newPage());

    return _page;
  }

  // --- Local Chrome mode ---
  const chromePath = findLocalChrome();
  if (!chromePath) {
    throw new Error(
      'Chrome not found. Install Google Chrome or set BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID for cloud mode.',
    );
  }

  let chromeReady = await isChromeRunning();

  if (chromeReady) {
    console.error('[browser] Reusing existing Chrome on port', CDP_PORT);
  } else {
    const tempUserDataDir = join(PLUGIN_ROOT, '.chrome-profile');
    prepareChromeProfile(PLUGIN_ROOT);

    _chromeProcess = spawn(
      chromePath,
      [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tempUserDataDir}`,
        '--window-size=1280,720',
        '--disable-blink-features=AutomationControlled',
      ],
      { stdio: 'ignore', detached: false },
    );

    if (_chromeProcess.pid) {
      const pidFilePath = join(PLUGIN_ROOT, '.chrome-pid');
      writeFileSync(
        pidFilePath,
        JSON.stringify({ pid: _chromeProcess.pid, startTime: Date.now() }),
      );
    }

    for (let i = 0; i < 50; i++) {
      if (await isChromeRunning()) {
        chromeReady = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!chromeReady) {
      throw new Error('Chrome failed to start within 15 seconds');
    }
    console.error('[browser] Launched local Chrome on port', CDP_PORT);
  }

  const wsUrl = await getWsUrl();
  _browser = await chromium.connectOverCDP(wsUrl);
  _context = _browser.contexts()[0] ?? (await _browser.newContext());
  _page = _context.pages()[0] ?? (await _context.newPage());

  // Wait for the page to be ready
  let retries = 0;
  while (retries < 30) {
    try {
      await _page.evaluate('document.readyState');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
      retries++;
    }
  }

  // Ensure downloads dir exists
  const downloadsPath = join(PLUGIN_ROOT, 'agent', 'downloads');
  if (!existsSync(downloadsPath)) {
    mkdirSync(downloadsPath, { recursive: true });
  }

  return _page;
}

/**
 * Verify a PID belongs to a Chrome process before killing it.
 */
async function verifyIsChromeProcess(pid: number): Promise<boolean> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    if (process.platform === 'darwin' || process.platform === 'linux') {
      const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
      const processName = stdout.trim().toLowerCase();
      return processName.includes('chrome') || processName.includes('chromium');
    } else if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
      );
      return stdout.toLowerCase().includes('chrome');
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Close the browser and kill Chrome if we started it.
 */
async function closeBrowser(): Promise<void> {
  const pidFilePath = join(PLUGIN_ROOT, '.chrome-pid');

  try {
    if (_context) await _context.close().catch(() => {});
    if (_browser) await _browser.close().catch(() => {});
  } catch {
    // already closed
  }
  _page = null;
  _context = null;
  _browser = null;

  // For local mode – force-kill Chrome if still alive
  try {
    if (await isChromeRunning()) {
      if (existsSync(pidFilePath)) {
        const pidData = JSON.parse(readFileSync(pidFilePath, 'utf8'));
        const { pid } = pidData;
        if (await verifyIsChromeProcess(pid)) {
          if (process.platform === 'win32') {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            await execAsync(`taskkill /PID ${pid} /F`);
          } else {
            process.kill(pid, 'SIGKILL');
          }
        }
      }
    }
  } catch {
    // ignore
  } finally {
    if (existsSync(pidFilePath)) {
      try {
        unlinkSync(pidFilePath);
      } catch { /* ignore */ }
    }
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

const server = new McpServer({ name: 'browser', version: '1.0.0' });

// --- browser_navigate ---
server.registerTool(
  'browser_navigate',
  {
    description:
      'Navigate to a URL in the browser. Launches Chrome automatically on first call. Returns page title and a screenshot file path.',
    inputSchema: {
      url: z.string().describe('The URL to navigate to (include https://)'),
    },
  },
  async ({ url }) =>
    safeTool(async () => {
      const page = await getPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(1000);
      const title = await page.title();
      const screenshot = await takeScreenshot(page, PLUGIN_ROOT);
      return { success: true, title, url: page.url(), screenshot };
    }),
);

// --- browser_click ---
server.registerTool(
  'browser_click',
  {
    description:
      'Click an element on the page by CSS selector. Use browser_snapshot first to find the right selector.',
    inputSchema: {
      selector: z.string().describe('CSS selector of the element to click'),
    },
  },
  async ({ selector }) =>
    safeTool(async () => {
      const page = await getPage();
      await page.click(selector, { timeout: 10_000 });
      await page.waitForTimeout(500);
      const screenshot = await takeScreenshot(page, PLUGIN_ROOT);
      return { success: true, clicked: selector, screenshot };
    }),
);

// --- browser_type ---
server.registerTool(
  'browser_type',
  {
    description:
      'Clear an input field and type text into it. Use browser_snapshot to find the selector for the input.',
    inputSchema: {
      selector: z.string().describe('CSS selector of the input element'),
      text: z.string().describe('Text to type into the field'),
    },
  },
  async ({ selector, text }) =>
    safeTool(async () => {
      const page = await getPage();
      await page.click(selector, { timeout: 10_000 });
      await page.fill(selector, text);
      await page.waitForTimeout(300);
      const screenshot = await takeScreenshot(page, PLUGIN_ROOT);
      return { success: true, selector, typed: text, screenshot };
    }),
);

// --- browser_snapshot ---
server.registerTool(
  'browser_snapshot',
  {
    description:
      'Get all interactive elements on the page with their CSS selectors, roles, text, and state. Use this to find the right selector before clicking or typing. Returns elements like buttons, links, inputs, selects, and textareas.',
    inputSchema: {},
  },
  async () =>
    safeTool(async () => {
      const page = await getPage();
      const elements = await extractInteractiveElements(page);
      const title = await page.title();
      const url = page.url();
      return { success: true, title, url, elementCount: elements.length, elements };
    }),
);

// --- browser_screenshot ---
server.registerTool(
  'browser_screenshot',
  {
    description:
      'Take a screenshot of the current page and save it to disk. Returns the file path.',
    inputSchema: {},
  },
  async () =>
    safeTool(async () => {
      const page = await getPage();
      const screenshot = await takeScreenshot(page, PLUGIN_ROOT);
      return { success: true, screenshot };
    }),
);

// --- browser_scroll ---
server.registerTool(
  'browser_scroll',
  {
    description: 'Scroll the page in a direction. Returns a screenshot after scrolling.',
    inputSchema: {
      direction: z
        .enum(['up', 'down', 'left', 'right'])
        .describe('Direction to scroll'),
      amount: z.number().optional().describe('Pixels to scroll (default: 500)'),
    },
  },
  async ({ direction, amount }) =>
    safeTool(async () => {
      const page = await getPage();
      const px = amount ?? 500;
      const deltaX = direction === 'left' ? -px : direction === 'right' ? px : 0;
      const deltaY = direction === 'up' ? -px : direction === 'down' ? px : 0;
      await page.mouse.wheel(deltaX, deltaY);
      await page.waitForTimeout(500);
      const screenshot = await takeScreenshot(page, PLUGIN_ROOT);
      return { success: true, direction, amount: px, screenshot };
    }),
);

// --- browser_evaluate ---
server.registerTool(
  'browser_evaluate',
  {
    description:
      'Run arbitrary JavaScript in the browser page context. Returns the result as a string. Useful for extracting specific data or performing complex interactions.',
    inputSchema: {
      script: z.string().describe('JavaScript code to execute in the page context'),
    },
  },
  async ({ script }) =>
    safeTool(async () => {
      const page = await getPage();
      const result = await page.evaluate(script);
      return { success: true, result: result ?? null };
    }),
);

// --- browser_select ---
server.registerTool(
  'browser_select',
  {
    description:
      'Select an option in a <select> dropdown by its value. Returns a screenshot.',
    inputSchema: {
      selector: z.string().describe('CSS selector of the <select> element'),
      value: z.string().describe('Value of the option to select'),
    },
  },
  async ({ selector, value }) =>
    safeTool(async () => {
      const page = await getPage();
      await page.selectOption(selector, value, { timeout: 10_000 });
      await page.waitForTimeout(300);
      const screenshot = await takeScreenshot(page, PLUGIN_ROOT);
      return { success: true, selector, selected: value, screenshot };
    }),
);

// --- browser_wait ---
server.registerTool(
  'browser_wait',
  {
    description:
      'Wait for an element to appear on the page, or wait a fixed number of milliseconds. Useful after navigation or actions that trigger page changes.',
    inputSchema: {
      selector: z
        .string()
        .optional()
        .describe('CSS selector to wait for (omit to just wait a fixed time)'),
      timeout: z
        .number()
        .optional()
        .describe('Maximum time to wait in milliseconds (default: 5000)'),
    },
  },
  async ({ selector, timeout }) =>
    safeTool(async () => {
      const page = await getPage();
      const ms = timeout ?? 5000;

      if (selector) {
        await page.waitForSelector(selector, { timeout: ms });
        return { success: true, waited: 'selector', selector };
      } else {
        await page.waitForTimeout(ms);
        return { success: true, waited: 'timeout', ms };
      }
    }),
);

// --- browser_close ---
server.registerTool(
  'browser_close',
  {
    description:
      'Close the browser and free resources. Call this when done with browser automation.',
    inputSchema: {},
  },
  async () =>
    safeTool(async () => {
      await closeBrowser();
      return { success: true, message: 'Browser closed' };
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

// Cleanup on exit
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});
