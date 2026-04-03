/**
 * Next.js Middleware — Psycologger
 * Handles:
 * - Auth protection for /app/* and /sa/* routes
 * - Tenant resolution header injection
 * - CSP nonce injection for defense-in-depth
 */

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Generate a random nonce for CSP (Edge Runtime compatible) */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Convert to base64 without Buffer (Edge Runtime)
  const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
  return btoa(binString);
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
    pathname === "/portal/forgot-password" ||
    pathname.startsWith("/portal/reset-password/") ||
    pathname.startsWith("/api/v1/portal/auth/")
  );
}

export default withAuth(
  function middleware(req: NextRequest) {
    const token = (req as NextRequest & { nextauth?: { token?: Record<string, unknown> } }).nextauth?.token;
    const pathname = req.nextUrl.pathname;

    // SuperAdmin routes: require isSuperAdmin flag
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

    // Generate CSP nonce
    const nonce = generateNonce();

    // Inject tenant header and nonce from cookie if present (for SSR)
    const tenantId = req.cookies.get("psycologger-tenant")?.value;
    const headers = new Headers(req.headers);
    if (tenantId) {
      headers.set("x-tenant-id", tenantId);
    }
    headers.set("x-nonce", nonce);

    const response = NextResponse.next({ request: { headers } });

    // Set CSP header with nonce — only scripts/styles with the matching nonce are allowed
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; ");

    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    return response;
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
          pathname.startsWith("/pricing") ||
          pathname.startsWith("/login") ||
          pathname.startsWith("/signup") ||
          pathname.startsWith("/invite/") ||
          pathname.startsWith("/onboarding") ||
          pathname.startsWith("/docs") ||
          pathname.startsWith("/terms") ||
          pathname.startsWith("/privacy") ||
          pathname.startsWith("/api/auth") ||
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
