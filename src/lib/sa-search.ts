/**
 * SuperAdmin search and filtering utilities
 * Server-side filtering for tenants and users
 */

import { db } from "./db";

export interface TenantSearchParams {
  q?: string; // Search by name, domain, or ID
  planTier?: string; // Filter by plan tier (FREE, PRO, CLINIC)
  subscriptionStatus?: string; // Filter by subscription status
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "name" | "mrr"; // Sort direction inferred (desc for createdAt, asc for name)
}

export interface UserSearchParams {
  q?: string; // Search by email or name
  role?: string; // Filter by membership role
  isSuperAdmin?: string; // Filter by superadmin status (true/false)
  lastLoginRange?: string; // 7d, 30d, never
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "email" | "lastLoginAt";
}

export async function searchTenants(params: TenantSearchParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, params.limit || 50);
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {};

  // Search by name, slug, or id
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { slug: { contains: params.q, mode: "insensitive" } },
      { id: { equals: params.q } }, // exact match on id
    ];
  }

  // Filter by plan tier
  if (params.planTier && params.planTier !== "All") {
    where.planTier = params.planTier;
  }

  // Filter by subscription status
  if (params.subscriptionStatus && params.subscriptionStatus !== "All") {
    where.subscriptionStatus = params.subscriptionStatus;
  }

  const orderBy: Record<string, any> = {};
  if (params.sortBy === "name") {
    orderBy.name = "asc";
  } else if (params.sortBy === "mrr") {
    // MRR is computed client-side for now; just use createdAt desc
    orderBy.createdAt = "desc";
  } else {
    orderBy.createdAt = "desc"; // default
  }

  const [tenants, totalCount] = await Promise.all([
    db.tenant.findMany({
      where,
      orderBy,
      take: limit,
      skip,
      include: {
        _count: {
          select: { memberships: true, patients: true, appointments: true, charges: true },
        },
      },
    }),
    db.tenant.count({ where }),
  ]);

  return {
    tenants,
    totalCount,
    page,
    limit,
    pageCount: Math.ceil(totalCount / limit),
  };
}

export async function searchUsers(params: UserSearchParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, params.limit || 50);
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {};

  // Search by email or name
  if (params.q) {
    where.OR = [
      { email: { contains: params.q, mode: "insensitive" } },
      { name: { contains: params.q, mode: "insensitive" } },
    ];
  }

  // Filter by superadmin
  if (params.isSuperAdmin === "true") {
    where.isSuperAdmin = true;
  } else if (params.isSuperAdmin === "false") {
    where.isSuperAdmin = false;
  }

  // Filter by last login range
  if (params.lastLoginRange) {
    const now = new Date();
    if (params.lastLoginRange === "7d") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      where.lastLoginAt = { gte: sevenDaysAgo };
    } else if (params.lastLoginRange === "30d") {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      where.lastLoginAt = { gte: thirtyDaysAgo };
    } else if (params.lastLoginRange === "never") {
      where.lastLoginAt = null;
    }
  }

  const orderBy: Record<string, any> = {};
  if (params.sortBy === "email") {
    orderBy.email = "asc";
  } else if (params.sortBy === "lastLoginAt") {
    orderBy.lastLoginAt = "desc";
  } else {
    orderBy.createdAt = "desc"; // default
  }

  const [users, totalCount] = await Promise.all([
    db.user.findMany({
      where,
      orderBy,
      take: limit,
      skip,
      select: {
        id: true,
        name: true,
        email: true,
        lastLoginAt: true,
        isSuperAdmin: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            status: true,
            tenantId: true,
            tenant: { select: { name: true } },
          },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  return {
    users,
    totalCount,
    page,
    limit,
    pageCount: Math.ceil(totalCount / limit),
  };
}
