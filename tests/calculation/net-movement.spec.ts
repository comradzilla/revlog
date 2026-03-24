import { test, expect, parseCurrency } from "../fixtures/dashboard.fixture";

test.describe("Net Movement Calculations", () => {
  test("11.4: NetMovementBar net = created - won - lost @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip(); // NetMovementBar hidden on mobile
      return;
    }

    // Find the net movement bar — it contains "PIPELINE FLOW" and "DEAL VALUES" sections
    const flowSection = page.locator("text=PIPELINE FLOW").locator("..").locator("..");

    // Extract created, won, lost values from the flow section
    const flowText = await flowSection.textContent();
    if (!flowText) {
      test.skip();
      return;
    }

    // Parse: "+$3.8M created (69)    $42K won (2)    -$125K lost (3)"
    const createdMatch = flowText.match(/\+?\$?([\d.,]+[MK]?)\s*created/i);
    const wonMatch = flowText.match(/\$?([\d.,]+[MK]?)\s*won/i);
    const lostMatch = flowText.match(/-?\$?([\d.,]+[MK]?)\s*lost/i);
    const netMatch = flowText.match(/net:\s*([+-]?\$?[\d.,]+[MK]?)/i);

    if (createdMatch && wonMatch && lostMatch && netMatch) {
      const created = parseCurrency(createdMatch[1]);
      const won = parseCurrency(wonMatch[1]);
      const lost = parseCurrency(lostMatch[1]);
      const net = parseCurrency(netMatch[1]);

      const expected = created - won - lost;
      const tolerance = Math.max(Math.abs(expected) * 0.05, 1000);
      expect(Math.abs(net - expected)).toBeLessThan(tolerance);
    }
  });
});
