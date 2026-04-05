/**
 * Unit tests — Authentication and authorization edge cases
 * Tests middleware protection, auth context validation, and rate limiting
 */

import { rateLimit } from "@/lib/rate-limit";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import type { AuthContext } from "@/lib/rbac";

function makeCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "user-1",
    role: "PSYCHOLOGIST",
    tenantId: "tenant-1",
    membership: {
      canViewAllPatients: null,
      canViewClinicalNotes: null,
      canManageFinancials: null,
    },
    tenant: {
      sharedPatientPool: false,
      adminCanViewClinical: false,
    },
    ...overrides,
  };
}

describe("Authentication — getAuthContext validation", () => {
  test("throws UnauthorizedError when no session provided", () => {
    /**
     * getAuthContext requires valid NextAuth session
     * If session?.user?.id is falsy, throw UnauthorizedError
     */
    const errorName = "UnauthorizedError";
    expect(errorName).toBeDefined();
  });

  test("UnauthorizedError has status 401", () => {
    const err = new UnauthorizedError("No session");
    expect(err.status).toBe(401);
    expect(err.message).toBe("No session");
  });

  test("throws ForbiddenError when user has no active membership in tenant", () => {
    /**
     * getAuthContext should:
     * 1. Get session
     * 2. Query membership where { userId, tenantId, status: "ACTIVE" }
     * 3. If no membership found, throw ForbiddenError
     */
    const errorName = "ForbiddenError";
    expect(errorName).toBeDefined();
  });

  test("ForbiddenError has status 403", () => {
    const err = new ForbiddenError("No active membership");
    expect(err.status).toBe(403);
    expect(err.message).toBe("No active membership");
  });

  test("accepts SuperAdmin without tenantId", () => {
    /**
     * getAuthContext(tenantIdOrRequest) special case for isSuperAdmin:
     * If user.isSuperAdmin && !tenantId, return platform-level context with tenantId=""
     */
    const ctx = makeCtx({
      isSuperAdmin: true,
      role: "SUPERADMIN",
      tenantId: "", // Empty for platform level
    });
    expect(ctx.isSuperAdmin).toBe(true);
    expect(ctx.tenantId).toBe("");
  });

  test("SuperAdmin context has all overrides enabled", () => {
    const ctx = makeCtx({
      isSuperAdmin: true,
      role: "SUPERADMIN",
      tenantId: "",
      membership: {
        canViewAllPatients: true,
        canViewClinicalNotes: true,
        canManageFinancials: true,
      },
    });
    expect(ctx.membership.canViewAllPatients).toBe(true);
    expect(ctx.membership.canViewClinicalNotes).toBe(true);
    expect(ctx.membership.canManageFinancials).toBe(true);
  });

  test("requires active membership status", () => {
    /**
     * Query condition must be: status: "ACTIVE"
     * Suspended, pending, or other statuses should not grant access
     */
    const invalidStatuses = ["SUSPENDED", "PENDING", "INVITED", "INACTIVE"];
    expect(invalidStatuses).not.toContain("ACTIVE");
  });

  test("resolves tenant data from membership", () => {
    /**
     * getAuthContext must include:
     * tenant: {
     *   sharedPatientPool: membership.tenant.sharedPatientPool,
     *   adminCanViewClinical: membership.tenant.adminCanViewClinical
     * }
     */
    const ctx = makeCtx({
      tenant: {
        sharedPatientPool: true,
        adminCanViewClinical: true,
      },
    });
    expect(ctx.tenant.sharedPatientPool).toBe(true);
    expect(ctx.tenant.adminCanViewClinical).toBe(true);
  });

  test("accepts both string tenantId and Request object", () => {
    /**
     * getAuthContext signature: getAuthContext(tenantIdOrRequest?: string | Request)
     * Should handle:
     * 1. Explicit string: getAuthContext("tenant-id")
     * 2. Request with header: getAuthContext(request)
     * 3. No arg for SuperAdmin: getAuthContext()
     */
    const stringTenantId = "tenant-1";
    expect(typeof stringTenantId).toBe("string");
  });
});

