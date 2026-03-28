/**
 * Unit tests — RBAC permission engine
 */

import { can, requirePermission, ForbiddenError, getPatientScope } from "@/lib/rbac";
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

describe("RBAC — base permissions", () => {
  test("SuperAdmin can do everything", () => {
    const ctx = makeCtx({ role: "SUPERADMIN", isSuperAdmin: true });
    expect(can(ctx, "sessions:view")).toBe(true);
    expect(can(ctx, "sa:impersonate")).toBe(true);
    expect(can(ctx, "patients:archive")).toBe(true);
  });

  test("Psychologist can view and create sessions", () => {
    const ctx = makeCtx({ role: "PSYCHOLOGIST" });
    expect(can(ctx, "sessions:view")).toBe(true);
    expect(can(ctx, "sessions:create")).toBe(true);
    expect(can(ctx, "sessions:edit")).toBe(true);
  });

  test("Assistant cannot view sessions by default", () => {
    const ctx = makeCtx({ role: "ASSISTANT" });
    expect(can(ctx, "sessions:view")).toBe(false);
    expect(can(ctx, "sessions:create")).toBe(false);
  });

  test("Assistant can view sessions if granted in membership", () => {
    const ctx = makeCtx({
      role: "ASSISTANT",
      membership: {
        canViewAllPatients: null,
        canViewClinicalNotes: true,
        canManageFinancials: null,
      },
    });
    expect(can(ctx, "sessions:view")).toBe(true);
  });

  test("ReadOnly cannot create patients", () => {
    const ctx = makeCtx({ role: "READONLY" });
    expect(can(ctx, "patients:create")).toBe(false);
    expect(can(ctx, "patients:list")).toBe(true);
  });

  test("ReadOnly cannot create appointments", () => {
    const ctx = makeCtx({ role: "READONLY" });
    expect(can(ctx, "appointments:create")).toBe(false);
    expect(can(ctx, "appointments:view")).toBe(true);
  });
});

describe("RBAC — TenantAdmin clinical notes", () => {
  test("TA cannot view clinical notes by default", () => {
    const ctx = makeCtx({ role: "TENANT_ADMIN", tenant: { sharedPatientPool: false, adminCanViewClinical: false } });
    expect(can(ctx, "sessions:view")).toBe(false);
  });

  test("TA can view clinical notes when tenant setting enabled", () => {
    const ctx = makeCtx({ role: "TENANT_ADMIN", tenant: { sharedPatientPool: false, adminCanViewClinical: true } });
    expect(can(ctx, "sessions:view")).toBe(true);
  });

  test("Membership override takes precedence over tenant setting", () => {
    const ctx = makeCtx({
      role: "TENANT_ADMIN",
      tenant: { sharedPatientPool: false, adminCanViewClinical: true },
      membership: { canViewAllPatients: null, canViewClinicalNotes: false, canManageFinancials: null },
    });
    expect(can(ctx, "sessions:view")).toBe(false);
  });
});

describe("RBAC — Patient scope", () => {
  test("Psychologist gets ASSIGNED scope by default", () => {
    const ctx = makeCtx({ role: "PSYCHOLOGIST" });
    expect(getPatientScope(ctx)).toBe("ASSIGNED");
  });

  test("Psychologist gets ALL scope with sharedPatientPool", () => {
    const ctx = makeCtx({ role: "PSYCHOLOGIST", tenant: { sharedPatientPool: true, adminCanViewClinical: false } });
    expect(getPatientScope(ctx)).toBe("ALL");
  });

  test("TenantAdmin always gets ALL scope", () => {
    const ctx = makeCtx({ role: "TENANT_ADMIN" });
    expect(getPatientScope(ctx)).toBe("ALL");
  });
});

describe("RBAC — requirePermission", () => {
  test("throws ForbiddenError when permission denied", () => {
    const ctx = makeCtx({ role: "READONLY" });
    expect(() => requirePermission(ctx, "patients:create")).toThrow(ForbiddenError);
  });

  test("does not throw when permission granted", () => {
    const ctx = makeCtx({ role: "PSYCHOLOGIST" });
    expect(() => requirePermission(ctx, "sessions:view")).not.toThrow();
  });
});
