/**
 * In-process Playwright backend for Browserbase cloud mode.
 *
 * Keeps the CDP WebSocket connection alive for the lifetime of the
 * MCP server process. This is critical because Browserbase sessions
 * die as soon as every client disconnects -- so we can't use the
 * browse-cli's per-command `--ws` mode (which opens and closes a
 * connection per invocation).
 *
 * Provides the same tool interface as the browse-cli based backend
 * (refs from the accessibility tree, JSON results).
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { getOrCreateSession, clearCachedSession } from './browserbase.js';

// ---------- Persistent state ----------

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;
let _page: Page | null = null;

/** Map from ref string (e.g. "0-5") to AX node info for element resolution. */
interface RefEntry {
  role: string;
  name: string;
  /** For disambiguation when multiple nodes share role+name. */
  index: number;
}

const _refMap = new Map<string, RefEntry>();

// ---------- Connection management ----------

async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) {
    return _page;
  }

  // Reset stale references
  _browser = null;
  _context = null;
  _page = null;

  const session = await getOrCreateSession();
  console.error(`[bb-browser] Connecting to Browserbase session ${session.id}`);

  _browser = await chromium.connectOverCDP(session.connectUrl);
  _context = _browser.contexts()[0] ?? (await _browser.newContext());
  _page = _context.pages()[0] ?? (await _context.newPage());

  // Wait for page to be ready
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

  return _page;
}

// ---------- Accessibility tree / ref mapping ----------

interface AXNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  focused?: boolean;
  children?: AXNode[];
}

/**
 * Walk the accessibility tree, assign refs, build the ref map,
 * and return a formatted string similar to browse-cli's compact snapshot.
 */
function buildRefTree(root: AXNode): string {
  _refMap.clear();
  const lines: string[] = [];
  /** Track role+name combos for disambiguation. */
  const roleCounts = new Map<string, number>();
  let refIdx = 0;

  function walk(node: AXNode, depth: number) {
    const indent = '  '.repeat(depth);
    const ref = `0-${refIdx}`;
    const roleKey = `${node.role}::${node.name}`;
    const count = roleCounts.get(roleKey) ?? 0;
    roleCounts.set(roleKey, count + 1);

    _refMap.set(ref, { role: node.role, name: node.name, index: count });
    refIdx++;

    // Build display line
    const parts: string[] = [];
    if (isInteractive(node.role)) {
      parts.push(`[${ref}]`);
    }
    parts.push(node.role);
    if (node.name) {
      parts.push(`"${node.name}"`);
    }
    if (node.value) {
      parts.push(`value="${node.value}"`);
    }
    if (node.checked !== undefined) {
      parts.push(`checked=${String(node.checked)}`);
    }
    if (node.disabled) {
      parts.push('disabled');
    }
    if (node.focused) {
      parts.push('focused');
    }

    lines.push(`${indent}${parts.join(' ')}`);

    if (node.children) {
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    }
  }

  walk(root, 0);
  return lines.join('\n');
}