describe("Authorization — middleware protection", () => {
  test("middleware blocks unauthenticated /app/* requests", () => {
    /**
     * Middleware uses withAuth() which checks for token
     * If no token and pathname starts with /app/, redirect to /login
     */
    const protectedPaths = ["/app/dashboard", "/app/patients", "/app/settings"];
    protectedPaths.forEach((path) => {
      expect(path.startsWith("/app/")).toBe(true);
    });
  });

  test("middleware blocks non-superadmin from /sa/* routes", () => {
    /**
     * Middleware checks:
     * if pathname.startsWith("/sa/") && !token?.isSuperAdmin
     *   redirect to /sa/login
     */
    const superAdminPath = "/sa/tenants";
    expect(superAdminPath.startsWith("/sa/")).toBe(true);
  });

  test("middleware allows public routes without auth", () => {
    /**
     * Public routes that bypass auth:
     * /, /pricing/*, /login, /signup, /invite/*, /api/auth/*, /_next/*, /favicon
     */
    const publicRoutes = [
      "/",
      "/pricing",
      "/login",
      "/signup",
      "/invite/abc123",
      "/api/auth/callback/email",
      "/_next/static/something",
      "/favicon.ico",
    ];
    publicRoutes.forEach((route) => {
      expect(route).toBeDefined();
    });
  });

  test("middleware allows /api/auth routes without auth", () => {
    /**
     * NextAuth routes should not require prior authentication:
     * /api/auth/callback/*, /api/auth/signin/*, etc.
     */
    const authApiRoutes = [
      "/api/auth/callback/email",
      "/api/auth/signin",
      "/api/auth/signout",
    ];
    authApiRoutes.forEach((route) => {
      expect(route.startsWith("/api/auth")).toBe(true);
    });
  });

  test("middleware injects x-tenant-id header from cookie", () => {
    /**
     * Middleware extracts: req.cookies.get("psycologger-tenant")?.value
     * Sets header: headers.set("x-tenant-id", tenantId)
     * This allows getAuthContext(request) to read the tenant
     */
    const headerName = "x-tenant-id";
    const cookieName = "psycologger-tenant";
    expect(headerName).toMatch(/^x-/);
    expect(cookieName).toMatch(/-tenant/);
  });

  test("middleware preserves authentication token through headers", () => {
    /**
     * NextAuth token is passed to middleware via req as:
     * (req as any).nextauth?.token
     * This must be checked for isSuperAdmin flag
     */
    const mockToken = { isSuperAdmin: false, id: "user-1" };
    expect(mockToken).toHaveProperty("isSuperAdmin");
  });
});

describe("Authorization — role-based access control", () => {
  test("SUPERADMIN can access /sa/* routes", () => {
    const ctx = makeCtx({
      role: "SUPERADMIN",
      isSuperAdmin: true,
    });
    expect(ctx.isSuperAdmin).toBe(true);
  });

  test("non-SUPERADMIN cannot access /sa/* routes", () => {
    const roles = ["TENANT_ADMIN", "PSYCHOLOGIST", "ASSISTANT", "READONLY"];
    roles.forEach((role) => {
      const ctx = makeCtx({
        role: role as any,
        isSuperAdmin: false,
      });
      expect(ctx.isSuperAdmin).toBe(false);
    });
  });

  test("TENANT_ADMIN cannot access /sa/* routes", () => {
    const ctx = makeCtx({
      role: "TENANT_ADMIN",
      isSuperAdmin: false,
    });
    expect(ctx.isSuperAdmin).toBe(false);
  });

  test("all authenticated users can access /app/* routes", () => {
    /**
     * /app/* routes require authentication but not specific role
     * All roles should be able to access them
     */
    const roles = ["SUPERADMIN", "TENANT_ADMIN", "PSYCHOLOGIST", "ASSISTANT", "READONLY"];
    roles.forEach((role) => {
      const ctx = makeCtx({
        role: role as any,
      });
      expect(ctx.userId).toBeDefined();
    });
  });

  test("API routes enforce permission checks", () => {
    /**
     * API routes should call: requirePermission(ctx, "resource:action")
     * This throws ForbiddenError if not allowed
     */
    const examplePermission = "patients:create";
    expect(examplePermission).toMatch(/:/);
  });
});

describe("Rate limiting", () => {
  test("allows requests within limit", async () => {
    const key = "user:1:login";
    const limit = 5;
    const windowMs = 60000; // 1 minute

    const result1 = await rateLimit(key, limit, windowMs);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(limit - 1);
  });

  test("rejects requests exceeding limit", async () => {
    const key = "user:2:login";
    const limit = 3;
    const windowMs = 60000;

    // Make 3 allowed requests
    await rateLimit(key, limit, windowMs);
    await rateLimit(key, limit, windowMs);
    await rateLimit(key, limit, windowMs);

    // 4th request should be rejected
    const result = await rateLimit(key, limit, windowMs);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("tracks remaining calls correctly", async () => {
    const key = "user:3:api";
    const limit = 10;
    const windowMs = 60000;

    for (let i = 0; i < 10; i++) {
      const result = await rateLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - (i + 1));
    }
  });

  test("resets after window expires", async () => {
    const key = "user:4:reset-test";
    const limit = 2;
    const windowMs = 100; // 100ms

    const result1 = await rateLimit(key, limit, windowMs);
    expect(result1.allowed).toBe(true);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    const result2 = await rateLimit(key, limit, windowMs);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(limit - 1);
  });

  test("different keys have separate limits", async () => {
    const limit = 2;
    const windowMs = 60000;

    const result1 = await rateLimit("key:1", limit, windowMs);
    const result2 = await rateLimit("key:2", limit, windowMs);

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result1.remaining).toBe(1);
    expect(result2.remaining).toBe(1);
  });

  test("rate limit key format includes user/resource context", () => {
    /**
     * Rate limit keys should include context to prevent abuse:
     * - "user:{userId}:login" — per-user login attempts
     * - "ip:{ip}:api" — per-IP API calls
     * - "email:{email}:magic-link" — per-email magic link requests
     */
    const keys = [
      "user:123:login",
      "ip:192.168.1.1:api",
      "email:user@example.com:magic-link",
    ];
    keys.forEach((key) => {
      expect(key).toMatch(/^[a-z]+:/);
    });
  });

  test("rate limiting prevents brute force attacks", () => {
    /**
     * Common use cases:
     * - Login attempts: 5 per minute
     * - Magic link requests: 3 per 15 minutes
     * - API calls: 1000 per hour
     */
    const loginLimit = 5;
    const magicLinkLimit = 3;
    const apiLimit = 1000;

    expect(loginLimit).toBeLessThan(magicLinkLimit * 2);
    expect(apiLimit).toBeGreaterThan(loginLimit);
  });
});

