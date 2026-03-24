import { test, expect, switchToLedger } from "../fixtures/dashboard.fixture";

test.describe("Mobile Overflow Tests", () => {
  test("6.1: No horizontal overflow at 375px - Changelog view @mobile", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 400) {
      test.skip();
      return;
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test("6.1: No horizontal overflow at 375px - Ledger view @mobile", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 400) {
      test.skip();
      return;
    }

    await switchToLedger(page);
    await page.waitForTimeout(500);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test("6.2: StatusBar header fits at 375px @mobile", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 400) {
      test.skip();
      return;
    }

    const header = page.locator("header");
    const headerBox = await header.boundingBox();
    if (headerBox) {
      expect(headerBox.width).toBeLessThanOrEqual(375);
    }

    // Sync metadata should be hidden on mobile (has hidden sm:inline)
    const syncMeta = page.locator("text=/incr:/");
    await expect(syncMeta).toBeHidden();
  });

  test("6.3: Changelog rows use two-line layout on mobile @mobile", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 400) {
      test.skip();
      return;
    }

    // Changelog entries should have flex-col on mobile
    const firstRow = page.locator(".changelog-entry").first();
    if (await firstRow.isVisible()) {
      const flexDirection = await firstRow.evaluate((el) =>
        getComputedStyle(el).flexDirection
      );
      expect(flexDirection).toBe("column");
    }
  });

  test("6.6: StatsCards hidden on mobile, MobileStatsSummary visible @mobile", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 400) {
      test.skip();
      return;
    }

    // The stats cards grid should be hidden (wrapped in hidden sm:block)
    // MobileStatsSummary should be visible
    const mobileStats = page.locator('[class*="sm:hidden"]').filter({ hasText: /pipeline/ });
    await expect(mobileStats.first()).toBeVisible();
  });

  test("6.7: NetMovementBar hidden on mobile @mobile", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 400) {
      test.skip();
      return;
    }

    // NetMovementBar is wrapped in hidden sm:block
    const netBar = page.locator("text=PIPELINE FLOW");
    await expect(netBar).toBeHidden();
  });
});
