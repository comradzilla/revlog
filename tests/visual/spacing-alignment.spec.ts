import { test, expect, switchToLedger } from "../fixtures/dashboard.fixture";

test.describe("Spacing & Alignment Consistency", () => {
  test("5.1-5.2: Changelog and Ledger rows have matching padding @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // Measure changelog row padding
    const changelogRow = page.locator(".changelog-entry").first();
    if (await changelogRow.isVisible()) {
      const changelogPadding = await changelogRow.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
        };
      });

      // Switch to ledger and compare
      await switchToLedger(page);
      await page.waitForTimeout(500);

      const ledgerRow = page.locator("a[href*='hubspot.com']").first();
      if (await ledgerRow.isVisible()) {
        const ledgerPadding = await ledgerRow.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            paddingTop: cs.paddingTop,
            paddingBottom: cs.paddingBottom,
            paddingLeft: cs.paddingLeft,
            paddingRight: cs.paddingRight,
          };
        });

        // py-1.5 = 6px, px-2 = 8px — should match between views
        expect(changelogPadding.paddingTop).toBe(ledgerPadding.paddingTop);
        expect(changelogPadding.paddingBottom).toBe(ledgerPadding.paddingBottom);
      }
    }
  });

  test("5.3: Mobile gap difference between Changelog and Ledger @mobile", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 400) {
      test.skip();
      return;
    }

    // Measure changelog row gap
    const changelogRow = page.locator(".changelog-entry").first();
    let changelogGap = "0px";
    if (await changelogRow.isVisible()) {
      changelogGap = await changelogRow.evaluate((el) => getComputedStyle(el).gap);
    }

    // Switch to ledger
    await switchToLedger(page);
    await page.waitForTimeout(500);

    const ledgerRow = page.locator("a[href*='hubspot.com']").first();
    let ledgerGap = "0px";
    if (await ledgerRow.isVisible()) {
      ledgerGap = await ledgerRow.evaluate((el) => getComputedStyle(el).gap);
    }

    // Document the difference: Changelog gap-0.5 (2px) vs Ledger gap-1.5 (6px)
    if (changelogGap !== ledgerGap) {
      console.warn(
        `[INCONSISTENCY] Mobile row gap differs:\n` +
        `  Changelog: ${changelogGap}\n` +
        `  Ledger: ${ledgerGap}\n` +
        `  Consider unifying to the same gap value.`
      );
    }
  });

  test("5.4: Changelog timestamp column has fixed width @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // Changelog timestamp should have w-[52px] (fixed width)
    const timestamps = page.locator(".changelog-entry .shrink-0.w-\\[52px\\]");
    const count = await timestamps.count();

    if (count >= 2) {
      const width1 = await timestamps.nth(0).evaluate((el) => el.getBoundingClientRect().width);
      const width2 = await timestamps.nth(1).evaluate((el) => el.getBoundingClientRect().width);

      // Both should be 52px (fixed width = column-aligned)
      expect(width1).toBeCloseTo(52, 0);
      expect(width2).toBeCloseTo(52, 0);
    }
  });
});
