/**
 * PATCH  /api/v1/appointment-types/[id]  — update an appointment type
 * DELETE /api/v1/appointment-types/[id]  — soft-delete (isActive = false)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError, apiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sessionType: z.enum(["IN_PERSON", "ONLINE", "EVALUATION", "GROUP"]).optional(),
  defaultDurationMin: z.number().int().min(5).max(480).optional(),
  defaultPriceCents: z.number().int().min(0).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const existing = await db.appointmentType.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
    });
    if (!existing) return apiError("NOT_FOUND", "Tipo de consulta não encontrado.", 404);

    const body = updateSchema.parse(await req.json());

    const updated = await db.appointmentType.update({
      where: { id: params.id },
      data: body,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "APPOINTMENT_TYPE_UPDATE",
      entity: "AppointmentType",
      entityId: params.id,
      summary: { fields: Object.keys(body) },
      ipAddress,
      userAgent,
    });

    return ok(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const existing = await db.appointmentType.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
    });
    if (!existing) return apiError("NOT_FOUND", "Tipo de consulta não encontrado.", 404);

    // Soft-delete: mark inactive so existing appointments still reference it
    await db.appointmentType.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "APPOINTMENT_TYPE_DELETE",
      entity: "AppointmentType",
      entityId: params.id,
      summary: { name: existing.name },
      ipAddress,
      userAgent,
    });

    return ok({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
