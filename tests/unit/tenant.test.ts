/**
 * Unit tests — Tenant resolution (src/lib/tenant.ts)
 * Tests: getAuthContext, getUserMemberships, getTenantBySlug
 * - Verifies auth context resolution
 * - Tests tenant header injection from request
 * - Tests error cases (unauthorized, no membership)
 * - Tests superadmin access
 */

// Mock all dependencies BEFORE imports
jest.mock("@/lib/db", () => ({
  db: {
    membership: { findFirst: jest.fn(), findMany: jest.fn() },
    tenant: { findUnique: jest.fn() },
  },
}));
jest.mock("next-auth");
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: jest.fn() }));
jest.mock("next-auth/providers/email", () => ({ default: jest.fn() }));
jest.mock("resend", () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: jest.fn() } })) }));

import { NextRequest } from "next/server";
import { getAuthContext, getUserMemberships, getTenantBySlug } from "@/lib/tenant";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import * as nextAuth from "next-auth";
import { db } from "@/lib/db";

describe("Tenant resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── getAuthContext ───────────────────────────────────────────────────────

  describe("getAuthContext", () => {
    test("returns full auth context with valid session and membership", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: "user-123", isSuperAdmin: false },
      });

      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findFirst.mockResolvedValueOnce({
        id: "mem-123",
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        canViewAllPatients: false,
        canViewClinicalNotes: true,
        canManageFinancials: false,
        status: "ACTIVE",
        tenant: {
          id: "tenant-456",
          sharedPatientPool: false,
          adminCanViewClinical: true,
        },
      } as any);

      const ctx = await getAuthContext("tenant-456");

      expect(ctx.userId).toBe("user-123");
      expect(ctx.role).toBe("PSYCHOLOGIST");
      expect(ctx.tenantId).toBe("tenant-456");
      expect(ctx.membership.canViewClinicalNotes).toBe(true);
      expect(ctx.tenant.sharedPatientPool).toBe(false);
      expect(ctx.isSuperAdmin).toBe(false);
    });

    test("throws UnauthorizedError when no session", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce(null);

      await expect(getAuthContext("tenant-123")).rejects.toThrow(UnauthorizedError);
    });

    test("throws UnauthorizedError when no user ID in session", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({ user: { id: null } });

      await expect(getAuthContext("tenant-123")).rejects.toThrow(UnauthorizedError);
    });

    test("throws ForbiddenError when no active membership", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: "user-123", isSuperAdmin: false },
      });

      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findFirst.mockResolvedValueOnce(null);

      await expect(getAuthContext("tenant-999")).rejects.toThrow(ForbiddenError);
    });

    test("allows superadmin without tenant membership", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: "admin-user", isSuperAdmin: true },
      });

      const ctx = await getAuthContext("");

      expect(ctx.userId).toBe("admin-user");
      expect(ctx.role).toBe("SUPERADMIN");
      expect(ctx.tenantId).toBe("");
      expect(ctx.isSuperAdmin).toBe(true);
      expect(ctx.membership.canViewAllPatients).toBe(true);
      expect(ctx.membership.canManageFinancials).toBe(true);
    });

    test("extracts tenant ID from Request header when Request object passed", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: "user-123", isSuperAdmin: false },
      });

      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findFirst.mockResolvedValueOnce({
        id: "mem-123",
        userId: "user-123",
        tenantId: "tenant-from-header",
        role: "TENANT_ADMIN",
        canViewAllPatients: true,
        canViewClinicalNotes: true,
        canManageFinancials: true,
        status: "ACTIVE",
        tenant: {
          id: "tenant-from-header",
          sharedPatientPool: true,
          adminCanViewClinical: true,
        },
      } as any);

      const req = new NextRequest("http://localhost:3000/api/test", {
        headers: { "x-tenant-id": "tenant-from-header" },
      });

      const ctx = await getAuthContext(req);

      expect(ctx.tenantId).toBe("tenant-from-header");
      expect(mockDb.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-from-header" }),
        })
      );
    });

    test("handles Request with no x-tenant-id header", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: "user-123", isSuperAdmin: false },
      });

      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findFirst.mockResolvedValueOnce({
        id: "mem-123",
        userId: "user-123",
        tenantId: "user-default-tenant",
        role: "PSYCHOLOGIST",
        canViewAllPatients: false,
        canViewClinicalNotes: true,
        canManageFinancials: false,
        status: "ACTIVE",
        tenant: {
          id: "user-default-tenant",
          sharedPatientPool: false,
          adminCanViewClinical: false,
        },
      } as any);

      const mockRequest = {
        headers: new Map(),
      } as any;

      const ctx = await getAuthContext(mockRequest);

      expect(ctx.tenantId).toBe("user-default-tenant");
    });

    test("includes all membership permissions in returned context", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: "user-123", isSuperAdmin: false },
      });

      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findFirst.mockResolvedValueOnce({
        id: "mem-123",
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        canViewAllPatients: true,
        canViewClinicalNotes: false,
        canManageFinancials: true,
        status: "ACTIVE",
        tenant: {
          id: "tenant-456",
          sharedPatientPool: true,
          adminCanViewClinical: false,
        },
      } as any);

      const ctx = await getAuthContext("tenant-456");

      expect(ctx.membership).toEqual({
        canViewAllPatients: true,
        canViewClinicalNotes: false,
        canManageFinancials: true,
      });
      expect(ctx.tenant).toEqual({
        sharedPatientPool: true,
        adminCanViewClinical: false,
      });
    });
  });

  // ─── getUserMemberships ───────────────────────────────────────────────────

  describe("getUserMemberships", () => {
    test("returns list of active memberships for user", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findMany.mockResolvedValueOnce([
        {
          id: "mem-1",
          userId: "user-123",
          tenantId: "tenant-1",
          role: "TENANT_ADMIN",
          status: "ACTIVE",
          tenant: {
            id: "tenant-1",
            name: "Clinic A",
            slug: "clinic-a",
          },
        },
        {
          id: "mem-2",
          userId: "user-123",
          tenantId: "tenant-2",
          role: "PSYCHOLOGIST",
          status: "ACTIVE",
          tenant: {
            id: "tenant-2",
            name: "Clinic B",
            slug: "clinic-b",
          },
        },
      ] as any);

      const memberships = await getUserMemberships("user-123");

      expect(memberships).toHaveLength(2);
      expect(memberships[0].tenant.name).toBe("Clinic A");
      expect(memberships[1].tenant.name).toBe("Clinic B");
    });

    test("filters only ACTIVE memberships", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findMany.mockResolvedValueOnce([
        {
          id: "mem-1",
          userId: "user-123",
          tenantId: "tenant-1",
          role: "TENANT_ADMIN",
          status: "ACTIVE",
          tenant: { id: "tenant-1", name: "Active", slug: "active" },
        },
      ] as any);

      const memberships = await getUserMemberships("user-123");

      expect(mockDb.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "ACTIVE" }),
        })
      );
    });

    test("orders memberships by createdAt", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findMany.mockResolvedValueOnce([]);

      await getUserMemberships("user-123");

      expect(mockDb.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "asc" },
        })
      );
    });

    test("returns empty array when user has no memberships", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findMany.mockResolvedValueOnce([]);

      const memberships = await getUserMemberships("user-with-no-memberships");

      expect(memberships).toEqual([]);
    });

    test("includes tenant details for tenant switching", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findMany.mockResolvedValueOnce([
        {
          id: "mem-1",
          userId: "user-123",
          tenantId: "tenant-1",
          role: "TENANT_ADMIN",
          status: "ACTIVE",
          tenant: {
            id: "tenant-1",
            name: "Clínica Principal",
            slug: "clinica-principal",
          },
        },
      ] as any);

      const memberships = await getUserMemberships("user-123");

      expect(memberships[0].tenant.id).toBeDefined();
      expect(memberships[0].tenant.name).toBeDefined();
      expect(memberships[0].tenant.slug).toBeDefined();
    });
  });

  // ─── getTenantBySlug ───────────────────────────────────────────────────────

  describe("getTenantBySlug", () => {
    test("returns tenant by slug", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.tenant.findUnique.mockResolvedValueOnce({
        id: "tenant-456",
        slug: "clinic-alpha",
        name: "Clinic Alpha",
      } as any);

      const tenant = await getTenantBySlug("clinic-alpha");

      expect(tenant?.id).toBe("tenant-456");
      expect(tenant?.slug).toBe("clinic-alpha");
      expect(tenant?.name).toBe("Clinic Alpha");
    });

    test("queries with correct where clause", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.tenant.findUnique.mockResolvedValueOnce(null);

      await getTenantBySlug("test-slug");

      expect(mockDb.tenant.findUnique).toHaveBeenCalledWith({
        where: { slug: "test-slug" },
      });
    });

    test("returns null when tenant not found", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.tenant.findUnique.mockResolvedValueOnce(null);

      const tenant = await getTenantBySlug("nonexistent-slug");

      expect(tenant).toBeNull();
    });

    test("handles slug with special characters", async () => {
      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.tenant.findUnique.mockResolvedValueOnce({
        id: "tenant-789",
        slug: "clinic-123-test",
        name: "Clinic 123 Test",
      } as any);

      const tenant = await getTenantBySlug("clinic-123-test");

      expect(tenant?.slug).toBe("clinic-123-test");
    });
  });

  // ─── Tenant isolation ──────────────────────────────────────────────────────

  describe("Tenant isolation", () => {
    test("getAuthContext ensures user belongs to requested tenant", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: "user-123", isSuperAdmin: false },
      });

      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findFirst.mockResolvedValueOnce({
        id: "mem-123",
        userId: "user-123",
        tenantId: "tenant-ABC",
        role: "PSYCHOLOGIST",
        canViewAllPatients: false,
        canViewClinicalNotes: true,
        canManageFinancials: false,
        status: "ACTIVE",
        tenant: {
          id: "tenant-ABC",
          sharedPatientPool: false,
          adminCanViewClinical: true,
        },
      } as any);

      const ctx = await getAuthContext("tenant-ABC");

      expect(mockDb.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-123",
            tenantId: "tenant-ABC",
            status: "ACTIVE",
          }),
        })
      );
      expect(ctx.tenantId).toBe("tenant-ABC");
    });

    test("prevents user from accessing tenant they don't belong to", async () => {
      const mockGetServerSession = nextAuth.getServerSession as jest.Mock;
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: "user-123", isSuperAdmin: false },
      });

      const mockDb = db as jest.Mocked<typeof db>;
      mockDb.membership.findFirst.mockResolvedValueOnce(null); // No membership in requested tenant

      await expect(getAuthContext("tenant-XYZ")).rejects.toThrow(ForbiddenError);
    });
  });
});
