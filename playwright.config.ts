import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration.
 *
 * Usage:
 *   npx playwright test                   # run all E2E tests
 *   npx playwright test tests/e2e/auth    # run specific suite
 *   npx playwright test --headed          # show browser
 *   npx playwright test --debug           # step-by-step debugging
 *
 * Prerequisites:
 *   1. A running Psycologger instance (see BASE_URL below)
 *   2. A test database seeded with: npx tsx prisma/seed-e2e.ts
 *   3. Environment variables in .env.test.local
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // Sequential to avoid DB state conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Uncomment to add more browsers:
    // { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    // { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
  ],

  // Automatically start the dev server if not already running
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
