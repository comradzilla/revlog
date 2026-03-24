import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "tests/.auth/storage.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");

  // Enter the password
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(process.env.DASHBOARD_PASSWORD || "revradar2024");
  await passwordInput.press("Enter");

  // Wait for redirect to dashboard
  await page.waitForURL("/", { timeout: 15000 });
  await page.waitForSelector('button:has-text("refresh")', { timeout: 30000 });

  // Save auth state
  await page.context().storageState({ path: AUTH_FILE });
});
