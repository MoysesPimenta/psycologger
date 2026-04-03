/**
 * GET   /api/v1/settings  — get tenant settings
 * PATCH /api/v1/settings  — update tenant settings
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  timezone: z.string().max(50).optional(),
  sharedPatientPool: z.boolean().optional(),
  adminCanViewClinical: z.boolean().optional(),
  calendarShowPatient: z.enum(["NONE", "FIRST_NAME", "FULL_NAME"]).optional(),
  defaultAppointmentDurationMin: z.number().int().min(5).max(480).optional(),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Formato esperado: HH:MM").refine(
    (v) => { const [h, m] = v.split(":").map(Number); return h >= 0 && h <= 23 && m >= 0 && m <= 59; },
    "Horário inválido"
  ).optional(),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Formato esperado: HH:MM").refine(
    (v) => { const [h, m] = v.split(":").map(Number); return h >= 0 && h <= 23 && m >= 0 && m <= 59; },
    "Horário inválido"
  ).optional(),
  workingDays: z.string().regex(/^[0-6](,[0-6])*$/, "Formato esperado: 0,1,2,3,4,5,6 (dom=0, seg=1, …)").optional(),
  phone: z.string().max(20).optional().nullable(),
  website: z.string().url().optional().nullable(),
  addressLine: z.string().max(200).optional().nullable(),
  addressCity: z.string().max(100).optional().nullable(),
  addressState: z.string().max(2).optional().nullable(),
  addressZip: z.string().max(10).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:view");

    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        locale: true,
        sharedPatientPool: true,
        adminCanViewClinical: true,
        calendarShowPatient: true,
        defaultAppointmentDurationMin: true,
        workingHoursStart: true,
        workingHoursEnd: true,
        workingDays: true,
        phone: true,
        website: true,
        addressLine: true,
        addressCity: true,
        addressState: true,
        addressZip: true,
        plan: true,
        planSince: true,
        createdAt: true,
        // Exclude secrets
      },
    });

    return ok(tenant);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = updateSchema.parse(await req.json());

    const tenant = await db.tenant.update({
      where: { id: ctx.tenantId },
      data: body,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "TENANT_SETTINGS_UPDATE",
      entity: "Tenant",
      entityId: ctx.tenantId,
      summary: { fields: Object.keys(body) },
      ipAddress,
      userAgent,
    });

    return ok(tenant);
  } catch (err) {
    return handleApiError(err);
  }
}
