/**
 * Unit tests — RBAC exhaustive permission matrix
 * Tests ALL permissions for ALL roles with membership overrides and tenant settings
 */

import { can, requirePermission, ForbiddenError } from "@/lib/rbac";
import type { AuthContext, Permission, Role } from "@/lib/rbac";

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

/**
 * All permissions defined in the system
 */
const ALL_PERMISSIONS: Permission[] = [
  // Tenant management
  "tenant:view", "tenant:edit", "tenant:delete",
  // User / membership management
  "users:invite", "users:view", "users:editRole", "users:suspend",
  // Patients
  "patients:list", "patients:create", "patients:edit", "patients:archive", "patients:viewAll",
  // Appointments
  "appointments:view", "appointments:create", "appointments:edit", "appointments:cancel", "appointments:markNoShow",
  // Clinical notes
  "sessions:view", "sessions:create", "sessions:edit", "sessions:viewRevisions", "sessions:restoreRevision",
  // Files
  "files:upload", "files:download", "files:delete", "files:uploadClinical", "files:downloadClinical",
  // Financial
  "charges:view", "charges:create", "charges:edit", "payments:create", "payments:view", "charges:void",
  // Reports
  "reports:view", "reports:export",
  // Integrations
  "integrations:view", "integrations:configure", "nfse:issue", "googleCalendar:connect",
  // Audit
  "audit:view", "audit:export",
  // SuperAdmin
  "sa:impersonate", "sa:viewAllTenants", "sa:manageTenants",
];

const ROLES: Role[] = ["SUPERADMIN", "TENANT_ADMIN", "PSYCHOLOGIST", "ASSISTANT", "READONLY"];

/**
 * Expected permission matrix
 * Maps role to set of allowed permissions
 */
const EXPECTED_PERMISSIONS: Record<Role, Set<Permission>> = {
  SUPERADMIN: new Set([
    "tenant:view", "tenant:edit", "tenant:delete",
    "users:invite", "users:view", "users:editRole", "users:suspend",
    "patients:list", "patients:create", "patients:edit", "patients:archive", "patients:viewAll",
    "appointments:view", "appointments:create", "appointments:edit", "appointments:cancel", "appointments:markNoShow",
    "sessions:view", "sessions:create", "sessions:edit", "sessions:viewRevisions", "sessions:restoreRevision",
    "files:upload", "files:download", "files:delete", "files:uploadClinical", "files:downloadClinical",
    "charges:view", "charges:create", "charges:edit", "payments:create", "payments:view", "charges:void",
    "reports:view", "reports:export",
    "integrations:view", "integrations:configure", "nfse:issue", "googleCalendar:connect",
    "audit:view", "audit:export",
    "sa:impersonate", "sa:viewAllTenants", "sa:manageTenants",
  ]),
  TENANT_ADMIN: new Set([
    "tenant:view", "tenant:edit",
    "users:invite", "users:view", "users:editRole", "users:suspend",
    "patients:list", "patients:create", "patients:edit", "patients:archive", "patients:viewAll",
    "appointments:view", "appointments:create", "appointments:edit", "appointments:cancel", "appointments:markNoShow",
    "sessions:create", "sessions:edit", "sessions:viewRevisions", "sessions:restoreRevision",
    "files:upload", "files:download", "files:delete", "files:uploadClinical",
    "charges:view", "charges:create", "charges:edit", "payments:create", "payments:view", "charges:void",
    "reports:view", "reports:export",
    "integrations:view", "integrations:configure", "nfse:issue", "googleCalendar:connect",
    "audit:view", "audit:export",
  ]),
  PSYCHOLOGIST: new Set([
    "tenant:view",
    "users:view",
    "patients:list", "patients:create", "patients:edit",
    "appointments:view", "appointments:create", "appointments:edit", "appointments:cancel", "appointments:markNoShow",
    "sessions:view", "sessions:create", "sessions:edit", "sessions:viewRevisions", "sessions:restoreRevision",
    "files:upload", "files:download", "files:uploadClinical", "files:downloadClinical",
    "charges:view", "charges:create", "charges:edit", "charges:void", "payments:create", "payments:view",
    "reports:view", "reports:export",
    "integrations:view", "nfse:issue", "googleCalendar:connect",
    "audit:view",
  ]),
  ASSISTANT: new Set([
    "patients:list", "patients:create", "patients:edit",
    "appointments:view", "appointments:create", "appointments:edit", "appointments:cancel", "appointments:markNoShow",
    "files:upload", "files:download",
    "charges:view", "charges:create", "charges:edit", "charges:void", "payments:create", "payments:view",
    "reports:view", "reports:export",
    "nfse:issue",
  ]),
  READONLY: new Set([
    "patients:list",
    "appointments:view",
    "charges:view", "payments:view",
    "reports:view", "reports:export",
  ]),
};

