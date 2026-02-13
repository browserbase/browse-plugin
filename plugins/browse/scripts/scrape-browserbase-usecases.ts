#!/usr/bin/env npx tsx

/**
 * Scrapes all use cases from browserbase.com.
 *
 * Usage:
 *   npx tsx scripts/scrape-browserbase-usecases.ts
 *
 * Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in .env for cloud mode,
 * otherwise falls back to local Chrome.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..');

dotenv.config({ path: join(PLUGIN_ROOT, '.env') });

// ── helpers ──────────────────────────────────────────────────────────

function log(msg: string) {
  console.error(`[scrape] ${msg}`);
}

async function connectBrowser(): Promise<{ browser: Browser; page: Page }> {
  const bbApiKey = process.env.BROWSERBASE_API_KEY;
  const bbProjectId = process.env.BROWSERBASE_PROJECT_ID;

  if (bbApiKey && bbProjectId) {
    log('Creating Browserbase session…');
    const res = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bb-api-key': bbApiKey },
      body: JSON.stringify({ projectId: bbProjectId }),
    });
    if (!res.ok) throw new Error(`Browserbase error (${res.status}): ${await res.text()}`);
    const session = (await res.json()) as { id: string; connectUrl: string };
    log(`Connected to session ${session.id}`);

    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    return { browser, page };
  }

  // Local fallback – try CDP first, then launch
  log('Using local Chrome…');
  let wsUrl: string | undefined;
  try {
    const r = await fetch('http://127.0.0.1:9222/json/version');
    wsUrl = ((await r.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
  } catch { /* not running */ }

  if (!wsUrl) {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
    ];
    const chromePath = paths.find((p) => existsSync(p));
    if (!chromePath) throw new Error('Chrome not found and no Browserbase credentials set.');
    const browser = await chromium.launch({ executablePath: chromePath, headless: false });
    const page = await browser.newPage();
    return { browser, page };
  }

  const browser = await chromium.connectOverCDP(wsUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  return { browser, page };
}

// ── scraping logic ───────────────────────────────────────────────────

interface UseCaseTab {
  name: string;
  bullets: string[];
  caseStudies: { title: string; href: string }[];
}

interface UseCasePage {
  name: string;
  url: string;
  headline: string;
  subtitle: string;
  problem: string;
  solution: string;
  features: string[];
  beforeAfter?: { before: string[]; after: string[] };
  stats?: string[];
}

async function scrapeHomepageTabs(page: Page): Promise<UseCaseTab[]> {
  log('Scraping homepage use-case tabs…');
  await page.goto('https://www.browserbase.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const tabNames: string[] = await page.evaluate(
    `Array.from(document.querySelectorAll('.UseCases_tab__pArYf button')).map(function(b){ return b.textContent.trim() })`,
  );

  const results: UseCaseTab[] = [];

  for (let i = 0; i < tabNames.length; i++) {
    // Click the tab
    await page.evaluate(`document.querySelectorAll('.UseCases_tab__pArYf button')[${i}].click()`);
    await page.waitForTimeout(800);

    const data = await page.evaluate(`(() => {
      var items = document.querySelectorAll('.UseCases_item__Nnse8');
      var links = document.querySelectorAll('.UseCases_link__wY_VS a');
      return {
        bullets: Array.from(items).map(function(el){ return el.textContent.trim() }),
        caseStudies: Array.from(links).map(function(a){ return { title: a.textContent.trim(), href: a.href } })
      };
    })()`
    ) as { bullets: string[]; caseStudies: { title: string; href: string }[] };

    results.push({ name: tabNames[i], ...data });
    log(`  ✓ ${tabNames[i]} (${data.bullets.length} bullets, ${data.caseStudies.length} case studies)`);
  }

  return results;
}

async function scrapeUseCasePage(page: Page, url: string): Promise<UseCasePage> {
  log(`Scraping ${url}…`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Use a string-based evaluate to avoid tsx/esbuild injecting __name into browser context
  const data = await page.evaluate(`(() => {
    var mainText = (document.querySelector('main') || document.body).innerText || '';

    // headline — use innerText of the first h1 child to avoid SSR duplication
    var h1 = document.querySelector('h1');
    var headline = '';
    if (h1) {
      var firstChild = h1.querySelector('span, div, p');
      headline = firstChild ? firstChild.innerText.trim() : h1.innerText.trim();
      // If still duplicated, take the shorter unique prefix
      var lines = headline.split('\\n').filter(Boolean);
      if (lines.length >= 2) headline = lines.slice(0, Math.ceil(lines.length / 2)).join(' ');
    }

    // subtitle
    var subEl = document.querySelector('[class*="hero"] p') || document.querySelector('[class*="Hero"] p');
    var subtitle = subEl ? subEl.textContent.trim() : '';

    // problem / solution
    var sections = mainText.split('\\n').filter(Boolean);
    var problem = '';
    var solution = '';
    var inProblem = false;
    var inSolution = false;

    for (var i = 0; i < sections.length; i++) {
      var line = sections[i];
      if (/the problem/i.test(line)) { inProblem = true; inSolution = false; continue; }
      if (/the solution|how browserbase/i.test(line)) { inSolution = true; inProblem = false; continue; }
      if (/proof|real impact|before|what will you build/i.test(line)) { inProblem = false; inSolution = false; continue; }
      if (inProblem) problem += (problem ? ' ' : '') + line;
      if (inSolution) solution += (solution ? ' ' : '') + line;
    }

    // features
    var features = [];
    var bullets = mainText.match(/Before/);
    var featureSection = mainText.split(/Before|What will you build/)[0] || '';
    var featureLines = featureSection.split('\\n').filter(Boolean);
    var captureFeat = false;
    for (var j = 0; j < featureLines.length; j++) {
      var fl = featureLines[j].trim();
      if (/your .* feature set|why browserbase/i.test(fl)) { captureFeat = true; continue; }
      if (captureFeat && fl.length > 0) features.push(fl);
    }

    // before / after — interleaved pairs (Before line, After line, Before line, After line…)
    var beforeItems = [];
    var afterItems = [];
    var baMatch = mainText.match(/Before\\n([\\s\\S]*?)(?:\\n\\n|What will)/);
    if (baMatch) {
      var baLines = baMatch[1].split('\\n').map(function(s){return s.trim()}).filter(function(s){return s && s !== 'After'});
      for (var bi = 0; bi < baLines.length; bi += 2) {
        if (baLines[bi]) beforeItems.push(baLines[bi]);
        if (baLines[bi+1]) afterItems.push(baLines[bi+1]);
      }
    }

    return {
      headline: headline,
      subtitle: subtitle,
      problem: problem,
      solution: solution,
      features: features,
      beforeAfter: { before: beforeItems, after: afterItems }
    };
  })()`);

  const name = url.split('/').pop() ?? '';
  return { name, url, ...(data as Omit<UseCasePage, 'name' | 'url'>) };
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const { browser, page } = await connectBrowser();

  try {
    // 1. Scrape the homepage tabs
    const tabs = await scrapeHomepageTabs(page);

    // 2. Scrape each dedicated use-case page
    const useCaseUrls = [
      'https://www.browserbase.com/use-case/agents',
      'https://www.browserbase.com/use-case/workflow-automation',
      'https://www.browserbase.com/use-case/web-scraping',
    ];

    const pages: UseCasePage[] = [];
    for (const url of useCaseUrls) {
      pages.push(await scrapeUseCasePage(page, url));
    }

    // 3. Output
    const output = { scrapedAt: new Date().toISOString(), homepageTabs: tabs, useCasePages: pages };
    console.log(JSON.stringify(output, null, 2));

    log('Done!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
