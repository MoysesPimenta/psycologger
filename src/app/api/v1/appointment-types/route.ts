/**
 * GET  /api/v1/appointment-types  — list all active types for the tenant
 * POST /api/v1/appointment-types  — create a new appointment type
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { ok, created, handleApiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  sessionType: z.enum(["IN_PERSON", "ONLINE", "EVALUATION", "GROUP"]).default("IN_PERSON"),
  defaultDurationMin: z.number().int().min(5).max(480).default(50),
  defaultPriceCents: z.number().int().min(0).default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:view");
    requireTenant(ctx);

    const types = await db.appointmentType.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return ok(types);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:edit");
    requireTenant(ctx);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = createSchema.parse(await req.json());

    const type = await db.appointmentType.create({
      data: {
        tenantId: ctx.tenantId,
        ...body,
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "APPOINTMENT_TYPE_CREATE",
      entity: "AppointmentType",
      entityId: type.id,
      summary: { name: body.name },
      ipAddress,
      userAgent,
    });

    return created(type);
  } catch (err) {
    return handleApiError(err);
  }
}
