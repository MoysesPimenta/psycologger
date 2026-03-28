/**
 * E2E Test helpers — shared utilities for Playwright tests.
 *
 * These helpers assume a test database seeded via `prisma/seed-e2e.ts`
 * with predictable test credentials.
 */

import { type Page, expect } from "@playwright/test";

// ─── Test credentials (must exist in the test database) ──────────────────────
// Seed these via prisma/seed-e2e.ts before running E2E tests.

export const TEST_USERS = {
  admin: {
    email: "admin@e2e-test.psycologger.com",
    name: "Admin E2E",
    role: "TENANT_ADMIN",
  },
  psychologist: {
    email: "psi@e2e-test.psycologger.com",
    name: "Dr. E2E Psicólogo",
    role: "PSYCHOLOGIST",
  },
  assistant: {
    email: "assistant@e2e-test.psycologger.com",
    name: "Assistant E2E",
    role: "ASSISTANT",
  },
  readonly: {
    email: "readonly@e2e-test.psycologger.com",
    name: "Readonly E2E",
    role: "READONLY",
  },
};

export const TEST_TENANT = {
  name: "E2E Test Clinic",
  slug: "e2e-test-clinic",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the login page and request a magic link for the given email.
 * NOTE: In E2E tests, we bypass the actual email by using NextAuth's
 * `NEXTAUTH_URL` with a callback URL that can be intercepted.
 *
 * For full magic link testing, use a mail catcher (e.g. Mailhog, Mailpit)
 * or mock the email transport in test mode.
 */
export async function navigateToLogin(page: Page) {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
}

export async function submitMagicLinkForm(page: Page, email: string) {
  await page.fill('input[type="email"]', email);
  await page.click('button[type="submit"]');
}

/**
 * Programmatically set the NextAuth session cookie so tests can start
 * already authenticated. This avoids needing to actually click magic links.
 *
 * Requires: NEXTAUTH_SECRET in .env.test.local
 *
 * Usage:
 *   await setAuthSession(page, { userId: "...", email: "...", isSuperAdmin: false });
 */
export async function setSessionCookie(
  page: Page,
  { userId, email, isSuperAdmin = false }: { userId: string; email: string; isSuperAdmin?: boolean }
) {
  // We inject the session via an API endpoint only available in test mode.
  // This endpoint must be created at /api/test/set-session (gated by NODE_ENV=test).
  const response = await page.request.post("/api/test/set-session", {
    data: { userId, email, isSuperAdmin },
  });
  expect(response.status()).toBe(200);
}

/**
 * Wait for a toast notification to appear.
 */
export async function expectToast(page: Page, message: string) {
  await expect(page.locator(`text=${message}`).first()).toBeVisible({ timeout: 5000 });
}

/**
 * Dismiss any open modals/dialogs by pressing Escape.
 */
export async function dismissModal(page: Page) {
  await page.keyboard.press("Escape");
}
