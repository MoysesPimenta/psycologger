/**
 * DELETE /api/v1/patients/[id]/files/[fileId]
 * Soft-deletes a patient-level file. Hard-deleted by cleanup job after 30 days.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { noContent, handleApiError, NotFoundError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "files:delete");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const file = await db.fileObject.findFirst({
      where: {
        id: params.fileId,
        patientId: params.id,
        tenantId: ctx.tenantId,
        deletedAt: null,
      },
    });
    if (!file) throw new NotFoundError("File");

    await db.fileObject.update({
      where: { id: params.fileId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "FILE_DELETE",
      entity: "FileObject",
      entityId: params.fileId,
      summary: {
        patientId: params.id,
        fileName: file.fileName,
        scheduledHardDeleteAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      ipAddress,
      userAgent,
    });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