const INTERACTIVE_ROLES = new Set([
  'link',
  'button',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);

function isInteractive(role: string): boolean {
  return INTERACTIVE_ROLES.has(role);
}

/**
 * Resolve a ref (e.g. "@0-5" or "0-5") to a Playwright locator and click/fill/etc.
 */
function resolveRef(ref: string): RefEntry {
  const clean = ref.replace(/^[@]|^ref=/i, '');
  const entry = _refMap.get(clean);
  if (!entry) {
    throw new Error(
      `Unknown ref "${ref}". Run browser_snapshot first to get current refs.`,
    );
  }
  return entry;
}

async function clickByRef(page: Page, ref: string): Promise<void> {
  const entry = resolveRef(ref);
  const locator = page.getByRole(entry.role as Parameters<Page['getByRole']>[0], {
    name: entry.name,
    exact: false,
  });
  const count = await locator.count();
  if (count === 0) {
    throw new Error(`No element found for ref ${ref} (role=${entry.role}, name="${entry.name}")`);
  }
  if (entry.index > 0 && count > entry.index) {
    await locator.nth(entry.index).click({ timeout: 10_000 });
  } else {
    await locator.first().click({ timeout: 10_000 });
  }
}

async function fillByRef(page: Page, ref: string, value: string, pressEnter = true): Promise<void> {
  const entry = resolveRef(ref);
  const locator = page.getByRole(entry.role as Parameters<Page['getByRole']>[0], {
    name: entry.name,
    exact: false,
  });
  const target = entry.index > 0 ? locator.nth(entry.index) : locator.first();
  await target.click({ timeout: 10_000 });
  await target.fill(value);
  if (pressEnter) {
    await page.keyboard.press('Enter');
  }
}

async function selectByRef(page: Page, ref: string, values: string[]): Promise<void> {
  const entry = resolveRef(ref);
  const locator = page.getByRole(entry.role as Parameters<Page['getByRole']>[0], {
    name: entry.name,
    exact: false,
  });
  const target = entry.index > 0 ? locator.nth(entry.index) : locator.first();
  await target.selectOption(values, { timeout: 10_000 });
}

// ---------- CDP AX tree conversion ----------

interface CDPAXNode {
  nodeId: string;
  role: { type: string; value: string };
  name?: { type: string; value: string };
  value?: { type: string; value: string };
  description?: { type: string; value: string };
  properties?: Array<{ name: string; value: { type: string; value: unknown } }>;
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
  ignored?: boolean;
}

/**
 * Convert flat CDP AX node array into a nested AXNode tree.
 * When compact=true, filters to only include nodes with meaningful roles.
 */
function cdpNodesToTree(cdpNodes: CDPAXNode[], compact: boolean): AXNode | null {
  if (cdpNodes.length === 0) return null;

  const SKIP_ROLES = new Set([
    'none',
    'generic',
    'InlineTextBox',
    'LineBreak',
    'StaticText',
  ]);

  // Build a map from nodeId to CDPAXNode
  const nodeMap = new Map<string, CDPAXNode>();
  for (const node of cdpNodes) {
    nodeMap.set(node.nodeId, node);
  }

  // Recursive converter
  function convert(cdpNode: CDPAXNode): AXNode | null {
    if (cdpNode.ignored) return null;

    const role = cdpNode.role?.value ?? 'unknown';
    const name = cdpNode.name?.value ?? '';
    const value = cdpNode.value?.value;

    // Build children
    const children: AXNode[] = [];
    if (cdpNode.childIds) {
      for (const childId of cdpNode.childIds) {
        const childCdp = nodeMap.get(childId);
        if (childCdp) {
          const childNode = convert(childCdp);
          if (childNode) children.push(childNode);
        }
      }
    }

    // In compact mode, skip non-meaningful nodes but keep their children
    if (compact && SKIP_ROLES.has(role) && !name) {
      if (children.length === 1) return children[0];
      if (children.length === 0) return null;
      // Flatten: return a generic container with the children
      return { role: 'group', name: '', children };
    }

    // Extract properties
    let checked: boolean | 'mixed' | undefined;
    let disabled: boolean | undefined;
    let focused: boolean | undefined;

    if (cdpNode.properties) {
      for (const prop of cdpNode.properties) {
        switch (prop.name) {
          case 'checked':
            checked = prop.value.value === 'mixed' ? 'mixed' : Boolean(prop.value.value);
            break;
          case 'disabled':
            disabled = Boolean(prop.value.value);
            break;
          case 'focused':
            focused = Boolean(prop.value.value);
            break;
        }
      }
    }

    const node: AXNode = { role, name };
    if (value) node.value = value;
    if (checked !== undefined) node.checked = checked;
    if (disabled) node.disabled = disabled;
    if (focused) node.focused = focused;
    if (children.length > 0) node.children = children;

    return node;
  }

  return convert(cdpNodes[0]);
}

// ---------- Tool implementations ----------

export async function bbNavigate(url: string): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1000);
  const title = await page.title();
  return { title, url: page.url() };
}

export async function bbClick(ref: string): Promise<Record<string, unknown>> {
  const page = await getPage();
  await clickByRef(page, ref);
  await page.waitForTimeout(500);
  return { clicked: ref };
}

export async function bbClickXY(x: number, y: number): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  return { clicked: { x, y } };
}

export async function bbType(text: string, delay?: number): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.keyboard.type(text, delay ? { delay } : undefined);
  return { typed: text };
}

export async function bbFill(
  ref: string,
  value: string,
  pressEnter = true,
): Promise<Record<string, unknown>> {
  const page = await getPage();
  await fillByRef(page, ref, value, pressEnter);
  return { filled: ref, value };
}

export async function bbPress(key: string): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.keyboard.press(key);
  return { pressed: key };
}

export async function bbSelect(ref: string, values: string[]): Promise<Record<string, unknown>> {
  const page = await getPage();
  await selectByRef(page, ref, values);
  return { selected: ref, values };
}

export async function bbSnapshot(compact = true): Promise<Record<string, unknown>> {
  const page = await getPage();

  // Use CDP to get the full accessibility tree (page.accessibility was removed)
  const cdp = await page.context().newCDPSession(page);
  try {
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: CDPAXNode[];
    };
    const tree = cdpNodesToTree(nodes, compact);
    if (!tree) {
      return { snapshot: '(empty page)' };
    }
    const formatted = buildRefTree(tree);
    return { snapshot: formatted };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

export async function bbScreenshot(path?: string, fullPage?: boolean): Promise<Record<string, unknown>> {
  const page = await getPage();
  const opts: { path?: string; fullPage?: boolean; type: 'png' } = { type: 'png' };
  if (path) opts.path = path;
  if (fullPage) opts.fullPage = true;
  const buffer = await page.screenshot(opts);

  if (!path) {
    // Save to temp location
    const { mkdirSync, writeFileSync, existsSync } = await import('fs');
    const { join, resolve, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pluginRoot = resolve(__dirname, '..', '..');
    const screenshotDir = join(pluginRoot, 'agent', 'browser_screenshots');
    if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    path = join(screenshotDir, `screenshot-${ts}.png`);
    writeFileSync(path, buffer);
  }

  return { screenshot: path };
}

export async function bbScroll(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.mouse.move(x, y);
  await page.mouse.wheel(deltaX, deltaY);
  await page.waitForTimeout(300);
  return { scrolled: { x, y, deltaX, deltaY } };
}

export async function bbHover(x: number, y: number): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.mouse.move(x, y);
  return { hovered: { x, y } };
}

export async function bbDrag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 10 });
  await page.mouse.up();
  return { dragged: { fromX, fromY, toX, toY } };
}

