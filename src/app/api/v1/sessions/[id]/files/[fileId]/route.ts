/**
 * DELETE /api/v1/sessions/[id]/files/[fileId]
 * GET    /api/v1/sessions/[id]/files/[fileId]  — refresh signed URL
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { ok, handleApiError, NotFoundError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { deleteFile, signedDownloadUrl } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "files:downloadClinical");
    requireTenant(ctx);

    // Verify session exists and user has access (PSYCHOLOGIST only sees own sessions)
    const session = await db.clinicalSession.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      },
      select: { id: true },
    });
    if (!session) throw new NotFoundError("Session");

    const file = await db.fileObject.findFirst({
      where: { id: params.fileId, sessionId: params.id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, storageKey: true, createdAt: true },
    });
    if (!file) throw new NotFoundError("File");

    const downloadUrl = await signedDownloadUrl(file.storageKey);
    return ok({ ...file, downloadUrl });
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
    requireTenant(ctx);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Verify session exists and user has access
    const sessionCheck = await db.clinicalSession.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      },
      select: { id: true },
    });
    if (!sessionCheck) throw new NotFoundError("Session");

    const file = await db.fileObject.findFirst({
      where: { id: params.fileId, sessionId: params.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!file) throw new NotFoundError("File");

    // Delete from Supabase Storage first (non-fatal if missing)
    try { await deleteFile(file.storageKey); } catch (e) {
      console.error("[files] Storage delete failed (continuing):", e);
    }

    // Remove DB record
    await db.fileObject.delete({ where: { id: params.fileId, tenantId: ctx.tenantId } });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "FILE_DELETE",
      entity: "FileObject",
      entityId: params.fileId,
      summary: { sessionId: params.id, fileName: file.fileName },
      ipAddress,
      userAgent,
    });

    return ok({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
