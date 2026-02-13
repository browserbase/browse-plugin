#!/usr/bin/env node

/**
 * Thin CLI wrapper around @browserbasehq/browse-cli.
 *
 * - If BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID are set, creates a
 *   Browserbase cloud session and injects `--ws <connectUrl>` so the
 *   browse daemon connects to the remote browser.
 * - Otherwise, forwards all arguments directly to `browse` which manages
 *   a local Chrome instance via its daemon.
 *
 * Usage:
 *   browser open https://example.com
 *   browser snapshot -c
 *   browser click @0-5
 *   browser stop
 */

import { spawn } from 'child_process';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { isBrowserbaseMode, getOrCreateSession, clearCachedSession } from './browserbase.js';

// Resolve plugin root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

// Load .env from the plugin root
dotenv.config({ path: join(PLUGIN_ROOT, '.env') });

/**
 * Resolve the path to the browse binary from node_modules.
 */
function getBrowseBin(): string {
  return join(PLUGIN_ROOT, 'node_modules', '.bin', 'browse');
}

async function main() {
  const userArgs = process.argv.slice(2);
  const browseBin = getBrowseBin();

  // Build the argument list
  const args: string[] = [];

  // If Browserbase cloud mode, create a session and inject --ws
  if (isBrowserbaseMode()) {
    try {
      const session = await getOrCreateSession();
      console.error(`[browser] Using Browserbase cloud session ${session.id}`);
      args.push('--ws', session.connectUrl);
    } catch (err) {
      console.error(
        `[browser] Failed to create Browserbase session: ${err instanceof Error ? err.message : err}`,
      );
      process.exit(1);
    }
  }

  // Append the user's arguments
  args.push(...userArgs);

  // Check if this is a stop command -- clear cached session after
  const isStop = userArgs[0] === 'stop';

  // Spawn browse with inherited stdio so output flows through
  const child = spawn(browseBin, args, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error(`[browser] Failed to run browse: ${err.message}`);
    console.error(`[browser] Make sure @browserbasehq/browse-cli is installed (npm install)`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (isStop) {
      clearCachedSession();
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[browser] Fatal error:', err);
  process.exit(1);
});
