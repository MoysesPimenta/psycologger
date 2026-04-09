/**
 * RBAC — Psycologger
 * Central permission engine. All authorization checks go through here.
 */

import type { Role, Membership, Tenant } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Permission =
  // Tenant management
  | "tenant:view"
  | "tenant:edit"
  | "tenant:delete"
  // User / membership management
  | "users:invite"
  | "users:view"
  | "users:editRole"
  // TODO(P1-2): No route enforces this permission yet — implement /api/v1/users/[id]/suspend or remove.
  | "users:suspend"
  // Patients
  | "patients:list"
  | "patients:create"
  | "patients:edit"
  | "patients:archive"
  | "patients:viewAll" // beyond assigned
  // Appointments
  | "appointments:view"
  | "appointments:create"
  | "appointments:edit"
  | "appointments:cancel"
  | "appointments:markNoShow"
  // Clinical notes
  | "sessions:view"
  | "sessions:create"
  | "sessions:edit"
  | "sessions:viewRevisions"
  | "sessions:restoreRevision"
  // Files
  | "files:upload"
  | "files:download"
  | "files:delete"
  | "files:uploadClinical"
  | "files:downloadClinical"
  // Financial
  | "charges:view"
  | "charges:create"
  | "charges:edit"
  | "payments:create"
  | "payments:view"
  | "charges:void"
  // Reports
  | "reports:view"
  | "reports:export"
  // Integrations
  | "integrations:view"
  | "integrations:configure"
  | "nfse:issue"
  | "googleCalendar:connect"
  // Audit
  | "audit:view"
  | "audit:export"
  // SuperAdmin
  | "sa:impersonate"
  | "sa:viewAllTenants"
  | "sa:manageTenants";

// ─── Base permission matrix per role ─────────────────────────────────────────

const BASE_PERMISSIONS: Record<Role, Set<Permission>> = {
  SUPERADMIN: new Set<Permission>([
    "tenant:view", "tenant:edit", "tenant:delete",
    "users:invite", "users:view", "users:editRole", "users:suspend",
    "patients:list", "patients:create", "patients:edit", "patients:archive", "patients:viewAll",
    "appointments:view", "appointments:create", "appointments:edit",
    "appointments:cancel", "appointments:markNoShow",
    "sessions:view", "sessions:create", "sessions:edit",
    "sessions:viewRevisions", "sessions:restoreRevision",
    "files:upload", "files:download", "files:delete",
    "files:uploadClinical", "files:downloadClinical",
    "charges:view", "charges:create", "charges:edit", "payments:create", "payments:view", "charges:void",
    "reports:view", "reports:export",
    "integrations:view", "integrations:configure", "nfse:issue", "googleCalendar:connect",
    "audit:view", "audit:export",
    "sa:impersonate", "sa:viewAllTenants", "sa:manageTenants",
  ]),

  TENANT_ADMIN: new Set<Permission>([
    "tenant:view", "tenant:edit",
    "users:invite", "users:view", "users:editRole", "users:suspend",
    "patients:list", "patients:create", "patients:edit", "patients:archive", "patients:viewAll",
    "appointments:view", "appointments:create", "appointments:edit",
    "appointments:cancel", "appointments:markNoShow",
    // Clinical notes: conditional (adminCanViewClinical tenant setting)
    // sessions:view is granted conditionally below
    "sessions:create", "sessions:edit",
    "sessions:viewRevisions", "sessions:restoreRevision",
    "files:upload", "files:download", "files:delete",
    "files:uploadClinical",
    // files:downloadClinical: conditional on adminCanViewClinical
    "charges:view", "charges:create", "charges:edit", "payments:create", "payments:view", "charges:void",
    "reports:view", "reports:export",
    "integrations:view", "integrations:configure", "nfse:issue", "googleCalendar:connect",
    "audit:view", "audit:export",
  ]),

  PSYCHOLOGIST: new Set<Permission>([
    "tenant:view",
    "users:view",
    "patients:list", "patients:create", "patients:edit",
    "appointments:view", "appointments:create", "appointments:edit",
    "appointments:cancel", "appointments:markNoShow",
    "sessions:view", "sessions:create", "sessions:edit",
    "sessions:viewRevisions", "sessions:restoreRevision",
    "files:upload", "files:download", "files:uploadClinical", "files:downloadClinical",
    "charges:view", "charges:create", "charges:edit", "charges:void",
    "payments:create", "payments:view",
    "reports:view", "reports:export",
    "integrations:view", "nfse:issue", "googleCalendar:connect",
    "audit:view",
  ]),

  ASSISTANT: new Set<Permission>([
    "patients:list", "patients:create", "patients:edit",
    "appointments:view", "appointments:create", "appointments:edit",
    "appointments:cancel", "appointments:markNoShow",
    // No sessions:view, sessions:create, sessions:edit — clinical restriction
    "files:upload", "files:download", // but NOT clinical files
    "charges:view", "charges:create", "charges:edit", "charges:void",
    "payments:create", "payments:view",
    "reports:view", "reports:export",
    "nfse:issue",
    // No audit:view — per permission matrix, ASSISTANT cannot access audit logs
  ]),

  READONLY: new Set<Permission>([
    "patients:list",
    "appointments:view",
    "charges:view", "payments:view",
    "reports:view", "reports:export",
    // No audit:view — per permission matrix, READONLY cannot access audit logs
  ]),
};

