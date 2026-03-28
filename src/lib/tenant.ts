/**
 * Tenant resolution — Psycologger
 * Resolves the current tenant and membership from the session.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { db } from "./db";
import type { AuthContext } from "./rbac";
import { UnauthorizedError, ForbiddenError } from "./rbac";

/**
 * Resolve full auth context for the current request.
 * Throws UnauthorizedError if not logged in.
 * Throws ForbiddenError if no active membership found.
 */
export async function getAuthContext(tenantId?: string): Promise<AuthContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new UnauthorizedError();

  const userId = session.user.id;
  const isSuperAdmin = session.user.isSuperAdmin ?? false;

  if (isSuperAdmin && !tenantId) {
    // SuperAdmin platform-level access
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
