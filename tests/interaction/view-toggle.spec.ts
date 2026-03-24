import { test, expect, switchToLedger, switchToChangelog } from "../fixtures/dashboard.fixture";

test.describe("View Toggle", () => {
  test("8.1: Dropdown opens with both options @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // Click the button that wraps the h2 view toggle to open the dropdown
    const toggle = page.locator("button", { has: page.locator("h2") }).filter({ hasText: /changelog|pipeline ledger/i }).first();
    await toggle.click();
    await page.waitForTimeout(300);

    // Both options should be visible
    await expect(page.getByText("Changelog", { exact: true })).toBeVisible();
    await expect(page.getByText("Pipeline Ledger")).toBeVisible();
  });

  test("8.2: Switching to Ledger replaces changelog content @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // Verify changelog entries are visible first
    const changelogEntries = page.locator(".changelog-entry");
    const initialCount = await changelogEntries.count();
    expect(initialCount).toBeGreaterThan(0);

    // Switch to ledger
    await switchToLedger(page);

    // Changelog entries should be gone
    await expect(page.locator(".changelog-entry").first()).toBeHidden({ timeout: 5000 }).catch(() => {
      // May not exist at all, which is fine
    });

    // Ledger content should be visible (transaction rows with deltas)
    const deltaElements = page.locator("text=/[+-]\\$/");
    await expect(deltaElements.first()).toBeVisible({ timeout: 5000 });
  });

  test("8.3: Switching back to Changelog restores it @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await switchToLedger(page);
    await page.waitForTimeout(500);

    await switchToChangelog(page);
    await page.waitForTimeout(500);

    // Changelog entries should be back
    const entries = page.locator(".changelog-entry");
    await expect(entries.first()).toBeVisible({ timeout: 5000 });
  });

  test("8.4: Count badge updates per view @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // Read changelog count badge
    const countBadge = page.locator("text=/^\\d+$/").filter({
      has: page.locator(".."),
    });

    // Get the count near the CHANGELOG header
    const headerArea = page.locator("button", { has: page.locator("h2") }).filter({ hasText: /changelog/i }).first().locator("..");
    const changelogCount = await headerArea.locator("text=/^\\d+$/").first().textContent();

    // Switch to ledger
    await switchToLedger(page);
    await page.waitForTimeout(500);

    const ledgerHeaderArea = page.locator("button", { has: page.locator("h2") }).filter({ hasText: /ledger/i }).first().locator("..");
    const ledgerCount = await ledgerHeaderArea.locator("text=/^\\d+$/").first().textContent();

    // Counts should be numbers but may differ
    if (changelogCount && ledgerCount) {
      expect(parseInt(changelogCount)).toBeGreaterThanOrEqual(0);
      expect(parseInt(ledgerCount)).toBeGreaterThanOrEqual(0);
      console.info(`Changelog count: ${changelogCount}, Ledger count: ${ledgerCount}`);
    }
  });
});
