/**
 * GET /api/v1/patients/[id]/dsar/export
 *
 * Export all patient data as JSON (LGPD Article 18).
 * Requires: patients:edit permission
 * Response: 200 with JSON file download
 */

import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { ok, handleApiError, apiError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { exportPatientData } from "@/lib/lgpd-dsar";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Verify patient exists in tenant
    const patient = await db.patient.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      select: { id: true, fullName: true },
    });

    if (!patient) {
      return apiError("NOT_FOUND", "Paciente não encontrado", 404);
    }

    // Export data
    const exportData = await exportPatientData(ctx.tenantId, params.id);

    // Audit log
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "DSAR_EXPORT_COMPLETED",
      entity: "Patient",
      entityId: params.id,
      summary: {
        patientName: patient.fullName,
        recordsExported: {
          appointments: exportData.appointments.length,
          clinicalSessions: exportData.clinicalSessions.length,
          journalEntries: exportData.journalEntries.length,
          charges: exportData.charges.length,
        },
      },
      ipAddress,
      userAgent,
    });

    // Return JSON with Content-Disposition header for download
    const response = new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dsar-export-${params.id}-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });

    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
