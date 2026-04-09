/**
 * SA internal notes — stored as AuditLog entries with action="SA_INTERNAL_NOTE".
 * We intentionally avoid a new schema table: notes must be append-only and
 * already belong in an auditable event stream, which AuditLog already is.
 *
 * GET  /api/v1/sa/tenants/:id/notes          — list notes + recent SA activity
 * POST /api/v1/sa/tenants/:id/notes          — append a new note { body: string }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { ok, NotFoundError, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  body: z.string().min(1).max(2000),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireSuperAdmin();

  const [notes, recentSaActions] = await Promise.all([
    db.auditLog.findMany({
      where: { tenantId: params.id, action: "SA_INTERNAL_NOTE" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true, name: true } } },
    }),
    db.auditLog.findMany({
      where: {
        tenantId: params.id,
        action: {
          in: [
            "SA_TENANT_SUSPEND",
            "SA_TENANT_REACTIVATE",
            "SA_PLAN_OVERRIDE",
            "IMPERSONATION_START",
            "IMPERSONATION_STOP",
            "BILLING_SUBSCRIPTION_CREATED",
            "BILLING_SUBSCRIPTION_CANCELED",
            "BILLING_SUBSCRIPTION_REACTIVATED",
            "BILLING_WEBHOOK_FAILED",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  return ok({ notes, recentSaActions });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const superAdminId = await requireSuperAdmin();
    const { ipAddress, userAgent } = extractRequestMeta(req);
    const body = postSchema.parse(await req.json());

    const tenant = await db.tenant.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!tenant) throw new NotFoundError("Tenant");

    await auditLog({
      tenantId: tenant.id,
      userId: superAdminId,
      action: "SA_INTERNAL_NOTE",
      entity: "Tenant",
      entityId: tenant.id,
      summary: { body: body.body },
      ipAddress,
      userAgent,
    });

    return ok({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
