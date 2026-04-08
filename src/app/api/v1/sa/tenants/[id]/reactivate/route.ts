/**
 * POST /api/v1/sa/tenants/:id/reactivate
 * SuperAdmin-only. Reverses a prior SA_TENANT_SUSPEND by flipping all
 * SUSPENDED memberships back to ACTIVE. Idempotent.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const superAdminId = await requireSuperAdmin();
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const tenant = await db.tenant.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

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

    return NextResponse.json({ data: { reactivatedMemberships: result.count } });
  } catch (err) {
    console.error("[sa/tenants/reactivate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
