/**
 * E2E Tests — Authentication flow
 *
 * Prerequisites:
 * - App running at PLAYWRIGHT_BASE_URL (defaults to localhost:3000)
 * - Test user seeded (see prisma/seed-e2e.ts)
 *
 * NOTE: Magic link delivery is tested via intercepting the Resend API
 * or by using a mail capture tool in CI. For local development,
 * check the server logs for the magic link URL (logged in dev mode).
 */

import { test, expect } from "@playwright/test";
import { navigateToLogin, submitMagicLinkForm } from "./helpers";

test.describe("Login page", () => {
  test("renders the login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Psycologger/i);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("shows email validation error for invalid email", async ({ page }) => {
    await navigateToLogin(page);
    await page.fill('input[type="email"]', "not-an-email");
    await page.click('button[type="submit"]');
    // HTML5 validation or custom error
    const input = page.locator('input[type="email"]');
    const isInvalid = await input.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test("shows verify message after submitting valid email", async ({ page }) => {
    await navigateToLogin(page);
    await submitMagicLinkForm(page, "test@example.com");
    // Should show "check your email" message
    await expect(
      page.locator("text=/email|verifique|link/i").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("does not reveal whether email exists (security)", async ({ page }) => {
    await navigateToLogin(page);
    // Submit with known non-existent email
    await submitMagicLinkForm(page, `nonexistent-${Date.now()}@example.com`);
    // Should show same success message regardless
    await expect(
      page.locator("text=/email|verifique|link/i").first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Protected routes redirect", () => {
  test("unauthenticated access to /app redirects to /login", async ({ page }) => {
    await page.goto("/app/today");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated access to /app/patients redirects to /login", async ({ page }) => {
    await page.goto("/app/patients");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated access to /sa/dashboard redirects to login", async ({ page }) => {
    await page.goto("/sa/dashboard");
    await expect(page).toHaveURL(/\/login|\/sa\/login/);
  });
});

test.describe("Public routes", () => {
  test("landing page is accessible", async ({ page }) => {
    await page.goto("/");
    expect(page.url()).not.toContain("/login");
  });

  test("pricing page is accessible", async ({ page }) => {
    await page.goto("/pricing");
    expect(page.url()).not.toContain("/login");
  });

  test("signup page is accessible", async ({ page }) => {
    await page.goto("/signup");
    expect(page.url()).not.toContain("/login");
  });
});

test.describe("Signup flow", () => {
  test("signup form renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("signup with all fields submits successfully", async ({ page }) => {
    await page.goto("/signup");

    const uniqueEmail = `e2e-signup-${Date.now()}@test.com`;
    await page.fill('input[name="name"]', "Dr. E2E Test");
    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="clinicName"]', "E2E Clinic Test");
    await page.click('button[type="submit"]');

    // Should show success state (check email message)
    await expect(
      page.locator("text=/email|enviamos|verifique/i").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("signup with empty fields shows validation errors", async ({ page }) => {
    await page.goto("/signup");
    await page.click('button[type="submit"]');
    // At least one field should show required error
    const errors = await page.locator("[aria-invalid=true], .text-red-500, [role=alert]").count();
    expect(errors).toBeGreaterThan(0);
  });
});