export async function bbEvaluate(script: string): Promise<Record<string, unknown>> {
  const page = await getPage();
  const result = await page.evaluate(script);
  return { result: result ?? null };
}

export async function bbGet(what: string, selector?: string): Promise<Record<string, unknown>> {
  const page = await getPage();
  switch (what) {
    case 'url':
      return { url: page.url() };
    case 'title':
      return { title: await page.title() };
    case 'text': {
      if (!selector) throw new Error('CSS selector required for "text"');
      const text = await page.locator(selector).innerText({ timeout: 10_000 });
      return { text };
    }
    case 'html': {
      if (!selector) throw new Error('CSS selector required for "html"');
      const html = await page.locator(selector).innerHTML({ timeout: 10_000 });
      return { html };
    }
    case 'value': {
      if (!selector) throw new Error('CSS selector required for "value"');
      const value = await page.locator(selector).inputValue({ timeout: 10_000 });
      return { value };
    }
    case 'box': {
      if (!selector) throw new Error('CSS selector required for "box"');
      const box = await page.locator(selector).boundingBox({ timeout: 10_000 });
      return { box };
    }
    default:
      throw new Error(`Unknown "what": ${what}. Use: url, title, text, html, value, box`);
  }
}

export async function bbWait(
  type: string,
  value?: string,
  timeout?: number,
): Promise<Record<string, unknown>> {
  const page = await getPage();
  switch (type) {
    case 'load':
      await page.waitForLoadState(
        (value as 'load' | 'domcontentloaded' | 'networkidle') ?? 'load',
        { timeout: timeout ?? 30_000 },
      );
      return { waited: 'load', state: value ?? 'load' };
    case 'selector':
      if (!value) throw new Error('CSS selector required for wait type "selector"');
      await page.waitForSelector(value, { timeout: timeout ?? 30_000 });
      return { waited: 'selector', selector: value };
    case 'timeout': {
      const ms = value ? parseInt(value, 10) : timeout ?? 5000;
      await page.waitForTimeout(ms);
      return { waited: 'timeout', ms };
    }
    default:
      throw new Error(`Unknown wait type: ${type}. Use: load, selector, timeout`);
  }
}

export async function bbBack(): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.goBack({ waitUntil: 'domcontentloaded' });
  return { url: page.url() };
}

export async function bbForward(): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.goForward({ waitUntil: 'domcontentloaded' });
  return { url: page.url() };
}

export async function bbReload(): Promise<Record<string, unknown>> {
  const page = await getPage();
  await page.reload({ waitUntil: 'domcontentloaded' });
  return { url: page.url() };
}

export async function bbPages(): Promise<Record<string, unknown>> {
  const page = await getPage();
  const context = page.context();
  const pages = context.pages().map((p, i) => ({
    index: i,
    url: p.url(),
    title: '',
  }));
  // Fill titles
  for (const entry of pages) {
    try {
      entry.title = await context.pages()[entry.index].title();
    } catch {
      // ignore
    }
  }
  return { pages };
}

export async function bbNewTab(url?: string): Promise<Record<string, unknown>> {
  const page = await getPage();
  const newPage = await page.context().newPage();
  if (url) {
    await newPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  _page = newPage;
  return { url: newPage.url() };
}

export async function bbSwitchTab(index: number): Promise<Record<string, unknown>> {
  const page = await getPage();
  const pages = page.context().pages();
  if (index < 0 || index >= pages.length) {
    throw new Error(`Tab index ${index} out of range (0-${pages.length - 1})`);
  }
  _page = pages[index];
  return { switched: index, url: _page.url() };
}

export async function bbCloseTab(index?: number): Promise<Record<string, unknown>> {
  const page = await getPage();
  const pages = page.context().pages();
  const target = index !== undefined ? index : pages.length - 1;
  if (target < 0 || target >= pages.length) {
    throw new Error(`Tab index ${target} out of range (0-${pages.length - 1})`);
  }
  const closing = pages[target];
  await closing.close();
  // Switch to the last remaining page
  const remaining = page.context().pages();
  if (remaining.length > 0) {
    _page = remaining[remaining.length - 1];
  }
  return { closed: target };
}

export async function bbClose(): Promise<Record<string, unknown>> {
  try {
    if (_context) await _context.close().catch(() => {});
    if (_browser) await _browser.close().catch(() => {});
  } catch {
    // already closed
  }
  _page = null;
  _context = null;
  _browser = null;
  clearCachedSession();
  return { message: 'Browser closed' };
}
