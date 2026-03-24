import { test as base, expect, Page } from "@playwright/test";

/** Parse compact currency strings back to numbers: "$5.2M" → 5200000, "$89K" → 89000, "$450" → 450 */
export function parseCurrency(text: string): number {
  const cleaned = text.replace(/[+\s]/g, "");
  const negative = cleaned.startsWith("-");
  const abs = cleaned.replace(/^[-$]/g, "").replace(/^\$/g, "");

  let value: number;
  if (abs.endsWith("M")) {
    value = parseFloat(abs.replace("M", "")) * 1_000_000;
  } else if (abs.endsWith("K")) {
    value = parseFloat(abs.replace("K", "")) * 1_000;
  } else {
    value = parseFloat(abs.replace(/,/g, ""));
  }

  return negative ? -value : value;
}

/** Wait for the dashboard to finish loading data */
async function waitForDataLoad(page: Page) {
  // Wait for the refresh button to appear (indicates initial data loaded)
  await page.waitForSelector('button:has-text("refresh")', { timeout: 30000 });
  // Give a moment for all parallel fetches to settle
  await page.waitForTimeout(1000);
}

/** Switch to Pipeline Ledger view */
async function switchToLedger(page: Page) {
  // Click the button that wraps the h2 view toggle to open the dropdown
  const toggle = page.locator("button", { has: page.locator("h2") }).filter({ hasText: /changelog|pipeline ledger/i }).first();
  await toggle.click();
  await page.waitForTimeout(300);
  // Click "Pipeline Ledger" option in the dropdown
  await page.locator("button").filter({ hasText: "Pipeline Ledger" }).first().click();
  await page.waitForTimeout(500);
}

/** Switch back to Changelog view */
async function switchToChangelog(page: Page) {
  const toggle = page.locator("button", { has: page.locator("h2") }).filter({ hasText: /changelog|pipeline ledger/i }).first();
  await toggle.click();
  await page.waitForTimeout(300);
  await page.locator("button").filter({ hasText: "Changelog" }).first().click();
  await page.waitForTimeout(500);
}

/** Set theme by cycling through the theme toggle */
async function setTheme(page: Page, theme: "terminal" | "chromatic" | "light") {
  const themeMap: Record<string, number> = { terminal: 0, chromatic: 1, light: 2 };
  const target = themeMap[theme];

  // Read current theme
  const current = await page.evaluate(() => {
    return document.documentElement.getAttribute("data-theme") || "terminal";
  });
  const currentIdx = themeMap[current] ?? 0;

  // Click the theme button the right number of times
  const clicks = (target - currentIdx + 3) % 3;
  const themeBtn = page.locator('[aria-label="Toggle theme"], button:has(svg)').filter({
    has: page.locator("svg"),
  });

  for (let i = 0; i < clicks; i++) {
    // Find the theme toggle — it's the button with the sun/monitor/terminal icon in the status bar
    const statusBarButtons = page.locator("header button");
    const count = await statusBarButtons.count();
    // Theme toggle is typically the last icon button group
    for (let j = 0; j < count; j++) {
      const btn = statusBarButtons.nth(j);
      const text = await btn.textContent();
      if (!text?.trim()) {
        // Icon-only button — could be theme toggle
        // We'll use a more targeted approach below
      }
    }
    // Simpler: just evaluate the theme directly
    await page.evaluate((t) => {
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("ceo-dashboard-theme", t);
    }, theme);
    break;
  }
}

export const test = base.extend<{
  dashboardPage: Page;
}>({
  dashboardPage: async ({ page }, use) => {
    await page.goto("/");
    await waitForDataLoad(page);
    await use(page);
  },
});

export { expect, waitForDataLoad, switchToLedger, switchToChangelog, setTheme };
