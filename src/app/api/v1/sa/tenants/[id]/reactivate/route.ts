/**
 * POST /api/v1/sa/tenants/:id/reactivate
 * SuperAdmin-only. Reverses a prior SA_TENANT_SUSPEND by flipping all
 * SUSPENDED memberships back to ACTIVE. Idempotent.
 */

import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { ok, apiError, NotFoundError, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const superAdminId = await requireSuperAdmin();
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const tenant = await db.tenant.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!tenant) throw new NotFoundError("Tenant");

    const result = await db.membership.updateMany({
      where: { tenantId: tenant.id, status: "SUSPENDED" },
      data: { status: "ACTIVE" },
    });

    await auditLog({
      tenantId: tenant.id,
      userId: superAdminId,
      action: "SA_TENANT_REACTIVATE",
      entity: "Tenant",
      entityId: tenant.id,
      summary: { reactivatedMemberships: result.count },
      ipAddress,
      userAgent,
    });

    return ok({ reactivatedMemberships: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
