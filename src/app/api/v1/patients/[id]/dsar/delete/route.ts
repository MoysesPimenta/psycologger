/**
 * POST /api/v1/patients/[id]/dsar/delete
 *
 * Hard-delete all patient data (LGPD Article 17).
 * Requires: tenant:edit permission
 * Body: { confirm: true, reason?: string }
 * Response: 204 No Content on success
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { noContent, handleApiError, apiError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { deletePatientData } from "@/lib/lgpd-dsar";
import { db } from "@/lib/db";

const requestSchema = z.object({
  confirm: z.literal(true),
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:edit");
    requireTenant(ctx);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = requestSchema.parse(await req.json());

    // Verify patient exists in tenant
    const patient = await db.patient.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      select: { id: true, fullName: true },
    });

    if (!patient) {
      return apiError("NOT_FOUND", "Paciente não encontrado", 404);
    }

    // Audit deletion request
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "DSAR_DELETION_REQUESTED",
      entity: "Patient",
      entityId: params.id,
      summary: {
        patientName: patient.fullName,
        reason: body.reason || "Não especificado",
      },
      ipAddress,
      userAgent,
    });

    // Delete patient data
    await deletePatientData(ctx.tenantId, params.id);

    // Audit deletion completion
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "DSAR_DELETION_COMPLETED",
      entity: "Patient",
      entityId: params.id,
      summary: {
        patientName: patient.fullName,
        deletedAt: new Date().toISOString(),
      },
      ipAddress,
      userAgent,
    });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
