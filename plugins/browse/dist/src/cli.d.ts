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
export {};
