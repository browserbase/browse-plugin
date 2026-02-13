#!/usr/bin/env node
/**
 * Browser automation CLI -- the core layer.
 *
 * Launches Chrome (or reuses an existing instance on CDP port 9222),
 * runs a single command, prints JSON to stdout, and exits.
 * Chrome stays running between invocations for speed.
 *
 * Commands:
 *   navigate <url>
 *   click <selector>
 *   type <selector> <text>
 *   snapshot
 *   screenshot
 *   scroll <direction> [amount]
 *   evaluate <script>
 *   select <selector> <value>
 *   wait [selector] [timeout]
 *   close
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { findLocalChrome, prepareChromeProfile, takeScreenshot, extractInteractiveElements, } from './browser-utils.js';
// Resolve plugin root directory from script location
// In production (compiled): dist/src/cli.js -> dist/src -> dist -> plugin-root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..', '..');
// Load .env from the plugin root (contains BROWSERBASE_API_KEY, etc.)
dotenv.config({ path: join(PLUGIN_ROOT, '.env') });
const CDP_PORT = 9222;
// ---------- Chrome lifecycle ----------
let chromeProcess = null;
/**
 * Check if Chrome is already running on the CDP port.
 */
async function isChromeRunning() {
    try {
        const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        return response.ok;
    }
    catch {
        return false;
    }
}
/**
 * Get the WebSocket debugger URL from a running Chrome instance.
 */
async function getWsUrl() {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const data = (await response.json());
    return data.webSocketDebuggerUrl;
}
/**
 * Launch Chrome if not already running. Reuse if it is.
 * Returns a Playwright Page connected via CDP.
 */
async function initBrowser() {
    // Check for Browserbase cloud mode
    const bbApiKey = process.env.BROWSERBASE_API_KEY;
    const bbProjectId = process.env.BROWSERBASE_PROJECT_ID;
    if (bbApiKey && bbProjectId) {
        // --- Browserbase cloud mode ---
        console.error('Using Browserbase cloud browser');
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
            throw new Error(`Browserbase session creation failed (${sessionRes.status}): ${errText}`);
        }
        const session = (await sessionRes.json());
        const browser = await chromium.connectOverCDP(session.connectUrl);
        const context = browser.contexts()[0] ?? (await browser.newContext());
        const page = context.pages()[0] ?? (await context.newPage());
        return { browser, context, page };
    }
    // --- Local Chrome mode ---
    const chromePath = findLocalChrome();
    if (!chromePath) {
        throw new Error('Chrome not found. Install Google Chrome or set BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID for cloud mode.');
    }
    const tempUserDataDir = join(PLUGIN_ROOT, '.chrome-profile');
    // Check if Chrome is already running on the CDP port
    let chromeReady = await isChromeRunning();
    if (chromeReady) {
        console.error('Reusing existing Chrome instance on port', CDP_PORT);
    }
    else {
        // Prepare profile on first launch
        prepareChromeProfile(PLUGIN_ROOT);
        // Launch Chrome with CDP enabled
        chromeProcess = spawn(chromePath, [
            `--remote-debugging-port=${CDP_PORT}`,
            `--user-data-dir=${tempUserDataDir}`,
            '--window-size=1280,720',
            '--disable-blink-features=AutomationControlled',
        ], {
            stdio: 'ignore',
            detached: false,
        });
        // Store PID for cleanup
        if (chromeProcess.pid) {
            const pidFilePath = join(PLUGIN_ROOT, '.chrome-pid');
            writeFileSync(pidFilePath, JSON.stringify({ pid: chromeProcess.pid, startTime: Date.now() }));
        }
        // Wait for Chrome to be ready (up to 15 seconds)
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
        console.error('Launched local Chrome on port', CDP_PORT);
    }
    // Connect via CDP
    const wsUrl = await getWsUrl();
    const browser = await chromium.connectOverCDP(wsUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    // Ensure page is ready
    let retries = 0;
    while (retries < 30) {
        try {
            await page.evaluate('document.readyState');
            break;
        }
        catch {
            await new Promise((r) => setTimeout(r, 100));
            retries++;
        }
    }
    // Configure downloads directory
    const downloadsPath = join(PLUGIN_ROOT, 'agent', 'downloads');
    if (!existsSync(downloadsPath)) {
        mkdirSync(downloadsPath, { recursive: true });
    }
    return { browser, context, page };
}
/**
 * Verify a PID belongs to a Chrome process before killing it.
 */
async function verifyIsChromeProcess(pid) {
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        if (process.platform === 'darwin' || process.platform === 'linux') {
            const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
            const processName = stdout.trim().toLowerCase();
            return processName.includes('chrome') || processName.includes('chromium');
        }
        else if (process.platform === 'win32') {
            const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
            return stdout.toLowerCase().includes('chrome');
        }
        return false;
    }
    catch {
        return false;
    }
}
/**
 * Close the browser and kill Chrome if we started it.
 */