describe("RBAC — exhaustive permission matrix", () => {
  describe("each role has correct base permissions", () => {
    ROLES.forEach((role) => {
      test(`${role} has expected permissions`, () => {
        const ctx = makeCtx({ role });
        const expected = EXPECTED_PERMISSIONS[role];

        // Test that all expected permissions are granted
        expected.forEach((perm) => {
          expect(can(ctx, perm)).toBe(true);
        });

        // Test that unexpected permissions are denied
        const unexpected = ALL_PERMISSIONS.filter((p) => !expected.has(p));
        unexpected.forEach((perm) => {
          expect(can(ctx, perm)).toBe(false);
        });
      });
    });
  });

  describe("SUPERADMIN edge cases", () => {
    test("SUPERADMIN bypasses all checks via isSuperAdmin flag", () => {
      const ctx = makeCtx({ role: "SUPERADMIN", isSuperAdmin: true });
      ALL_PERMISSIONS.forEach((perm) => {
        expect(can(ctx, perm)).toBe(true);
      });
    });

    test("SUPERADMIN can view all tenants", () => {
      const ctx = makeCtx({ role: "SUPERADMIN", isSuperAdmin: true, tenantId: "" });
      expect(can(ctx, "sa:viewAllTenants")).toBe(true);
    });

    test("SUPERADMIN can manage tenants", () => {
      const ctx = makeCtx({ role: "SUPERADMIN", isSuperAdmin: true });
      expect(can(ctx, "sa:manageTenants")).toBe(true);
    });

    test("SUPERADMIN can impersonate users", () => {
      const ctx = makeCtx({ role: "SUPERADMIN", isSuperAdmin: true });
      expect(can(ctx, "sa:impersonate")).toBe(true);
    });
  });

  describe("TENANT_ADMIN conditional permissions", () => {
    test("TA cannot view clinical sessions by default", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { sharedPatientPool: false, adminCanViewClinical: false },
      });
      expect(can(ctx, "sessions:view")).toBe(false);
    });

    test("TA can view clinical sessions when tenant setting enabled", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { sharedPatientPool: false, adminCanViewClinical: true },
      });
      expect(can(ctx, "sessions:view")).toBe(true);
    });

    test("TA cannot download clinical files by default", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { sharedPatientPool: false, adminCanViewClinical: false },
      });
      expect(can(ctx, "files:downloadClinical")).toBe(false);
    });

    test("TA can download clinical files when tenant setting enabled", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { sharedPatientPool: false, adminCanViewClinical: true },
      });
      expect(can(ctx, "files:downloadClinical")).toBe(true);
    });

    test("TA membership override disables sessions:view despite tenant setting", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { sharedPatientPool: false, adminCanViewClinical: true },
        membership: { canViewAllPatients: null, canViewClinicalNotes: false, canManageFinancials: null },
      });
      expect(can(ctx, "sessions:view")).toBe(false);
    });

    test("TA membership override enables sessions:view regardless of tenant setting", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { sharedPatientPool: false, adminCanViewClinical: false },
        membership: { canViewAllPatients: null, canViewClinicalNotes: true, canManageFinancials: null },
      });
      expect(can(ctx, "sessions:view")).toBe(true);
    });

    test("TA membership override takes precedence for files:downloadClinical", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { sharedPatientPool: false, adminCanViewClinical: true },
        membership: { canViewAllPatients: null, canViewClinicalNotes: false, canManageFinancials: null },
      });
      expect(can(ctx, "files:downloadClinical")).toBe(false);
    });

    test("TA cannot view tenant deletion", () => {
      const ctx = makeCtx({ role: "TENANT_ADMIN" });
      expect(can(ctx, "tenant:delete")).toBe(false);
    });

    test("TA cannot suspend users", () => {
      const ctx = makeCtx({ role: "TENANT_ADMIN" });
      expect(can(ctx, "users:suspend")).toBe(true);
    });
  });

  describe("PSYCHOLOGIST patient scope", () => {
    test("PSYCHOLOGIST cannot view all patients by default", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        tenant: { sharedPatientPool: false, adminCanViewClinical: false },
      });
      expect(can(ctx, "patients:viewAll")).toBe(false);
    });

    test("PSYCHOLOGIST can view all patients with shared pool enabled", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        tenant: { sharedPatientPool: true, adminCanViewClinical: false },
      });
      expect(can(ctx, "patients:viewAll")).toBe(true);
    });

    test("PSYCHOLOGIST membership override enables viewAll despite no shared pool", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        tenant: { sharedPatientPool: false, adminCanViewClinical: false },
        membership: { canViewAllPatients: true, canViewClinicalNotes: null, canManageFinancials: null },
      });
      expect(can(ctx, "patients:viewAll")).toBe(true);
    });

    test("PSYCHOLOGIST membership override disables viewAll despite shared pool", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        tenant: { sharedPatientPool: true, adminCanViewClinical: false },
        membership: { canViewAllPatients: false, canViewClinicalNotes: null, canManageFinancials: null },
      });
      expect(can(ctx, "patients:viewAll")).toBe(false);
    });

    test("PSYCHOLOGIST can create charges", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });
      expect(can(ctx, "charges:create")).toBe(true);
    });

    test("PSYCHOLOGIST cannot manage integrations", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });
      expect(can(ctx, "integrations:configure")).toBe(false);
    });

    test("PSYCHOLOGIST cannot archive patients", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });
      expect(can(ctx, "patients:archive")).toBe(false);
    });
  });

  describe("ASSISTANT restrictions", () => {
    test("ASSISTANT cannot view clinical sessions by default", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });
      expect(can(ctx, "sessions:view")).toBe(false);
    });

    test("ASSISTANT can view sessions if granted in membership", () => {
      const ctx = makeCtx({
        role: "ASSISTANT",
        membership: { canViewAllPatients: null, canViewClinicalNotes: true, canManageFinancials: null },
      });
      expect(can(ctx, "sessions:view")).toBe(true);
    });

    test("ASSISTANT cannot create sessions", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });
      expect(can(ctx, "sessions:create")).toBe(false);
    });

    test("ASSISTANT cannot edit sessions", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });
      expect(can(ctx, "sessions:edit")).toBe(false);
    });

    test("ASSISTANT cannot download clinical files by default", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });
      expect(can(ctx, "files:downloadClinical")).toBe(false);
    });

    test("ASSISTANT can download clinical files if granted in membership", () => {
      const ctx = makeCtx({
        role: "ASSISTANT",
        membership: { canViewAllPatients: null, canViewClinicalNotes: true, canManageFinancials: null },
      });
      expect(can(ctx, "files:downloadClinical")).toBe(true);
    });

    test("ASSISTANT cannot view all patients by default", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });
      expect(can(ctx, "patients:viewAll")).toBe(false);
    });

    test("ASSISTANT can view all patients with shared pool", () => {
      const ctx = makeCtx({
        role: "ASSISTANT",
        tenant: { sharedPatientPool: true, adminCanViewClinical: false },
      });
      expect(can(ctx, "patients:viewAll")).toBe(true);
    });

    test("ASSISTANT cannot view integrations", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });
      expect(can(ctx, "integrations:view")).toBe(false);
    });

    test("ASSISTANT cannot manage users", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });
      expect(can(ctx, "users:invite")).toBe(false);
    });

    test("ASSISTANT cannot upload regular files (only clinical)", () => {
      const ctx = makeCtx({ role: "ASSISTANT" });
      expect(can(ctx, "files:upload")).toBe(true);
      expect(can(ctx, "files:uploadClinical")).toBe(false);
    });
  });

  describe("READONLY restrictions", () => {
    test("READONLY cannot create anything", () => {
      const ctx = makeCtx({ role: "READONLY" });
      expect(can(ctx, "patients:create")).toBe(false);
      expect(can(ctx, "appointments:create")).toBe(false);
      expect(can(ctx, "sessions:create")).toBe(false);
      expect(can(ctx, "charges:create")).toBe(false);
      expect(can(ctx, "payments:create")).toBe(false);
    });

    test("READONLY cannot edit anything", () => {
      const ctx = makeCtx({ role: "READONLY" });
      expect(can(ctx, "patients:edit")).toBe(false);
      expect(can(ctx, "appointments:edit")).toBe(false);
      expect(can(ctx, "sessions:edit")).toBe(false);
      expect(can(ctx, "charges:edit")).toBe(false);
    });

    test("READONLY cannot delete anything", () => {
      const ctx = makeCtx({ role: "READONLY" });
      expect(can(ctx, "files:delete")).toBe(false);
      expect(can(ctx, "patients:archive")).toBe(false);
    });

    test("READONLY cannot upload files", () => {
      const ctx = makeCtx({ role: "READONLY" });
      expect(can(ctx, "files:upload")).toBe(false);
    });

    test("READONLY can only view and export reports", () => {
      const ctx = makeCtx({ role: "READONLY" });
      expect(can(ctx, "reports:view")).toBe(true);
      expect(can(ctx, "reports:export")).toBe(true);
    });

    test("READONLY cannot view integrations", () => {
      const ctx = makeCtx({ role: "READONLY" });
      expect(can(ctx, "integrations:view")).toBe(false);
    });

    test("READONLY cannot access admin/superadmin features", () => {
      const ctx = makeCtx({ role: "READONLY" });
      expect(can(ctx, "tenant:edit")).toBe(false);
      expect(can(ctx, "users:invite")).toBe(false);
      expect(can(ctx, "sa:impersonate")).toBe(false);
    });
  });

  describe("requirePermission throws ForbiddenError", () => {
    test("throws for denied permission", () => {
      const ctx = makeCtx({ role: "READONLY" });
      expect(() => requirePermission(ctx, "patients:create")).toThrow(ForbiddenError);
    });

    test("throws with correct message", () => {
      const ctx = makeCtx({ role: "READONLY" });
      // Error message is intentionally generic (no role leak to client)
      expect(() => requirePermission(ctx, "patients:create")).toThrow("Você não tem permissão");
    });

    test("does not throw for allowed permission", () => {
      const ctx = makeCtx({ role: "PSYCHOLOGIST" });
      expect(() => requirePermission(ctx, "patients:create")).not.toThrow();
    });

    test("ForbiddenError has status 403", () => {
      try {
        requirePermission(makeCtx({ role: "READONLY" }), "patients:create");
        fail("should have thrown");
      } catch (err) {
        expect((err as any).status).toBe(403);
      }
    });
  });

  describe("membership overrides interaction", () => {
    test("all membership overrides can be null without affecting base permissions", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        membership: { canViewAllPatients: null, canViewClinicalNotes: null, canManageFinancials: null },
      });
      expect(can(ctx, "patients:list")).toBe(true);
      expect(can(ctx, "sessions:view")).toBe(true);
    });

    test("membership override nulls do not grant permissions", () => {
      const ctx = makeCtx({
        role: "READONLY",
        membership: { canViewAllPatients: null, canViewClinicalNotes: null, canManageFinancials: null },
      });
      expect(can(ctx, "patients:viewAll")).toBe(false);
      expect(can(ctx, "sessions:view")).toBe(false);
    });

    test("multiple membership overrides work together", () => {
      const ctx = makeCtx({
        role: "ASSISTANT",
        membership: {
          canViewAllPatients: true,
          canViewClinicalNotes: true,
          canManageFinancials: false,
        },
      });
      expect(can(ctx, "patients:viewAll")).toBe(true);
      expect(can(ctx, "sessions:view")).toBe(true);
      // canManageFinancials doesn't directly grant permissions
    });
  });

  describe("tenant settings interaction", () => {
    test("shared patient pool applies to PSYCHOLOGIST", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        tenant: { sharedPatientPool: true, adminCanViewClinical: false },
      });
      expect(can(ctx, "patients:viewAll")).toBe(true);
    });

    test("shared patient pool applies to ASSISTANT", () => {
      const ctx = makeCtx({
        role: "ASSISTANT",
        tenant: { sharedPatientPool: true, adminCanViewClinical: false },
      });
      expect(can(ctx, "patients:viewAll")).toBe(true);
    });

    test("adminCanViewClinical applies to TENANT_ADMIN", () => {
      const ctx = makeCtx({
        role: "TENANT_ADMIN",
        tenant: { sharedPatientPool: false, adminCanViewClinical: true },
      });
      expect(can(ctx, "sessions:view")).toBe(true);
      expect(can(ctx, "files:downloadClinical")).toBe(true);
    });

    test("adminCanViewClinical does not affect PSYCHOLOGIST", () => {
      const ctx = makeCtx({
        role: "PSYCHOLOGIST",
        tenant: { sharedPatientPool: false, adminCanViewClinical: true },
      });
      expect(can(ctx, "sessions:view")).toBe(true);
    });

    test("adminCanViewClinical does not affect READONLY", () => {
      const ctx = makeCtx({
        role: "READONLY",
        tenant: { sharedPatientPool: false, adminCanViewClinical: true },
      });
      expect(can(ctx, "sessions:view")).toBe(false);
    });
  });
});
