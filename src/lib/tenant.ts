/**
 * Tenant resolution — Psycologger
 * Resolves the current tenant and membership from the session.
 * Supports impersonation for SuperAdmin debugging.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { db } from "./db";
import type { AuthContext } from "./rbac";
import { UnauthorizedError, ForbiddenError } from "./rbac";
import { getToken } from "next-auth/jwt";
import { headers as nextHeaders } from "next/headers";
import { verifyImpersonationToken } from "./impersonation";

/**
 * Resolve full auth context for the current request.
 * Pass a NextRequest to automatically read the x-tenant-id header injected by
 * middleware (required for correct multi-tenant routing in API routes).
 * Detects and resolves impersonation if the impersonation cookie is present and valid.
 * Throws UnauthorizedError if not logged in.
 * Throws ForbiddenError if no active membership found.
 */
export async function getAuthContext(
  tenantIdOrRequest?: string | Request
): Promise<AuthContext> {
  // Accept either a plain tenantId string or a Request whose x-tenant-id header
  // is injected by middleware from the psycologger-tenant cookie.
  let tenantId: string | undefined;
  if (typeof tenantIdOrRequest === "string") {
    tenantId = tenantIdOrRequest || undefined;
  } else if (tenantIdOrRequest instanceof Request) {
    tenantId = tenantIdOrRequest.headers.get("x-tenant-id") ?? undefined;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new UnauthorizedError();

  const userId = session.user.id;

  // isSuperAdmin is no longer exposed in the client session for security.
  // Read it from the database to ensure freshness and prevent client tampering.
  const userRecord = await db.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  const isSuperAdmin = userRecord?.isSuperAdmin ?? false;

  // === IMPERSONATION CHECK ===
  // If the user is a superadmin, check for impersonation cookie.
  // This must be re-verified on every request to prevent privilege escalation.
  let impersonatedUserId: string | undefined;
  let impersonatedTenantId: string | undefined;
  let impersonatedBy: string | undefined;

  if (isSuperAdmin) {
    try {
      const headers = nextHeaders();
      const impersonateCookie = headers.get("cookie")?.split("; ").find(c => c.startsWith("psycologger-impersonate="));
      if (impersonateCookie) {
        const token = impersonateCookie.substring("psycologger-impersonate=".length);
        const payload = await verifyImpersonationToken(token);

        // Verify the real session user (the superadmin) is still a superadmin
        // This prevents a compromised JWT from escalating privileges
        if (payload.byUserId === userId) {
          impersonatedUserId = payload.impersonatedUserId;
          impersonatedTenantId = payload.impersonatedTenantId;
          impersonatedBy = payload.byUserId;
        }
      }
    } catch {
      // Silently ignore invalid impersonation tokens — they'll be cleared by the stop endpoint
    }
  }

  // If impersonation is active, resolve the impersonated user's context
  if (impersonatedUserId && impersonatedTenantId) {
    const membership = await db.membership.findFirst({
      where: {
        userId: impersonatedUserId,
        tenantId: impersonatedTenantId,
        status: "ACTIVE",
      },
      include: {
        tenant: {
          select: {
            id: true,
            sharedPatientPool: true,
            adminCanViewClinical: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenError("Impersonated user has no active membership in this tenant");
    }

    return {
      userId: impersonatedUserId,
      role: membership.role,
      tenantId: membership.tenantId,
      membership: {
        canViewAllPatients: membership.canViewAllPatients,
        canViewClinicalNotes: membership.canViewClinicalNotes,
        canManageFinancials: membership.canManageFinancials,
      },
      tenant: {
        sharedPatientPool: membership.tenant.sharedPatientPool,
        adminCanViewClinical: membership.tenant.adminCanViewClinical,
      },
      isSuperAdmin: false, // Impersonated user is NOT a superadmin, even if real user is
      impersonating: true,
      impersonatedBy,
    };
  }

  if (isSuperAdmin && !tenantId) {
    // SuperAdmin platform-level access. tenantId is the empty string here —
    // any route that issues tenant-scoped queries MUST call requireTenant(ctx)
    // to fail fast instead of silently matching zero rows on `tenantId = ""`.
    return {
      userId,
      role: "SUPERADMIN",
      tenantId: "",
      membership: {
        canViewAllPatients: true,
        canViewClinicalNotes: true,
        canManageFinancials: true,
      },
      tenant: {
        sharedPatientPool: true,
        adminCanViewClinical: true,
      },
      isSuperAdmin: true,
    };
  }

  // SuperAdmin acting inside a specific tenant: skip the membership lookup
  // (a SUPERADMIN may have no Membership row at all) and build the context
  // from the Tenant record directly.
  if (isSuperAdmin && tenantId) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, sharedPatientPool: true, adminCanViewClinical: true },
    });
    if (!tenant) {
      throw new ForbiddenError("Tenant not found");
    }
    return {
      userId,
      role: "SUPERADMIN",
      tenantId: tenant.id,
      membership: {
        canViewAllPatients: true,
        canViewClinicalNotes: true,
        canManageFinancials: true,
      },
      tenant: {
        sharedPatientPool: tenant.sharedPatientPool,
        adminCanViewClinical: tenant.adminCanViewClinical,
      },
      isSuperAdmin: true,
    };
  }

  // Resolve membership
  const membership = await db.membership.findFirst({
    where: {
      userId,
      tenantId: tenantId ?? undefined,
      status: "ACTIVE",
    },
    include: {
      tenant: {
        select: {
          id: true,
          sharedPatientPool: true,
          adminCanViewClinical: true,
        },
      },
    },
  });

  if (!membership) {
    throw new ForbiddenError("No active membership found for this tenant");
  }

  return {
    userId,
    role: membership.role,
    tenantId: membership.tenantId,
    membership: {
      canViewAllPatients: membership.canViewAllPatients,
      canViewClinicalNotes: membership.canViewClinicalNotes,
      canManageFinancials: membership.canManageFinancials,
    },
    tenant: {
      sharedPatientPool: membership.tenant.sharedPatientPool,
      adminCanViewClinical: membership.tenant.adminCanViewClinical,
    },
    isSuperAdmin,
  };
}

/**
 * Assert that the auth context is bound to a real tenant (not the platform-level
 * SUPERADMIN context where `tenantId` is the empty string). Use this in any
 * route handler that issues queries scoped by `tenantId` so we fail loudly
 * instead of silently matching zero rows on an empty-string filter.
 *
 * Throws ForbiddenError if no tenant context is present.
 */
export function requireTenant(ctx: { tenantId: string; isSuperAdmin?: boolean }): string {
  if (!ctx.tenantId || ctx.tenantId.trim() === "") {
    throw new ForbiddenError(
      ctx.isSuperAdmin
        ? "Esta operação requer um contexto de tenant. Selecione uma clínica."
        : "Tenant não definido para o usuário.",
    );
  }
  return ctx.tenantId;
}

/**
 * Get the user's memberships (for tenant switcher).
 */
export async function getUserMemberships(userId: string) {
  return db.membership.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Resolve tenantId from slug.
 */
export async function getTenantBySlug(slug: string) {
  return db.tenant.findUnique({ where: { slug } });
}
