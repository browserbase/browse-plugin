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
export {};
