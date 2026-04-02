/**
 * PATCH  /api/v1/patients/[id]/files/[fileId]  — restore a soft-deleted file
 * DELETE /api/v1/patients/[id]/files/[fileId]  — soft-delete a file
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, noContent, handleApiError, NotFoundError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "files:delete");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const file = await db.fileObject.findFirst({
      where: { id: params.fileId, patientId: params.id, tenantId: ctx.tenantId },
    });
    if (!file) throw new NotFoundError("File");

    const restored = await db.fileObject.update({
      where: { id: params.fileId, tenantId: ctx.tenantId },
      data: { deletedAt: null, deletedBy: null },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "FILE_RESTORE",
      entity: "FileObject",
      entityId: params.fileId,
      summary: { patientId: params.id, fileName: file.fileName },
      ipAddress,
      userAgent,
    });

    return ok(restored);
  } catch (err) {
    return handleApiError(err);
  }
}

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
      where: { id: params.fileId, tenantId: ctx.tenantId },
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
