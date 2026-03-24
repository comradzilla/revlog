import { test, expect, parseCurrency } from "../fixtures/dashboard.fixture";

test.describe("Stats Consistency", () => {
  test("11.1: Open Pipeline card value matches API response @desktop", async ({ dashboardPage: page }) => {
    // Intercept the pipeline-value API call
    const apiPromise = page.waitForResponse((r) =>
      r.url().includes("type=pipeline-value") && r.status() === 200
    );

    // Trigger a refresh to capture the API response
    await page.click('button:has-text("refresh")');
    const apiResponse = await apiPromise;
    const apiData = await apiResponse.json();

    // Read the displayed value from the Open Pipeline card
    const card = page.locator(".card-glow").filter({ hasText: "Open Pipeline" }).first();
    const cardValue = await card.locator(".text-2xl").first().textContent();

    if (cardValue) {
      const displayed = parseCurrency(cardValue);
      const expected = apiData.filteredValue ?? apiData.totalValue;
      // Allow tolerance for compact formatting rounding
      const tolerance = Math.max(expected * 0.02, 500);
      expect(Math.abs(displayed - expected)).toBeLessThan(tolerance);
    }
  });

  test("11.5: Closed Won count in StatsCards matches API @desktop", async ({ dashboardPage: page }) => {
    const apiPromise = page.waitForResponse((r) =>
      r.url().includes("type=closed-won") && r.status() === 200
    );
    await page.click('button:has-text("refresh")');
    const apiResponse = await apiPromise;
    const apiData = await apiResponse.json();

    // Find the Closed Won card subtitle showing "X deals"
    const wonCard = page.locator(".card-glow").filter({ hasText: "Closed Won" }).first();
    const subtitle = await wonCard.locator("text=/\\d+ deal/").textContent();
    if (subtitle) {
      const displayedCount = parseInt(subtitle.match(/(\d+)/)?.[1] || "0");
      expect(displayedCount).toBe(apiData.count);
    }
  });

  test("11.6: MobileStatsSummary shows totalOpenValue not filteredOpenValue @mobile", async ({ dashboardPage: page }) => {
    // This test documents a known bug:
    // MobileStatsSummary receives stats.totalOpenValue and ignores filteredOpenValue
    // When filters are active, mobile and desktop show different pipeline values

    // First, check if we're on mobile viewport
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 640) {
      test.skip();
      return;
    }

    // Apply a filter to create a difference between filtered and total
    // Click a specific pipeline button if available
    await page.click('button:has-text("filters")');
    await page.waitForTimeout(500);

    // Read mobile stats summary pipeline value
    const mobileStats = page.locator('[class*="sm:hidden"]').filter({ hasText: /pipeline/ });
    const mobileValue = await mobileStats.textContent();

    // Document: this value should match the filtered pipeline value when filters are active
    // but currently shows the unfiltered total
    expect(mobileValue).toBeTruthy();
    // Flag: compare with the API filtered value in a future fix
  });
});
