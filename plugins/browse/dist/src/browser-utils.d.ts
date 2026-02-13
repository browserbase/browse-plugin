import type { Page } from 'playwright-core';
/**
 * Finds the local Chrome installation path based on the operating system.
 */
export declare function findLocalChrome(): string | undefined;
/**
 * Gets the Chrome user data directory path based on the operating system.
 */
export declare function getChromeUserDataDir(): string | undefined;
/**
 * Prepares the Chrome profile by copying the user's Default profile to a
 * local .chrome-profile directory. This preserves cookies and sessions.
 * Only runs once (skips if the directory already exists).
 */
export declare function prepareChromeProfile(pluginRoot: string): string;
/**
 * Takes a screenshot of the current page, resizes if necessary, and saves
 * to the agent/browser_screenshots directory.
 *
 * Returns the absolute path to the saved screenshot.
 */
export declare function takeScreenshot(page: Page, pluginRoot: string): Promise<string>;
/**
 * Extracts interactive elements from the page with their CSS selectors,
 * roles, text content, and state. This is the primary way the model
 * "reads" a page to decide what to click/type.
 */
export declare function extractInteractiveElements(page: Page): Promise<InteractiveElement[]>;
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
