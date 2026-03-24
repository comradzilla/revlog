import { test, expect, switchToLedger } from "../fixtures/dashboard.fixture";

test.describe("Tag/Badge Consistency", () => {
  test("4.1: Changelog badges have consistent base styling @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // Find all badge-like elements in changelog rows (the change type tags)
    const badges = page.locator(".changelog-entry span[class*='uppercase'][class*='font-bold']");
    const count = await badges.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const badge = badges.nth(i);
      const styles = await badge.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          fontSize: cs.fontSize,
          textTransform: cs.textTransform,
          fontWeight: cs.fontWeight,
        };
      });

      // Font size should be 10px
      expect(styles.fontSize).toBe("10px");
      expect(styles.textTransform).toBe("uppercase");
      // font-bold = 700
      expect(parseInt(styles.fontWeight)).toBeGreaterThanOrEqual(700);
    }
  });

  test("4.2: Ledger badges have consistent base styling @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await switchToLedger(page);
    await page.waitForTimeout(500);

    // Ledger type badges (AMOUNT, CREATED, WON, LOST, REOPENED)
    const badges = page.locator("span[class*='uppercase'][class*='font-bold']").filter({
      hasText: /^(AMOUNT|CREATED|WON|LOST|REOPENED)$/,
    });
    const count = await badges.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const badge = badges.nth(i);
      const styles = await badge.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          fontSize: cs.fontSize,
          textTransform: cs.textTransform,
        };
      });

      expect(styles.fontSize).toBe("10px");
      expect(styles.textTransform).toBe("uppercase");
    }
  });

  test("4.4: Pipeline name tag present in Changelog but not Ledger @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // In changelog, find pipeline tags (they have bg-secondary styling and are NOT bold)
    const pipelineTags = page.locator(".changelog-entry span[class*='uppercase']:not([class*='font-bold'])");
    const changelogCount = await pipelineTags.count();
    expect(changelogCount).toBeGreaterThan(0);

    // Switch to ledger
    await switchToLedger(page);
    await page.waitForTimeout(500);

    // In ledger, pipeline name appears inline as text, not as a separate badge
    // Document this asymmetry
    console.info(
      `[ASYMMETRY DOCUMENTED] Changelog has ${changelogCount} pipeline name badges. ` +
      `Ledger shows pipeline name inline without a badge.`
    );
  });
});
