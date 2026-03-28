/**
 * Next.js Middleware — Psycologger
 * Handles:
 * - Auth protection for /app/* and /sa/* routes
 * - Tenant resolution header injection
 * - Security headers (supplementary to next.config.ts)
 */

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

    // Inject tenant header from cookie if present (for SSR)
    const tenantId = req.cookies.get("psycologger-tenant")?.value;
    const headers = new Headers(req.headers);
    if (tenantId) {
      headers.set("x-tenant-id", tenantId);
    }

    return NextResponse.next({ request: { headers } });
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        // Public routes
        if (
          pathname === "/" ||
          pathname.startsWith("/pricing") ||
          pathname.startsWith("/login") ||
          pathname.startsWith("/signup") ||
          pathname.startsWith("/invite/") ||
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
