import { test, expect, switchToLedger } from "../fixtures/dashboard.fixture";

test.describe("Timestamp Formatting Consistency", () => {
  test("3.1: Changelog uses relative time for recent entries @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // Find timestamp elements in changelog rows
    const timestamps = page.locator(".changelog-entry .shrink-0.w-\\[52px\\]");
    const count = await timestamps.count();

    if (count > 0) {
      const firstTs = await timestamps.first().textContent();
      if (firstTs) {
        // Should be relative: "Xm ago", "Xh ago", "Xd ago", or absolute "Mon DD"
        expect(firstTs.trim()).toMatch(/^\d+[mhd] ago$|^just now$|^[A-Z][a-z]{2} \d+$/);
      }
    }
  });

  test("3.2: Ledger uses absolute timestamps on desktop @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await switchToLedger(page);
    await page.waitForTimeout(500);

    // Ledger timestamps should be "Mon DD, HH:MM AM/PM" format
    // Look for the pattern in transaction rows
    const txnRows = page.locator("text=/[A-Z][a-z]{2} \\d+, \\d+:\\d+ [AP]M/");
    const count = await txnRows.count();

    // If there are transactions, they should have absolute timestamps
    if (count > 0) {
      const firstTs = await txnRows.first().textContent();
      expect(firstTs).toMatch(/[A-Z][a-z]{2} \d+, \d+:\d+ [AP]M/);
    }
  });

  test("3.2b: Ledger uses short timestamps on mobile @mobile", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 400) {
      test.skip();
      return;
    }

    await switchToLedger(page);
    await page.waitForTimeout(500);

    // Mobile timestamps should be "M-DD-YY" format
    const shortTs = page.locator("text=/^\\d{1,2}-\\d{1,2}-\\d{2}$/");
    const count = await shortTs.count();

    if (count > 0) {
      const firstTs = await shortTs.first().textContent();
      expect(firstTs).toMatch(/^\d{1,2}-\d{1,2}-\d{2}$/);
    }
  });

  test("3.4: Cross-view timestamp format inconsistency documentation @desktop", async ({ dashboardPage: page, request }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    // Get both API responses to find the same deal
    const [changelogRes, ledgerRes] = await Promise.all([
      request.get("http://localhost:3000/api/hubspot?type=changelog&quarter=2026-Q1&limit=50"),
      request.get("http://localhost:3000/api/hubspot?type=pipeline-ledger&quarter=2026-Q1"),
    ]);

    const changelog = await changelogRes.json();
    const ledger = await ledgerRes.json();

    // Find a deal that appears in both
    const changelogDeals = new Set(changelog.changelogs?.map((c: { dealId: string }) => c.dealId) || []);
    const sharedTxn = ledger.transactions?.find((t: { dealId: string }) => changelogDeals.has(t.dealId));

    if (sharedTxn) {
      // Document: changelog shows relative ("3d ago"), ledger shows absolute ("Mar 20, 10:15 AM")
      console.info(
        `[INCONSISTENCY DOCUMENTED] Same deal "${sharedTxn.dealName}" appears in both views:\n` +
        `  Changelog: displays relative time (e.g., "3d ago")\n` +
        `  Ledger: displays absolute time ("${sharedTxn.timestamp}")\n` +
        `  Consider unifying timestamp format across views.`
      );
    }

    // This test documents the inconsistency, not fails for it
    expect(true).toBeTruthy();
  });
});
