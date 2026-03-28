/**
 * Auth setup — Playwright global setup for authenticated tests.
 *
 * This file runs BEFORE the E2E test suite to create a saved auth state
 * (browser cookies + localStorage) that authenticated tests can reuse.
 *
 * In a real environment, this would use a programmatic login mechanism.
 * Since Psycologger uses magic links, we have two options:
 *
 * OPTION A (Development): Use a special test endpoint POST /api/test/set-session
 *   that creates a valid JWT and sets the cookie (only enabled in test mode).
 *
 * OPTION B (CI with real email): Use a mail catcher (Mailpit) to intercept
 *   the magic link email and extract the URL.
 *
 * This file implements OPTION A.
 * To enable it, create src/app/api/test/set-session/route.ts (see instructions below).
 */

import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

setup("authenticate test user", async ({ page }) => {
  // Ensure .auth directory exists
  const authDir = path.join(__dirname, ".auth");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Skip auth setup if not in test mode (just create empty state)
  if (process.env.NODE_ENV !== "test" && !process.env.E2E_TEST_USER_ID) {
    console.warn(
      "[auth.setup] E2E_TEST_USER_ID not set. " +
      "Authenticated tests will use empty session. " +
      "Set E2E_TEST_USER_ID and E2E_TEST_USER_EMAIL in .env.test.local"
    );
    // Save empty storage state so tests can still run (they'll be redirected to /login)
    await page.goto("/");
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  const userId = process.env.E2E_TEST_USER_ID!;
  const email = process.env.E2E_TEST_USER_EMAIL ?? "admin@e2e-test.psycologger.com";
  const tenantId = process.env.E2E_TEST_TENANT_ID ?? "";

  // Call the test-only endpoint to set the session cookie
  await page.goto("/");

  const response = await page.request.post("/api/test/set-session", {
    data: { userId, email, tenantId, isSuperAdmin: false },
  });

  if (response.status() !== 200) {
    console.warn(
      "[auth.setup] /api/test/set-session returned",
      response.status(),
      "— check that NODE_ENV=test and the endpoint exists"
    );
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // Navigate to the app to verify the session works
  await page.goto("/app/today");

  // Verify we're authenticated (not redirected to login)
  expect(page.url()).not.toContain("/login");

  // Save the authenticated state
  await page.context().storageState({ path: AUTH_FILE });

  console.log("[auth.setup] Auth state saved to", AUTH_FILE);
});

/**
 * To create the test session endpoint, add this file:
 *
 * src/app/api/test/set-session/route.ts
 * ---
 * import { NextRequest, NextResponse } from "next/server";
 * import { encode } from "next-auth/jwt";
 *
 * export async function POST(req: NextRequest) {
 *   if (process.env.NODE_ENV !== "test") {
 *     return NextResponse.json({ error: "Only available in test mode" }, { status: 403 });
 *   }
 *   const { userId, email, isSuperAdmin, tenantId } = await req.json();
 *   const token = await encode({
 *     token: { id: userId, email, isSuperAdmin, sub: userId },
 *     secret: process.env.NEXTAUTH_SECRET!,
 *   });
 *   const response = NextResponse.json({ ok: true });
 *   response.cookies.set("next-auth.session-token", token, {
 *     httpOnly: true,
 *     secure: false,
 *     sameSite: "lax",
 *     path: "/",
 *   });
 *   if (tenantId) {
 *     response.cookies.set("psycologger-tenant", tenantId, { path: "/" });
 *   }
 *   return response;
 * }
 */
