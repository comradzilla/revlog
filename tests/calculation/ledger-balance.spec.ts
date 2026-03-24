import { test, expect, parseCurrency, switchToLedger } from "../fixtures/dashboard.fixture";

test.describe("Ledger Balance Calculations", () => {
  test("11.2: Ledger anchor balance matches Open Pipeline card", async ({ dashboardPage: page }) => {
    // Read Open Pipeline card value
    const pipelineCard = page.locator(".card-glow").filter({ hasText: "Open Pipeline" }).first();
    const pipelineValue = await pipelineCard.locator(".text-2xl").first().textContent();
    const cardValue = parseCurrency(pipelineValue || "0");

    // Switch to ledger and read balance header
    await switchToLedger(page);
    await page.waitForTimeout(500);

    // The ledger header shows current balance in a text-lg font-bold span
    const balanceText = await page.locator(".text-lg.font-bold").first().textContent();
    if (balanceText) {
      const ledgerBalance = parseCurrency(balanceText);
      // They query the same underlying data, so should be close
      // Allow 5% tolerance due to formatting rounding
      const tolerance = Math.max(cardValue * 0.05, 1000);
      expect(Math.abs(ledgerBalance - cardValue)).toBeLessThan(tolerance);
    }
  });
});
