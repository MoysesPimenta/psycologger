/**
 * Next.js Middleware — Psycologger (feat/csp-nonce DRAFT)
 *
 * Nonce-based CSP: generates a per-request nonce, injects it into the
 * script-src / style-src directives, AND forwards it as an `x-csp-nonce`
 * request header so layouts/route handlers can pass it to <Script nonce>.
 *
 * DO NOT MERGE until the checklist in docs/runbooks/CSP_NONCE_MIGRATION.md
 * is green on the staging preview.
 */
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setCsrfCookie, validateCsrf } from "@/lib/csrf";

function isPortalRoute(pathname: string): boolean {
  return pathname.startsWith("/portal") || pathname.startsWith("/api/v1/portal");
}
function isPublicPortalRoute(pathname: string): boolean {
  return (
    pathname === "/portal/login" ||
    pathname.startsWith("/portal/activate/") ||
    pathname.startsWith("/portal/magic-login/") ||
    pathname === "/api/v1/portal/auth" ||
    pathname.startsWith("/api/v1/portal/auth/")
  );
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export default withAuth(
  function middleware(req: NextRequest) {
    const token = (req as NextRequest & { nextauth?: { token?: Record<string, unknown> } }).nextauth?.token;
    const pathname = req.nextUrl.pathname;

    if (pathname.startsWith("/sa/") && pathname !== "/sa/login") {
      if (!token?.isSuperAdmin) return NextResponse.redirect(new URL("/sa/login", req.url));
    }

    if (isPortalRoute(pathname) && !isPublicPortalRoute(pathname)) {
      const portalToken = req.cookies.get("psycologger-portal-token")?.value;
      if (!portalToken) {
        if (pathname.startsWith("/api/v1/portal")) {
          return NextResponse.json(
            { error: { code: "UNAUTHORIZED", message: "Portal session required" } },
            { status: 401 },
          );
        }
        return NextResponse.redirect(new URL("/portal/login", req.url));
      }
    }

    const nonce = generateNonce();
    const tenantId = req.cookies.get("psycologger-tenant")?.value;
    const headers = new Headers(req.headers);
    headers.delete("x-tenant-id");
    if (tenantId) headers.set("x-tenant-id", tenantId);
    headers.set("x-csp-nonce", nonce);

    const applySecurityHeaders = (res: NextResponse) => {
      const csp = [
        "default-src 'self'",
        // Nonce-based CSP. strict-dynamic allows scripts spawned by
        // nonce'd scripts to load without additional allowlisting.
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
        "img-src 'self' data: blob: https:",
        "font-src 'self'",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
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
      return res;
    };

    const response = NextResponse.next({ request: { headers } });
    setCsrfCookie(req, response);
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
        if (isPortalRoute(pathname)) return true;
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
        ) return true;
        return !!token;
      },
    },
  });

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|robots.txt).*)"],
};