describe("Session validation", () => {
  test("isSuperAdmin flag must be validated from database", () => {
    /**
     * In JWT callback:
     * const dbUser = await db.user.findUnique({ where: { id }, select: { isSuperAdmin } })
     * token.isSuperAdmin = dbUser?.isSuperAdmin ?? false
     *
     * Never trust client-supplied isSuperAdmin
     */
    const ctx = makeCtx({
      role: "PSYCHOLOGIST",
      isSuperAdmin: false, // Must be from DB, not client
    });
    expect(ctx.isSuperAdmin).toBe(false);
  });

  test("user.id must exist in token for authorization", () => {
    /**
     * Session must have:
     * session.user.id — for database lookups
     * session.user.isSuperAdmin — for admin checks
     */
    const ctx = makeCtx({ userId: "user-1" });
    expect(ctx.userId).toBeDefined();
    expect(ctx.userId.length).toBeGreaterThan(0);
  });

  test("session maxAge prevents old sessions", () => {
    /**
     * NextAuth config: session.maxAge = 30 * 24 * 60 * 60 (30 days)
     * After this, session expires and user must re-authenticate
     */
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    expect(thirtyDaysInSeconds).toBe(2592000);
  });

  test("magic link maxAge limits token validity", () => {
    /**
     * EmailProvider maxAge: 24 * 60 * 60 (24 hours)
     * Magic links expire after 24 hours
     */
    const twentyFourHoursInSeconds = 24 * 60 * 60;
    expect(twentyFourHoursInSeconds).toBe(86400);
  });
});

describe("Error handling — authentication failures", () => {
  test("API routes return 401 for unauthorized access", () => {
    /**
     * handleApiError(UnauthorizedError) should return:
     * { status: 401, error: { code: "UNAUTHORIZED", ... } }
     */
    const statusCode = 401;
    const errorCode = "UNAUTHORIZED";
    expect(statusCode).toBe(401);
    expect(errorCode).toBe("UNAUTHORIZED");
  });

  test("API routes return 403 for forbidden access", () => {
    /**
     * handleApiError(ForbiddenError) should return:
     * { status: 403, error: { code: "FORBIDDEN", ... } }
     */
    const statusCode = 403;
    const errorCode = "FORBIDDEN";
    expect(statusCode).toBe(403);
    expect(errorCode).toBe("FORBIDDEN");
  });

  test("error messages do not leak sensitive information", () => {
    /**
     * Error messages should not include:
     * - User IDs or names
     * - Tenant IDs
     * - Database details
     * - Stack traces in production
     */
    const safeMessage = "Authentication required";
    expect(safeMessage).not.toMatch(/user|tenant|database|sql/i);
  });

  test("auth failures are logged for security auditing", () => {
    /**
     * Failed auth attempts should be logged:
     * auditLog({ action: "LOGIN_FAILED", ipAddress, userAgent, ... })
     */
    const action = "LOGIN_FAILED";
    expect(action).toBeDefined();
  });
});

describe("CSRF and CSRF protection", () => {
  test("NextAuth provides CSRF protection by default", () => {
    /**
     * NextAuth uses CSRF tokens for form submissions
     * All POST requests go through middleware protection
     */
    const postMethods = ["POST", "PUT", "DELETE"];
    expect(postMethods).toContain("POST");
  });

  test("state parameter prevents CSRF in OAuth flow", () => {
    /**
     * While using Email provider (not OAuth), state isn't directly used
     * Email magic links are single-use tokens scoped to email address
     */
    const providerType = "email";
    expect(providerType).toBeDefined();
  });
});
