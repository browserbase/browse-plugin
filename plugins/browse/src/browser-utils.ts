import { existsSync, cpSync, mkdirSync, writeFileSync } from 'fs';
import { platform } from 'os';
import { join } from 'path';
import type { Page } from 'playwright-core';

/**
 * Finds the local Chrome installation path based on the operating system.
 */
export function findLocalChrome(): string | undefined {
  const systemPlatform = platform();
  const chromePaths: string[] = [];

  if (systemPlatform === 'darwin') {
    chromePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      `${process.env.HOME}/Applications/Chromium.app/Contents/MacOS/Chromium`,
    );
  } else if (systemPlatform === 'win32') {
    chromePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
    );
  } else {
    chromePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/local/bin/google-chrome',
      '/usr/local/bin/chromium',
      '/opt/google/chrome/chrome',
      '/opt/google/chrome/google-chrome',
    );
  }

  for (const p of chromePaths) {
    if (p && existsSync(p)) {
      return p;
    }
  }

  return undefined;
}

/**
 * Gets the Chrome user data directory path based on the operating system.
 */
export function getChromeUserDataDir(): string | undefined {
  const systemPlatform = platform();

  if (systemPlatform === 'darwin') {
    return `${process.env.HOME}/Library/Application Support/Google/Chrome`;
  } else if (systemPlatform === 'win32') {
    return `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
  } else {
    return `${process.env.HOME}/.config/google-chrome`;
  }
}

/**
 * Prepares the Chrome profile by copying the user's Default profile to a
 * local .chrome-profile directory. This preserves cookies and sessions.
 * Only runs once (skips if the directory already exists).
 */
export function prepareChromeProfile(pluginRoot: string): string {
  const sourceUserDataDir = getChromeUserDataDir();
  const tempUserDataDir = join(pluginRoot, '.chrome-profile');

  if (!existsSync(tempUserDataDir)) {
    mkdirSync(tempUserDataDir, { recursive: true });

    if (sourceUserDataDir) {
      const sourceDefaultProfile = join(sourceUserDataDir, 'Default');
      const destDefaultProfile = join(tempUserDataDir, 'Default');

      if (existsSync(sourceDefaultProfile)) {
        try {
          cpSync(sourceDefaultProfile, destDefaultProfile, { recursive: true });
        } catch {
          // Profile copy failed -- continue with a fresh profile
        }
      }
    }
  }

  return tempUserDataDir;
}

/**
 * Takes a screenshot of the current page, resizes if necessary, and saves
 * to the agent/browser_screenshots directory.
 *
 * Returns the absolute path to the saved screenshot.
 */
export async function takeScreenshot(
  page: Page,
  pluginRoot: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = join(pluginRoot, 'agent', 'browser_screenshots');
  const screenshotPath = join(screenshotDir, `screenshot-${timestamp}.png`);

  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  const rawBuffer = await page.screenshot({ type: 'png' });

  // Resize if larger than 2000x2000
  const sharp = (await import('sharp')).default;
  const image = sharp(rawBuffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  let finalBuffer: Buffer = rawBuffer;

  if (width && height && (width > 2000 || height > 2000)) {
    finalBuffer = await sharp(rawBuffer)
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  }

  writeFileSync(screenshotPath, finalBuffer);
  return screenshotPath;
}

/**
 * Extracts interactive elements from the page with their CSS selectors,
 * roles, text content, and state. This is the primary way the model
 * "reads" a page to decide what to click/type.
 */
export async function extractInteractiveElements(page: Page): Promise<InteractiveElement[]> {
  return page.evaluate(() => {
    const selectors = [
      'a', 'button', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="tab"]',
      '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]',
      '[role="switch"]', '[role="combobox"]',
      '[onclick]', '[tabindex]:not([tabindex="-1"])',
    ];
    const query = selectors.join(', ');
    const els = document.querySelectorAll(query);
    const seen = new Set<Element>();

    return Array.from(els)
      .filter((el) => {
        if (seen.has(el)) return false;
        seen.add(el);
        // Skip hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        return true;
      })
      .map((el, i) => {
        const tag = el.tagName.toLowerCase();
        const id = el.id || '';
        const classes = el.className && typeof el.className === 'string'
          ? el.className.trim() : '';
        const text = (el.textContent || '').trim().slice(0, 100);
        const type = el.getAttribute('type') || '';
        const role = el.getAttribute('role') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const href = el.getAttribute('href') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const name = el.getAttribute('name') || '';
        const value = (el as HTMLInputElement).value || '';
        const disabled = (el as HTMLButtonElement).disabled || false;
        const checked = (el as HTMLInputElement).checked || false;

        // Build the best CSS selector for this element
        let selector: string;
        if (id) {
          selector = `#${CSS.escape(id)}`;
        } else if (name && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
          selector = `${tag}[name="${name}"]`;
        } else if (ariaLabel) {
          selector = `${tag}[aria-label="${ariaLabel}"]`;
        } else if (el.getAttribute('data-testid')) {
          selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
        } else if (classes) {
          const uniqueClass = classes.split(/\s+/)[0];
          selector = `${tag}.${CSS.escape(uniqueClass)}`;
        } else {
          selector = `${tag}:nth-of-type(${i + 1})`;
        }

        return {
          index: i,
          tag,
          selector,
          id,
          text,
          type,
          role,
          ariaLabel,
          href,
          placeholder,
          name,
          value: tag === 'input' || tag === 'textarea' ? value : '',
          disabled,
          checked,
        };
      });
  });
}

export interface InteractiveElement {
  index: number;
  tag: string;
  selector: string;
  id: string;
  text: string;
  type: string;
  role: string;
  ariaLabel: string;
  href: string;
  placeholder: string;
  name: string;
  value: string;
  disabled: boolean;
  checked: boolean;
}