async function closeBrowser() {
    const pidFilePath = join(PLUGIN_ROOT, '.chrome-pid');
    // Try graceful CDP shutdown
    try {
        if (await isChromeRunning()) {
            const wsUrl = await getWsUrl();
            const browser = await chromium.connectOverCDP(wsUrl);
            // Close all pages/contexts
            for (const ctx of browser.contexts()) {
                await ctx.close().catch(() => { });
            }
            await browser.close().catch(() => { });
            // Wait briefly for Chrome to close
            await new Promise((r) => setTimeout(r, 2000));
            // If still running, force kill via PID file
            if (await isChromeRunning()) {
                if (existsSync(pidFilePath)) {
                    const pidData = JSON.parse(readFileSync(pidFilePath, 'utf8'));
                    const { pid } = pidData;
                    const isChrome = await verifyIsChromeProcess(pid);
                    if (isChrome) {
                        if (process.platform === 'win32') {
                            const { exec } = await import('child_process');
                            const { promisify } = await import('util');
                            const execAsync = promisify(exec);
                            await execAsync(`taskkill /PID ${pid} /F`);
                        }
                        else {
                            process.kill(pid, 'SIGKILL');
                        }
                    }
                }
            }
        }
    }
    catch {
        // Chrome not running or already closed
    }
    finally {
        // Clean up PID file
        if (existsSync(pidFilePath)) {
            try {
                unlinkSync(pidFilePath);
            }
            catch {
                // Ignore
            }
        }
    }
}
// ---------- CLI Commands ----------
async function cmdNavigate(url) {
    const { page } = await initBrowser();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    const title = await page.title();
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
    return { success: true, title, url: page.url(), screenshot: screenshotPath };
}
async function cmdClick(selector) {
    const { page } = await initBrowser();
    await page.click(selector, { timeout: 10000 });
    await page.waitForTimeout(500);
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
    return { success: true, clicked: selector, screenshot: screenshotPath };
}
async function cmdType(selector, text) {
    const { page } = await initBrowser();
    await page.click(selector, { timeout: 10000 });
    await page.fill(selector, text);
    await page.waitForTimeout(300);
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
    return { success: true, selector, typed: text, screenshot: screenshotPath };
}
async function cmdSnapshot() {
    const { page } = await initBrowser();
    const elements = await extractInteractiveElements(page);
    const title = await page.title();
    const url = page.url();
    return { success: true, title, url, elementCount: elements.length, elements };
}
async function cmdScreenshot() {
    const { page } = await initBrowser();
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
    return { success: true, screenshot: screenshotPath };
}
async function cmdScroll(direction, amount) {
    const { page } = await initBrowser();
    const px = amount ?? 500;
    const deltaX = direction === 'left' ? -px : direction === 'right' ? px : 0;
    const deltaY = direction === 'up' ? -px : direction === 'down' ? px : 0;
    await page.mouse.wheel(deltaX, deltaY);
    await page.waitForTimeout(500);
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
    return { success: true, direction, amount: px, screenshot: screenshotPath };
}
async function cmdEvaluate(script) {
    const { page } = await initBrowser();
    const result = await page.evaluate(script);
    return { success: true, result: result ?? null };
}
async function cmdSelect(selector, value) {
    const { page } = await initBrowser();
    await page.selectOption(selector, value, { timeout: 10000 });
    await page.waitForTimeout(300);
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
    return { success: true, selector, selected: value, screenshot: screenshotPath };
}
async function cmdWait(selector, timeout) {
    const { page } = await initBrowser();
    const ms = timeout ?? 5000;
    if (selector) {
        await page.waitForSelector(selector, { timeout: ms });
        return { success: true, waited: 'selector', selector };
    }
    else {
        await page.waitForTimeout(ms);
        return { success: true, waited: 'timeout', ms };
    }
}
async function cmdClose() {
    await closeBrowser();
    return { success: true, message: 'Browser closed' };
}
// ---------- Main ----------
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    if (!command) {
        console.error('Usage: cli.js <command> [args...]\n' +
            'Commands: navigate, click, type, snapshot, screenshot, scroll, evaluate, select, wait, close');
        process.exit(1);
    }
    try {
        let result;
        switch (command) {
            case 'navigate':
                if (!args[1])
                    throw new Error('Usage: cli.js navigate <url>');
                result = await cmdNavigate(args[1]);
                break;
            case 'click':
                if (!args[1])
                    throw new Error('Usage: cli.js click <selector>');
                result = await cmdClick(args[1]);
                break;
            case 'type':
                if (!args[1] || !args[2])
                    throw new Error('Usage: cli.js type <selector> <text>');
                result = await cmdType(args[1], args[2]);
                break;
            case 'snapshot':
                result = await cmdSnapshot();
                break;
            case 'screenshot':
                result = await cmdScreenshot();
                break;
            case 'scroll': {
                if (!args[1])
                    throw new Error('Usage: cli.js scroll <direction> [amount]');
                const scrollAmount = args[2] ? parseInt(args[2], 10) : undefined;
                result = await cmdScroll(args[1], scrollAmount);
                break;
            }
            case 'evaluate':
                if (!args[1])
                    throw new Error('Usage: cli.js evaluate <script>');
                result = await cmdEvaluate(args[1]);
                break;
            case 'select':
                if (!args[1] || !args[2])
                    throw new Error('Usage: cli.js select <selector> <value>');
                result = await cmdSelect(args[1], args[2]);
                break;
            case 'wait': {
                const waitSelector = args[1] || undefined;
                const waitTimeout = args[2] ? parseInt(args[2], 10) : undefined;
                result = await cmdWait(waitSelector, waitTimeout);
                break;
            }
            case 'close':
                result = await cmdClose();
                break;
            default:
                throw new Error(`Unknown command: ${command}\nAvailable: navigate, click, type, snapshot, screenshot, scroll, evaluate, select, wait, close`);
        }
        // Print JSON result to stdout
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    }
    catch (error) {
        console.log(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }));
        process.exit(1);
    }
}
// Handle cleanup signals
process.on('SIGINT', async () => {
    process.exit(0);
});
process.on('SIGTERM', async () => {
    process.exit(0);
});
main().catch((err) => {
    console.error('CLI fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map