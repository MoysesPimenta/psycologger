/**
 * Smoke test — Landing page loads successfully
 * Catches basic build/deploy regressions.
 *
 * Prerequisites:
 * - App is running at baseURL (typically http://localhost:3000)
 * - No auth required for public pages
 */

import { test, expect } from "@playwright/test";

test("landing page loads with status 200 and contains Psycologger brand", async ({ page }) => {
  const response = await page.goto("/");

  // Should succeed
  expect(response?.status()).toBe(200);

  // Page should contain "Psycologger" somewhere
  await expect(page).toContainText("Psycologger");

  // Smoke: page title or heading mentions the brand
  const pageContent = await page.content();
  expect(pageContent).toContain("Psycologger");
});

test("landing page header contains navigation links", async ({ page }) => {
  await page.goto("/");

  // Should see "Entrar" (Login) link
  await expect(page.locator('a:has-text("Entrar")')).toBeVisible();

  // Should see "Criar conta" or similar signup link
  const signupLink = page.locator('text=/criar conta|signup/i').first();
  await expect(signupLink).toBeVisible();
});

test("landing page responds quickly", async ({ page }) => {
  const startTime = Date.now();
  await page.goto("/");
  const loadTime = Date.now() - startTime;

  // Should load in under 5 seconds
  expect(loadTime).toBeLessThan(5000);
});
