/**
 * POST /api/v1/sa/tenants/:id/suspend
 * SuperAdmin-only. Suspends all active memberships for a tenant, effectively
 * blocking staff login until reactivated. Does NOT delete data and does NOT
 * touch Stripe — billing state is independent.
 *
 * Body: { reason?: string }
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

    let reason = "";
    try {
      const body = await req.json();
      reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "";
    } catch {
      // empty body is fine
    }

    const tenant = await db.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

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

    return NextResponse.json({ data: { suspendedMemberships: result.count } });
  } catch (err) {
    console.error("[sa/tenants/suspend]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
