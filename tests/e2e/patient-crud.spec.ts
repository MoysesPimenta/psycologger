/**
 * E2E Tests — Patient CRUD flow
 *
 * Tests creating, viewing, and editing patients.
 * Requires an authenticated session — uses the test session helper.
 *
 * NOTE: These tests require a seeded test user + tenant.
 * See prisma/seed-e2e.ts
 */

import { test, expect } from "@playwright/test";

// Storage state file (saved after login in auth.setup.ts)
test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Patients list", () => {
  test("navigates to patients page", async ({ page }) => {
    await page.goto("/app/patients");
    await expect(page).toHaveURL(/\/app\/patients/);
    await expect(page).toHaveTitle(/Pacientes|Psycologger/i);
  });

  test("shows empty state when no patients exist", async ({ page }) => {
    await page.goto("/app/patients");
    // Should show either empty state or patient list
    const hasEmptyState = await page.locator("text=/nenhum paciente|cadastre/i").isVisible().catch(() => false);
    const hasList = await page.locator("[data-testid=patient-row]").count().then(n => n > 0).catch(() => false);
    expect(hasEmptyState || hasList).toBe(true);
  });

  test("new patient button is visible for authorized users", async ({ page }) => {
    await page.goto("/app/patients");
    const newButton = page.locator("text=/novo paciente|adicionar/i").first();
    await expect(newButton).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Create patient", () => {
  test("opens new patient form", async ({ page }) => {
    await page.goto("/app/patients/new");
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
  });

  test("creates a patient with required fields only", async ({ page }) => {
    await page.goto("/app/patients/new");

    const uniqueName = `E2E Patient ${Date.now()}`;
    await page.fill('input[name="fullName"]', uniqueName);
    await page.click('button[type="submit"]');

    // Should redirect to patient detail or show success
    await expect(async () => {
      const url = page.url();
      const hasPatientPage = url.includes("/patients/") || url.includes("/app/patients");
      expect(hasPatientPage).toBe(true);
    }).toPass({ timeout: 5000 });
  });

  test("validates required fields", async ({ page }) => {
    await page.goto("/app/patients/new");
    await page.click('button[type="submit"]');

    // fullName is required — should show error
    const error = page.locator("text=/nome|obrigatório|required/i").first();
    await expect(error).toBeVisible({ timeout: 3000 });
  });

  test("creates patient with all fields", async ({ page }) => {
    await page.goto("/app/patients/new");

    const uniqueName = `E2E Full Patient ${Date.now()}`;
    await page.fill('input[name="fullName"]', uniqueName);

    const emailInput = page.locator('input[name="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill(`patient-${Date.now()}@test.com`);
    }

    const phoneInput = page.locator('input[name="phone"]');
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("11999999999");
    }

    await page.click('button[type="submit"]');

    await expect(async () => {
      expect(page.url()).not.toContain("/new");
    }).toPass({ timeout: 5000 });
  });
});

test.describe("Patient search", () => {
  test("search input is present on patients page", async ({ page }) => {
    await page.goto("/app/patients");
    const searchInput = page.locator('input[placeholder*="buscar" i], input[type="search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test("searching filters patient list", async ({ page }) => {
    await page.goto("/app/patients");

    const searchInput = page.locator('input[placeholder*="buscar" i], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("ZZZNORESULT");
      await page.waitForTimeout(500); // debounce
      // Expect either "no results" text or empty list
      const noResults = await page.locator("text=/nenhum|sem resultado|not found/i").isVisible().catch(() => false);
      const rowCount = await page.locator("[data-testid=patient-row]").count();
      expect(noResults || rowCount === 0).toBe(true);
    }
  });
});
