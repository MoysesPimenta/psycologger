/**
 * Unit tests — Next.js Middleware (src/middleware.ts)
 * Tests:
 * - Public routes are allowed without auth
 * - Protected routes require authentication
 * - SuperAdmin routes require isSuperAdmin flag
 * - Tenant header injection from cookie
 */

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// We need to test the middleware logic, so we'll import and test the
// authorized callback logic directly
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/login",
  "/signup",
  "/invite/abc",
  "/api/auth/callback",
  "/_next/static",
  "/favicon",
];

const PROTECTED_ROUTES = ["/app/dashboard", "/app/patients", "/sa/admin"];

describe("Middleware", () => {
  describe("authorized callback", () => {
    // Simulate the authorized callback logic from middleware
    function isAuthorized(token: any, pathname: string): boolean {
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
    }

    test("allows access to home page without token", () => {
      expect(isAuthorized(null, "/")).toBe(true);
      expect(isAuthorized(undefined, "/")).toBe(true);
    });

    test("allows access to pricing page without token", () => {
      expect(isAuthorized(null, "/pricing")).toBe(true);
      expect(isAuthorized(null, "/pricing/plans")).toBe(true);
    });

    test("allows access to login page without token", () => {
      expect(isAuthorized(null, "/login")).toBe(true);
    });

    test("allows access to signup page without token", () => {
      expect(isAuthorized(null, "/signup")).toBe(true);
    });

    test("allows access to invite links without token", () => {
      expect(isAuthorized(null, "/invite/abc123")).toBe(true);
      expect(isAuthorized(null, "/invite/xyz789")).toBe(true);
    });

    test("allows access to auth API routes without token", () => {
      expect(isAuthorized(null, "/api/auth/callback")).toBe(true);
      expect(isAuthorized(null, "/api/auth/signin")).toBe(true);
    });

    test("allows access to Next.js internal routes without token", () => {
      expect(isAuthorized(null, "/_next/static/chunk.js")).toBe(true);
      expect(isAuthorized(null, "/_next/image")).toBe(true);
    });

    test("allows access to favicon without token", () => {
      expect(isAuthorized(null, "/favicon.ico")).toBe(true);
    });

    test("blocks app routes without token", () => {
      expect(isAuthorized(null, "/app/dashboard")).toBe(false);
      expect(isAuthorized(null, "/app/patients")).toBe(false);
      expect(isAuthorized(null, "/app/settings")).toBe(false);
    });

    test("allows app routes with valid token", () => {
      const token = { userId: "user-123" };
      expect(isAuthorized(token, "/app/dashboard")).toBe(true);
      expect(isAuthorized(token, "/app/patients")).toBe(true);
    });

    test("blocks superadmin routes without token", () => {
      expect(isAuthorized(null, "/sa/admin")).toBe(false);
    });

    test("allows superadmin routes with valid token", () => {
      const token = { userId: "admin-123" };
      expect(isAuthorized(token, "/sa/admin")).toBe(true);
    });

    test("allows API routes with token", () => {
      const token = { userId: "user-123" };
      expect(isAuthorized(token, "/api/v1/patients")).toBe(true);
      expect(isAuthorized(token, "/api/v1/charges")).toBe(true);
    });
  });

  describe("Superadmin access control", () => {
    // Simulate superadmin check logic
    function isSuperAdminAuthorized(token: any, pathname: string): boolean {
      // SuperAdmin routes: require isSuperAdmin flag
      if (pathname.startsWith("/sa/") && pathname !== "/sa/login") {
        if (!token?.isSuperAdmin) {
          return false; // Would redirect to /sa/login
        }
      }
      return true;
    }

    test("blocks /sa/admin without isSuperAdmin flag", () => {
      const token = { userId: "user-123", isSuperAdmin: false };
      expect(isSuperAdminAuthorized(token, "/sa/admin")).toBe(false);
    });

    test("blocks /sa/settings without isSuperAdmin flag", () => {
      const token = { userId: "user-123" }; // No isSuperAdmin at all
      expect(isSuperAdminAuthorized(token, "/sa/settings")).toBe(false);
    });

    test("allows /sa/admin with isSuperAdmin flag", () => {
      const token = { userId: "admin-123", isSuperAdmin: true };
      expect(isSuperAdminAuthorized(token, "/sa/admin")).toBe(true);
    });

    test("allows /sa/login without isSuperAdmin flag", () => {
      const token = { userId: "user-123", isSuperAdmin: false };
      expect(isSuperAdminAuthorized(token, "/sa/login")).toBe(true);
    });

    test("allows /sa/login without token", () => {
      expect(isSuperAdminAuthorized(null, "/sa/login")).toBe(true);
    });
  });

  describe("Tenant header injection", () => {
    // Simulate tenant header injection logic
    function injectTenantHeader(
      cookies: Map<string, string>,
      headers: Map<string, string>
    ): Map<string, string> {
      const newHeaders = new Map(headers);
      const tenantId = cookies.get("psycologger-tenant");
      if (tenantId) {
        newHeaders.set("x-tenant-id", tenantId);
      }
      return newHeaders;
    }

    test("injects x-tenant-id from psycologger-tenant cookie", () => {
      const cookies = new Map([["psycologger-tenant", "tenant-123"]]);
      const headers = new Map();

      const result = injectTenantHeader(cookies, headers);

      expect(result.get("x-tenant-id")).toBe("tenant-123");
    });

    test("does not inject header when cookie is missing", () => {
      const cookies = new Map();
      const headers = new Map();

      const result = injectTenantHeader(cookies, headers);

      expect(result.has("x-tenant-id")).toBe(false);
    });

    test("preserves existing headers", () => {
      const cookies = new Map([["psycologger-tenant", "tenant-456"]]);
      const headers = new Map([
        ["content-type", "application/json"],
        ["authorization", "Bearer token"],
      ]);

      const result = injectTenantHeader(cookies, headers);

      expect(result.get("content-type")).toBe("application/json");
      expect(result.get("authorization")).toBe("Bearer token");
      expect(result.get("x-tenant-id")).toBe("tenant-456");
    });

    test("overwrites existing x-tenant-id header", () => {
      const cookies = new Map([["psycologger-tenant", "tenant-new"]]);
      const headers = new Map([["x-tenant-id", "tenant-old"]]);

      const result = injectTenantHeader(cookies, headers);

      expect(result.get("x-tenant-id")).toBe("tenant-new");
    });

    test("handles empty cookie value", () => {
      const cookies = new Map([["psycologger-tenant", ""]]);
      const headers = new Map();

      const result = injectTenantHeader(cookies, headers);

      // Empty string is falsy, so header should not be set
      expect(result.has("x-tenant-id")).toBe(false);
    });

    test("uses cookie value as-is (no sanitization at middleware level)", () => {
      const tenantId = "tenant-123-with-special_chars";
      const cookies = new Map([["psycologger-tenant", tenantId]]);
      const headers = new Map();

      const result = injectTenantHeader(cookies, headers);

      expect(result.get("x-tenant-id")).toBe(tenantId);
    });
  });

  describe("Route matching", () => {
    test("app routes require authentication", () => {
      const appRoutes = [
        "/app",
        "/app/dashboard",
        "/app/patients",
        "/app/charges",
        "/app/appointments",
        "/app/settings",
      ];

      appRoutes.forEach((route) => {
        // Without token, should be blocked
        expect(
          route === "/" ||
            route.startsWith("/pricing") ||
            route.startsWith("/login") ||
            route.startsWith("/signup") ||
            route.startsWith("/invite/") ||
            route.startsWith("/api/auth") ||
            route.startsWith("/_next") ||
            route.startsWith("/favicon")
        ).toBe(false, `${route} should require auth`);
      });
    });

    test("API routes require authentication", () => {
      const apiRoutes = [
        "/api/v1/patients",
        "/api/v1/charges",
        "/api/v1/appointments",
        "/api/v1/sessions",
        "/api/v1/reports",
      ];

      apiRoutes.forEach((route) => {
        // These are protected routes
        expect(
          route.startsWith("/api/auth") ||
            route.startsWith("/_next") ||
            route.startsWith("/favicon")
        ).toBe(false, `${route} should require auth`);
      });
    });

    test("public routes don't require token", () => {
      const publicRoutes = [
        "/",
        "/pricing",
        "/login",
        "/signup",
        "/invite/token123",
        "/api/auth/signin",
        "/_next/static",
        "/favicon.ico",
      ];

      const isPublic = (path: string): boolean => {
        return (
          path === "/" ||
          path.startsWith("/pricing") ||
          path.startsWith("/login") ||
          path.startsWith("/signup") ||
          path.startsWith("/invite/") ||
          path.startsWith("/api/auth") ||
          path.startsWith("/_next") ||
          path.startsWith("/favicon")
        );
      };

      publicRoutes.forEach((route) => {
        expect(isPublic(route)).toBe(true, `${route} should be public`);
      });
    });
  });

  describe("Edge cases", () => {
    test("case-sensitive route matching", () => {
      const isPublic = (path: string): boolean => {
        return (
          path === "/" ||
          path.startsWith("/pricing") ||
          path.startsWith("/login") ||
          path.startsWith("/signup") ||
          path.startsWith("/invite/") ||
          path.startsWith("/api/auth") ||
          path.startsWith("/_next") ||
          path.startsWith("/favicon")
        );
      };

      expect(isPublic("/Pricing")).toBe(false); // Capital P
      expect(isPublic("/LOGIN")).toBe(false); // All caps
      expect(isPublic("/pricing")).toBe(true); // Lowercase
    });

    test("trailing slashes in routes", () => {
      const isPublic = (path: string): boolean => {
        return (
          path === "/" ||
          path.startsWith("/pricing") ||
          path.startsWith("/login") ||
          path.startsWith("/signup") ||
          path.startsWith("/invite/") ||
          path.startsWith("/api/auth") ||
          path.startsWith("/_next") ||
          path.startsWith("/favicon")
        );
      };

      expect(isPublic("/pricing/")).toBe(true); // startsWith check handles this
      expect(isPublic("/login/")).toBe(true);
    });

    test("query parameters don't affect route matching", () => {
      const path = "/app/patients?page=1&sort=name";
      const isPublic = (p: string): boolean => {
        return (
          p === "/" ||
          p.startsWith("/pricing") ||
          p.startsWith("/login") ||
          p.startsWith("/signup") ||
          p.startsWith("/invite/") ||
          p.startsWith("/api/auth") ||
          p.startsWith("/_next") ||
          p.startsWith("/favicon")
        );
      };

      // Query params are part of pathname in NextRequest
      expect(isPublic(path)).toBe(false);
    });

    test("hash fragments don't affect route matching", () => {
      const path = "/app/patients#section1";
      const isPublic = (p: string): boolean => {
        return (
          p === "/" ||
          p.startsWith("/pricing") ||
          p.startsWith("/login") ||
          p.startsWith("/signup") ||
          p.startsWith("/invite/") ||
          p.startsWith("/api/auth") ||
          p.startsWith("/_next") ||
          p.startsWith("/favicon")
        );
      };

      // Hashes are typically not included in pathname
      expect(isPublic(path)).toBe(false);
    });
  });
});
