/**
 * POST /api/v1/sa/tenants/:id/suspend
 * SuperAdmin-only. Suspends all active memberships for a tenant, effectively
 * blocking staff login until reactivated. Does NOT delete data and does NOT
 * touch Stripe — billing state is independent.
 *
 * Body: { reason?: string }
 */

import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { ok, NotFoundError, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const superAdminId = await requireSuperAdmin();
    const { ipAddress, userAgent } = extractRequestMeta(req);

    let reason = "";
    try {
      const body = await req.json();
      reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "";
    } catch {
      // empty body is fine
    }

    const tenant = await db.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
    if (!tenant) throw new NotFoundError("Tenant");

    const result = await db.membership.updateMany({
      where: { tenantId: tenant.id, status: "ACTIVE" },
      data: { status: "SUSPENDED" },
    });

    await auditLog({
      tenantId: tenant.id,
      userId: superAdminId,
      action: "SA_TENANT_SUSPEND",
      entity: "Tenant",
      entityId: tenant.id,
      summary: { suspendedMemberships: result.count, reason },
      ipAddress,
      userAgent,
    });

    return ok({ suspendedMemberships: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
