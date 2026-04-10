/**
 * Next.js Middleware — Psycologger
 * Handles:
 * - Auth protection for /app/* and /sa/* routes
 * - Tenant resolution header injection
 * - CSP headers with per-request nonce for defense-in-depth
 * - Nonce generation and distribution to layout for inline scripts
 */

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setCsrfCookie, validateCsrf } from "@/lib/csrf";

/**
 * Generate a cryptographically random nonce using Web Crypto API.
 * Returns a base64-encoded 16-byte string compatible with Edge Runtime.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Convert Uint8Array to string using Array.from for better TS compatibility
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

/** Check if this is a patient portal route (uses its own auth, not NextAuth) */
function isPortalRoute(pathname: string): boolean {
  return pathname.startsWith("/portal") || pathname.startsWith("/api/v1/portal");
}

/** Public portal pages that don't require a portal session */
function isPublicPortalRoute(pathname: string): boolean {
  return (
    pathname === "/portal/login" ||
    pathname.startsWith("/portal/activate/") ||
    pathname.startsWith("/portal/magic-login/") ||
    // Auth API (magic-link-request, magic-link-verify, activate, logout — all via POST actions)
    pathname === "/api/v1/portal/auth" ||
    pathname.startsWith("/api/v1/portal/auth/")
  );
}

export default withAuth(
  function middleware(req: NextRequest) {
    const token = (req as NextRequest & { nextauth?: { token?: Record<string, unknown> } }).nextauth?.token;
    const pathname = req.nextUrl.pathname;

    // SuperAdmin routes: require isSuperAdmin flag from JWT token (server-side only).
    // This flag is in the JWT but NOT exposed in the client session object.
    if (pathname.startsWith("/sa/") && pathname !== "/sa/login") {
      if (!token?.isSuperAdmin) {
        return NextResponse.redirect(new URL("/sa/login", req.url));
      }
    }

    // Portal routes: check for portal session cookie (NOT NextAuth)
    // Protected portal pages redirect to /portal/login if no cookie
    if (isPortalRoute(pathname) && !isPublicPortalRoute(pathname)) {
      const portalToken = req.cookies.get("psycologger-portal-token")?.value;
      if (!portalToken) {
        if (pathname.startsWith("/api/v1/portal")) {
          // API routes return 401
          return NextResponse.json(
            { error: { code: "UNAUTHORIZED", message: "Portal session required" } },
            { status: 401 },
          );
        }
        // Page routes redirect to login
        return NextResponse.redirect(new URL("/portal/login", req.url));
      }
    }

    // Generate a unique nonce for this request's CSP and inline scripts.
    // Stored in response header so layout can read it via headers().
    const nonce = generateNonce();

    // Inject tenant header from cookie if present (for SSR).
    // SECURITY: always strip any client-supplied x-tenant-id header first;
    // the only trustworthy source is the cookie set after authentication.
    const tenantId = req.cookies.get("psycologger-tenant")?.value;
    const headers = new Headers(req.headers);
    headers.delete("x-tenant-id");
    if (tenantId) {
      headers.set("x-tenant-id", tenantId);
    }
    // Forward nonce to request so it's available in headers() calls
    headers.set("x-csp-nonce", nonce);

    // Helper to apply security headers to any response (including early rejects).
    // CSP is now set here per-request with a unique nonce, rather than statically
    // in next.config.mjs. The nonce enables dropping 'unsafe-inline' while still
    // allowing Next.js inline hydration scripts and Sentry's instrumentation.
    const applySecurityHeaders = (res: NextResponse) => {
      // CSP with per-request nonce. strict-dynamic allows scripts loaded by
      // nonce'd scripts to run without re-allowlisting, which is how Sentry
      // and third-party integrations work.
      const csp = [
        "default-src 'self'",
        // script-src: nonce for inline scripts, strict-dynamic for dynamic loads
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://*.sentry.io https://va.vercel-scripts.com https://vitals.vercel-insights.com`,
        // style-src: nonce for inline styles (still needed for some frameworks)
        `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.supabase.co wss://*.supabase.co https://api.resend.com https://api.stripe.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
        "frame-src 'self' https://js.stripe.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");
      res.headers.set("Content-Security-Policy", csp);

      res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("X-Frame-Options", "DENY");
      res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      res.headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
      );
      // Expose nonce via response header for layout to read
      res.headers.set("x-csp-nonce", nonce);
      return res;
    };

    const response = NextResponse.next({ request: { headers } });

    // Set CSRF cookie BEFORE validating — fresh visitors (e.g., magic link users)
    // need the cookie available for their first POST request
    setCsrfCookie(req, response);

    // CSRF validation for state-changing requests
    if (!validateCsrf(req)) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: { code: "CSRF_FAILED", message: "Invalid or missing CSRF token" } },
          { status: 403 },
        ),
      );
    }

    return applySecurityHeaders(response);
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Portal routes use their own auth — always pass NextAuth check
        if (isPortalRoute(pathname)) {
          return true;
        }

        // Public routes
        if (
          pathname === "/" ||
          pathname === "/offline" ||
          pathname.startsWith("/pricing") ||
          pathname.startsWith("/login") ||
          pathname.startsWith("/signup") ||
          pathname.startsWith("/invite/") ||
          pathname.startsWith("/onboarding") ||
          pathname.startsWith("/docs") ||
          pathname.startsWith("/terms") ||
          pathname.startsWith("/privacy") ||
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/api/health") ||
          // Cron endpoints authenticate via Bearer CRON_SECRET themselves;
          // letting middleware redirect them to /login breaks both manual
          // curl invocations and Vercel's scheduled cron runner.
          pathname.startsWith("/api/v1/cron/") ||
          // Webhook endpoints authenticate via signature verification themselves
          pathname.startsWith("/api/v1/webhooks/") ||
          // Debug endpoints authenticate via Bearer CRON_SECRET themselves
          pathname.startsWith("/api/debug/") ||
          pathname.startsWith("/_next") ||
          pathname.startsWith("/favicon")
        ) {
          return true;
        }
        // Protected routes require token
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|robots.txt).*)",
  ],
};
