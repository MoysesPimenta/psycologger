/**
 * Unit tests — RBAC guards and permission checks
 * Tests can() and requirePermission() for different roles and permissions.
 */

import { can, requirePermission, ForbiddenError, type AuthContext, type Permission } from "@/lib/rbac";

/**
 * Helper to create a mock AuthContext for testing.
 */
function makeCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "user-123",
    role: "PSYCHOLOGIST",
    tenantId: "tenant-abc",
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

describe("RBAC — permission checks", () => {
  describe("SUPERADMIN role", () => {
    test("SUPERADMIN can access any permission", () => {
      const ctx = makeCtx({ role: "SUPERADMIN" });

      const permissions: Permission[] = [
        "tenant:view",
        "tenant:edit",
        "users:invite",
        "patients:list",
        "sessions:view",
        "sa:impersonate",
        "nfse:issue",
      ];

      for (const perm of permissions) {
        expect(can(ctx, perm)).toBe(true);
      }
    });

    test("SUPERADMIN isSuperAdmin flag bypasses all checks", () => {
      const ctx = makeCtx({ role: "READONLY", isSuperAdmin: true });

      // Even READONLY with isSuperAdmin flag can do everything
      expect(can(ctx, "tenant:edit")).toBe(true);
      expect(can(ctx, "sa:manageTenants")).toBe(true);
    });
  });

  describe("TENANT_ADMIN role", () => {
    test("TENANT_ADMIN can manage tenant and users", () => {
      const ctx = makeCtx({ role: "TENANT_ADMIN" });

      expect(can(ctx, "tenant:view")).toBe(true);
      expect(can(ctx, "tenant:edit")).toBe(true);
      expect(can(ctx, "users:invite")).toBe(true);
      expect(can(ctx, "users:view")).toBe(true);
      expect(can(ctx, "users:editRole")).toBe(true);
    });

    test("TENANT_ADMIN can manage patients and appointments", () => {
      const ctx = makeCtx({ role: "TENANT_ADMIN" });

      expect(can(ctx, "patients:list")).toBe(true);
      expect(can(ctx, "patients:create")).toBe(true);
      expect(can(ctx, "patients:edit")).toBe(true);
      expect(can(ctx, "patients:archive")).toBe(true);
      expect(can(ctx, "patients:viewAll")).toBe(true);

      expect(can(ctx, "appointments:view")).toBe(true);
      expect(can(ctx, "appointments:create")).toBe(true);
      expect(can(ctx, "appointments:cancel")).toBe(true);
    });

    test("TENANT_ADMIN can manage financial data", () => {
      const ctx = makeCtx({ role: "TENANT_ADMIN" });

      expect(can(ctx, "charges:view")).toBe(true);
      expect(can(ctx, "charges:create")).toBe(true);
      expect(can(ctx, "charges:edit")).toBe(true);
      expect(can(ctx, "payments:view")).toBe(true);
      expect(can(ctx, "payments:create")).toBe(true);
    });

    test("TENANT_ADMIN has conditional sessions:view (depends on tenant setting)", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { adminCanViewClinical: false, sharedPatientPool: false },
      });

      // adminCanViewClinical = false
      expect(can(ctx, "sessions:view")).toBe(false);

      // Enable tenant setting
      const ctx2 = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { adminCanViewClinical: true, sharedPatientPool: false },
      });
      expect(can(ctx2, "sessions:view")).toBe(true);

      // Membership override trumps tenant setting
      const ctx3 = makeCtx({
        role: "TENANT_ADMIN",
        membership: { canViewClinicalNotes: true, canViewAllPatients: null, canManageFinancials: null },
        tenant: { adminCanViewClinical: false, sharedPatientPool: false },
      });
      expect(can(ctx3, "sessions:view")).toBe(true);
    });

    test("TENANT_ADMIN cannot access superadmin features", () => {
      const ctx = makeCtx({ role: "TENANT_ADMIN" });

      expect(can(ctx, "sa:impersonate")).toBe(false);
      expect(can(ctx, "sa:viewAllTenants")).toBe(false);
      expect(can(ctx, "sa:manageTenants")).toBe(false);
    });
  });

  describe("PSYCHOLOGIST role", () => {
    test("PSYCHOLOGIST can view and create sessions", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });

      expect(can(ctx, "sessions:view")).toBe(true);
      expect(can(ctx, "sessions:create")).toBe(true);
      expect(can(ctx, "sessions:edit")).toBe(true);
      expect(can(ctx, "sessions:viewRevisions")).toBe(true);
    });

    test("PSYCHOLOGIST can manage patients and appointments", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });

      expect(can(ctx, "patients:list")).toBe(true);
      expect(can(ctx, "patients:create")).toBe(true);
      expect(can(ctx, "patients:edit")).toBe(true);
      expect(can(ctx, "appointments:view")).toBe(true);
      expect(can(ctx, "appointments:create")).toBe(true);
    });

    test("PSYCHOLOGIST can manage financial data", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });

      expect(can(ctx, "charges:view")).toBe(true);
      expect(can(ctx, "charges:create")).toBe(true);
      expect(can(ctx, "payments:view")).toBe(true);
      expect(can(ctx, "payments:create")).toBe(true);
    });

    test("PSYCHOLOGIST can download clinical files", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });

      expect(can(ctx, "files:uploadClinical")).toBe(true);
      expect(can(ctx, "files:downloadClinical")).toBe(true);
    });

    test("PSYCHOLOGIST cannot manage users", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });

      expect(can(ctx, "users:invite")).toBe(false);
      expect(can(ctx, "users:editRole")).toBe(false);
    });

    test("PSYCHOLOGIST cannot edit tenant settings", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });

      expect(can(ctx, "tenant:edit")).toBe(false);
      expect(can(ctx, "integrations:configure")).toBe(false);
    });
  });

  describe("ASSISTANT role", () => {
    test("ASSISTANT can manage patients and appointments", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });

      expect(can(ctx, "patients:list")).toBe(true);
      expect(can(ctx, "patients:create")).toBe(true);
      expect(can(ctx, "appointments:view")).toBe(true);
      expect(can(ctx, "appointments:create")).toBe(true);
    });

    test("ASSISTANT can manage financial data", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });

      expect(can(ctx, "charges:view")).toBe(true);
      expect(can(ctx, "charges:create")).toBe(true);
      expect(can(ctx, "payments:view")).toBe(true);
    });

    test("ASSISTANT cannot create clinical sessions", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });

      expect(can(ctx, "sessions:create")).toBe(false);
      expect(can(ctx, "sessions:edit")).toBe(false);
    });

    test("ASSISTANT has conditional sessions:view (membership override)", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });

      // Default: cannot view sessions
      expect(can(ctx, "sessions:view")).toBe(false);

      // Membership override: can view
      const ctx2 = makeCtx({
        role: "ASSISTANT",
        membership: { canViewClinicalNotes: true, canViewAllPatients: null, canManageFinancials: null },
      });
      expect(can(ctx2, "sessions:view")).toBe(true);
    });

    test("ASSISTANT cannot upload/download clinical files without override", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });

      expect(can(ctx, "files:uploadClinical")).toBe(false);
      expect(can(ctx, "files:downloadClinical")).toBe(false);

      // With override
      const ctx2 = makeCtx({
        role: "ASSISTANT",
        membership: { canViewClinicalNotes: true, canViewAllPatients: null, canManageFinancials: null },
      });
      expect(can(ctx2, "files:downloadClinical")).toBe(true);
    });

    test("ASSISTANT cannot manage users or tenant", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });

      expect(can(ctx, "users:invite")).toBe(false);
      expect(can(ctx, "tenant:edit")).toBe(false);
      expect(can(ctx, "integrations:configure")).toBe(false);
    });
  });

  describe("READONLY role", () => {
    test("READONLY can view patients, appointments, and reports", () => {
      const ctx = makeCtx({ role: "READONLY" });

      expect(can(ctx, "patients:list")).toBe(true);
      expect(can(ctx, "appointments:view")).toBe(true);
      expect(can(ctx, "reports:view")).toBe(true);
      expect(can(ctx, "charges:view")).toBe(true);
    });

    test("READONLY cannot create or edit anything", () => {
      const ctx = makeCtx({ role: "READONLY" });

      expect(can(ctx, "patients:create")).toBe(false);
      expect(can(ctx, "appointments:create")).toBe(false);
      expect(can(ctx, "sessions:create")).toBe(false);
      expect(can(ctx, "charges:create")).toBe(false);
    });

    test("READONLY cannot access clinical notes", () => {
      const ctx = makeCtx({ role: "READONLY" });

      expect(can(ctx, "sessions:view")).toBe(false);
      expect(can(ctx, "files:downloadClinical")).toBe(false);
    });
  });

  describe("conditional permissions — patients:viewAll", () => {
    test("PSYCHOLOGIST can view all patients if tenant.sharedPatientPool is true", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        tenant: { sharedPatientPool: true, adminCanViewClinical: false },
      });

      expect(can(ctx, "patients:viewAll")).toBe(true);
    });

    test("PSYCHOLOGIST cannot view all patients if tenant.sharedPatientPool is false", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        tenant: { sharedPatientPool: false, adminCanViewClinical: false },
      });

      expect(can(ctx, "patients:viewAll")).toBe(false);
    });

    test("PSYCHOLOGIST membership override trumps tenant setting", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        membership: { canViewAllPatients: true, canViewClinicalNotes: null, canManageFinancials: null },
        tenant: { sharedPatientPool: false, adminCanViewClinical: false },
      });

      expect(can(ctx, "patients:viewAll")).toBe(true);
    });
  });

  describe("requirePermission — throws on denial", () => {
    test("requirePermission throws ForbiddenError when permission denied", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });

      expect(() => {
        requirePermission(ctx, "sessions:create");
      }).toThrow(ForbiddenError);

      const error = new ForbiddenError("test");
      expect(error.status).toBe(403);
    });

    test("requirePermission does not throw when permission granted", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });

      expect(() => {
        requirePermission(ctx, "patients:list");
      }).not.toThrow();
    });

    test("ForbiddenError message is user-friendly (Portuguese)", () => {
      const ctx = makeCtx({ role: "READONLY" });

      expect(() => {
        requirePermission(ctx, "patients:create");
      }).toThrow(/permissão|ação/i); // Portuguese message
    });
  });

  describe("edge cases", () => {
    test("can() returns false for invalid/undefined role", () => {
      const ctx = makeCtx({ role: "INVALID_ROLE" as any });
      expect(can(ctx, "patients:list")).toBe(false);
    });

    test("multiple permission checks are independent", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });

      const perms1 = can(ctx, "sessions:view");
      const perms2 = can(ctx, "patients:edit");
      const perms3 = can(ctx, "users:invite");

      expect(perms1).toBe(true);
      expect(perms2).toBe(true);
      expect(perms3).toBe(false);
    });
  });
});