// ─── Context object passed to every check ────────────────────────────────────

export interface AuthContext {
  userId: string;
  role: Role;
  tenantId: string;
  membership: Pick<Membership, "canViewAllPatients" | "canViewClinicalNotes" | "canManageFinancials">;
  tenant: Pick<Tenant, "sharedPatientPool" | "adminCanViewClinical">;
  isSuperAdmin?: boolean;
  // Impersonation fields
  impersonating?: boolean; // true if acting as another user
  impersonatedBy?: string; // userId of the superadmin doing the impersonating
}

// ─── Core permission check ────────────────────────────────────────────────────

export function can(ctx: AuthContext, permission: Permission): boolean {
  if (ctx.isSuperAdmin) return true;

  const basePerms = BASE_PERMISSIONS[ctx.role];
  if (!basePerms) return false;

  // Handle special conditional permissions
  if (permission === "sessions:view") {
    if (ctx.role === "TENANT_ADMIN") {
      // Use membership override first, then tenant setting
      if (ctx.membership.canViewClinicalNotes !== null && ctx.membership.canViewClinicalNotes !== undefined) {
        return ctx.membership.canViewClinicalNotes;
      }
      return ctx.tenant.adminCanViewClinical;
    }
    if (ctx.role === "ASSISTANT") {
      // Use membership override first, then tenant setting
      if (ctx.membership.canViewClinicalNotes !== null && ctx.membership.canViewClinicalNotes !== undefined) {
        return ctx.membership.canViewClinicalNotes;
      }
      return ctx.tenant.adminCanViewClinical;
    }
  }

  if (permission === "patients:viewAll") {
    if (ctx.role === "PSYCHOLOGIST" || ctx.role === "ASSISTANT" || ctx.role === "READONLY") {
      if (ctx.membership.canViewAllPatients !== null && ctx.membership.canViewAllPatients !== undefined) {
        return ctx.membership.canViewAllPatients;
      }
      return ctx.tenant.sharedPatientPool;
    }
  }

  if (permission === "files:downloadClinical") {
    if (ctx.role === "TENANT_ADMIN") {
      if (ctx.membership.canViewClinicalNotes !== null && ctx.membership.canViewClinicalNotes !== undefined) {
        return ctx.membership.canViewClinicalNotes;
      }
      return ctx.tenant.adminCanViewClinical;
    }
    if (ctx.role === "ASSISTANT") {
      return ctx.membership.canViewClinicalNotes === true;
    }
  }

  return basePerms.has(permission);
}

// ─── Throw if not permitted ───────────────────────────────────────────────────

export function requirePermission(ctx: AuthContext, permission: Permission): void {
  if (!can(ctx, permission)) {
    // Log detailed info server-side; send generic message to client
    console.warn(`[RBAC] Denied: user=${ctx.userId} role=${ctx.role} perm=${permission}`);
    throw new ForbiddenError("Você não tem permissão para realizar esta ação.");
  }
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Autenticação necessária") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

// ─── Helper: resolve patient visibility scope ────────────────────────────────

export function getPatientScope(ctx: AuthContext): "ALL" | "ASSIGNED" {
  if (ctx.role === "SUPERADMIN" || ctx.role === "TENANT_ADMIN") return "ALL";
  if (can(ctx, "patients:viewAll")) return "ALL";
  return "ASSIGNED";
}
