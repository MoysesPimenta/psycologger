/**
 * POST /api/v1/sa/tenants/:id/plan-override
 * SuperAdmin-only. Directly overrides a tenant's planTier without going
 * through Stripe. Intended for comped accounts, beta partners, and manual
 * reconciliation after support cases.
 *
 * IMPORTANT: this only changes the entitlement ceiling — it does NOT create
 * or mutate a Stripe subscription. Use the Stripe Customer Portal for real
 * billing actions.
 *
 * Body: { planTier: "FREE" | "PRO" | "CLINIC", reason: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  planTier: z.enum(["FREE", "PRO", "CLINIC"]),
  reason: z.string().min(3).max(500),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const superAdminId = await requireSuperAdmin();
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = schema.parse(await req.json());

    const tenant = await db.tenant.findUnique({
      where: { id: params.id },
      select: { id: true, planTier: true, stripeSubscriptionId: true },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const previousTier = tenant.planTier;
    if (previousTier === body.planTier) {
      return NextResponse.json({ data: { unchanged: true, planTier: previousTier } });
    }

    await db.tenant.update({
      where: { id: tenant.id },
      data: { planTier: body.planTier, planSince: new Date() },
    });

    await auditLog({
      tenantId: tenant.id,
      userId: superAdminId,
      action: "SA_PLAN_OVERRIDE",
      entity: "Tenant",
      entityId: tenant.id,
      summary: {
        previousTier,
        newTier: body.planTier,
        reason: body.reason,
        stripeSubscriptionId: tenant.stripeSubscriptionId ?? null,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ data: { previousTier, newTier: body.planTier } });
  } catch (err) {
    console.error("[sa/tenants/plan-override]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
