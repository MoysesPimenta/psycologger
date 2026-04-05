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
 * Pass a NextRequest to automatically read the x-tenant-id header injected by
 * middleware (required for correct multi-tenant routing in API routes).
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
