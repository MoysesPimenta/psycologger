/**
 * CSRF Protection — Psycologger
 *
 * Uses the double-submit cookie pattern combined with SameSite: strict cookies.
 *
 * Flow:
 * 1. Middleware sets a random CSRF token in a non-httpOnly cookie on every response.
 * 2. Client-side code reads the cookie and sends it as an X-CSRF-Token header.
 * 3. Server-side validation compares the header value against the cookie value.
 *
 * Since the cookie is SameSite: strict, a cross-origin request cannot read or
 * send the cookie, making it impossible for an attacker to forge the header.
 *
 * This protection applies to all state-changing methods (POST, PATCH, PUT, DELETE)
 * on authenticated API routes.
 */

import { NextRequest, NextResponse } from "next/server";

export const CSRF_COOKIE_NAME = "psycologger-csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a random CSRF token (Edge Runtime compatible).
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Convert to hex string (Edge-compatible, no Buffer)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Set the CSRF cookie on a NextResponse if not already present.
 * Called from middleware on every request.
 */
export function setCsrfCookie(req: NextRequest, response: NextResponse): void {
  const existing = req.cookies.get(CSRF_COOKIE_NAME)?.value;

  // Rotate CSRF token on auth state changes to prevent fixation attacks.
  // Detected by checking if the auth session cookie was just set/cleared.
  const pathname = req.nextUrl.pathname;
  const isAuthCallback = pathname.startsWith("/api/auth/callback");
  const isAuthSignout = pathname.startsWith("/api/auth/signout");
  const isPortalAuthAction = pathname === "/api/v1/portal/auth";

  // If not an auth transition and token already exists, keep the current one
  if (existing && !isAuthCallback && !isAuthSignout && !isPortalAuthAction) return;

  const token = generateCsrfToken();
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by client-side JS
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

/**
 * Validate CSRF token for a state-changing request.
 * Returns true if valid, false if the request should be rejected.
 *
 * Skips validation for:
 * - Safe methods (GET, HEAD, OPTIONS)
 * - Non-API routes
 * - Cron/webhook routes (protected by Bearer token)
 * - Portal auth routes (no session yet)
 */
export function validateCsrf(req: NextRequest): boolean {
  const method = req.method.toUpperCase();

  // Safe methods don't need CSRF protection
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const pathname = req.nextUrl.pathname;

  // Skip non-API routes
  if (!pathname.startsWith("/api/")) return true;

  // Skip auth endpoints (login, signup, etc.)
  if (pathname.startsWith("/api/auth/")) return true;

  // Skip cron endpoints (protected by Bearer token / CRON_SECRET)
  if (pathname.startsWith("/api/v1/cron/")) return true;

  // Skip webhook endpoints (protected by signature verification themselves:
  // Stripe uses its signing secret, Resend uses Svix headers). These are
  // called by third parties that cannot carry our CSRF cookie.
  if (pathname.startsWith("/api/v1/webhooks/")) return true;

  // Skip portal auth endpoints that have no session yet (login, activate, magic-link).
  // IMPORTANT: do NOT bypass /api/v1/portal/auth/logout — it is state-changing and
  // happens when a portal session already exists, so a CSRF token is available.
  // Allow only the bootstrap routes that legitimately have no cookie pair.
  const portalAuthBootstrap = new Set([
    "/api/v1/portal/auth/magic-link-request",
    "/api/v1/portal/auth/magic-link-verify",
    "/api/v1/portal/auth/activate",
  ]);
  if (portalAuthBootstrap.has(pathname)) return true;

  // Get token from cookie and header
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = req.headers.get(CSRF_HEADER_NAME);

  // Both must be present and match
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length < 32) return false;
  if (cookieToken.length !== headerToken.length) return false;

  // Constant-time comparison to prevent timing attacks.
  // Uses XOR-based comparison since crypto.timingSafeEqual is not
  // available in the Edge Runtime (middleware runs in Edge).
  let mismatch = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    mismatch |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return mismatch === 0;
}
