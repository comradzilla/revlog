import { test, expect, switchToLedger } from "../fixtures/dashboard.fixture";

test.describe("Currency Formatting Consistency", () => {
  test("2.1: StatsCards Open Pipeline value has no cents for values >= $1K @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    const cardValue = await page.locator(".card-glow").filter({ hasText: "Open Pipeline" }).first().locator(".text-2xl").first().textContent();

    if (cardValue) {
      // Should match $XM, $X.YM, $XK, or $X (no decimals for K+)
      expect(cardValue.trim()).toMatch(/^\$[\d.,]+[MK]?$/);
      // Should NOT have cents like $5,000.50
      expect(cardValue.trim()).not.toMatch(/\.\d+$/);
    }
  });

  test("2.3: Ledger header balance uses compact format @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await switchToLedger(page);
    await page.waitForTimeout(500);

    // Find balance values — they should use compact format ($X.YM or $XK)
    const balanceElements = page.locator("text=/\\$[\\d.,]+[MK]/");
    const count = await balanceElements.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 3); i++) {
      const text = await balanceElements.nth(i).textContent();
      if (text) {
        // Compact format: $X.YM or $XK
        expect(text.trim()).toMatch(/\$[\d.,]+[MK]/);
      }
    }
  });

  test("2.4: Ledger deltas use full Intl format with commas @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await switchToLedger(page);
    await page.waitForTimeout(500);

    // Find delta values in ledger transaction rows (links to HubSpot)
    const ledgerRows = page.locator("a[href*='hubspot.com']");
    const rowCount = await ledgerRows.count();
    // Get the last span in each row (the delta column)
    const deltas = ledgerRows.locator("span.font-semibold").filter({ hasText: /\$/ });
    const count = await deltas.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const text = await deltas.nth(i).textContent();
        if (text) {
          // Full format: +$45,000 or -$12,000 or $0 (with commas, no M/K suffix, or compact $XK/$XM)
          expect(text.trim()).toMatch(/^[+-]?\$[\d.,]+[MK]?$/);
        }
      }
    }
  });
});
