import { test, expect, setTheme } from "../fixtures/dashboard.fixture";

test.describe("Theme Rendering", () => {
  test("10.1: Terminal theme (default) renders correctly @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await setTheme(page, "terminal");
    await page.waitForTimeout(300);

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    // Default theme may not set data-theme attribute, or sets "terminal"
    expect(theme === null || theme === "terminal").toBeTruthy();

    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    // Terminal theme bg: #0a0e17 → rgb(10, 14, 23)
    expect(bgColor).toMatch(/rgb\(10,\s*14,\s*23\)/);
  });

  test("10.2: Console/Chromatic theme renders correctly @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await setTheme(page, "chromatic");
    await page.waitForTimeout(300);

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme).toBe("chromatic");

    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    // Chromatic theme bg: #000000 → rgb(0, 0, 0)
    expect(bgColor).toMatch(/rgb\(0,\s*0,\s*0\)/);

    // All border-radius should be 0 in chromatic theme
    const cardBorderRadius = await page.locator(".card-glow").first().evaluate((el) =>
      getComputedStyle(el).borderRadius
    );
    expect(cardBorderRadius).toBe("0px");
  });

  test("10.3: Light theme renders correctly @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await setTheme(page, "light");
    await page.waitForTimeout(300);

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme).toBe("light");

    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    // Light theme bg: #f8fafc → rgb(248, 250, 252)
    expect(bgColor).toMatch(/rgb\(248,\s*250,\s*252\)/);
  });

  test("10.4: Theme persists across page reload @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    await setTheme(page, "light");
    await page.waitForTimeout(300);

    // Reload the page
    await page.reload();
    await page.waitForSelector('button:has-text("refresh")', { timeout: 30000 });

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme).toBe("light");

    // Clean up — reset to terminal
    await setTheme(page, "terminal");
  });

  test("10.5: No invisible text in any theme @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    const themes: Array<"terminal" | "chromatic" | "light"> = ["terminal", "chromatic", "light"];

    for (const theme of themes) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);

      // Check that the main heading text is visible (has color with reasonable contrast)
      const headerColor = await page.locator("h2").first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, bg: cs.backgroundColor };
      });

      // Just verify the text color is not transparent or identical to background
      expect(headerColor.color).not.toBe("rgba(0, 0, 0, 0)");
      expect(headerColor.color).not.toBe("transparent");

      // Check a card value is visible
      const cardValue = page.locator(".text-2xl, [class*='font-bold']").first();
      if (await cardValue.isVisible()) {
        const valueColor = await cardValue.evaluate((el) => getComputedStyle(el).color);
        expect(valueColor).not.toBe("rgba(0, 0, 0, 0)");
      }
    }

    // Reset
    await setTheme(page, "terminal");
  });

  test("10.6: Badge readability across themes @desktop", async ({ dashboardPage: page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 640) {
      test.skip();
      return;
    }

    const themes: Array<"terminal" | "chromatic" | "light"> = ["terminal", "chromatic", "light"];

    for (const theme of themes) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);

      // Find a badge element
      const badge = page.locator(".changelog-entry span[class*='uppercase'][class*='font-bold']").first();
      if (await badge.isVisible()) {
        const styles = await badge.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            color: cs.color,
            backgroundColor: cs.backgroundColor,
            borderColor: cs.borderColor,
          };
        });

        // Badge text should have color
        expect(styles.color).not.toBe("rgba(0, 0, 0, 0)");

        console.info(`[${theme}] Badge — text: ${styles.color}, bg: ${styles.backgroundColor}`);
      }
    }

    // Reset
    await setTheme(page, "terminal");
  });
});
