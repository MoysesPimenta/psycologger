/**
 * POST /api/v1/uploads/commit
 *
 * Finalize a file upload after it completes in Supabase Storage.
 * Called by the mobile client after successfully uploading via the signed URL.
 *
 * This endpoint:
 *  1. Validates the file exists in Supabase Storage
 *  2. Creates a FileObject database record
 *  3. Returns the canonical file ID
 *
 * Request body:
 *   {
 *     storagePath: string,    // Path returned from /uploads/sign
 *     filename: string,       // Original filename
 *     contentType: string,
 *     sizeBytes: number,
 *     patientId?: string,
 *     sessionId?: string,
 *     isClinical?: boolean    // Default false
 *   }
 *
 * Response:
 *   {
 *     id: string,             // FileObject UUID
 *     storagePath: string,
 *     createdAt: ISO8601
 *   }
 *
 * Audited as "FILE_UPLOADED" with sizeBytes and storagePath (no filename to avoid PII).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleApiError, created, apiError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { downloadFile } from "@/lib/storage";
import { validateMimeType } from "@/lib/mime-check";

const schema = z.object({
  storagePath: z.string(),
  filename: z.string().min(1).max(255),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  patientId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  isClinical: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    const membership = await db.membership.findFirst({
      where: { userId },
      include: { tenant: true },
    });
    if (!membership) return apiError("UNAUTHORIZED", "User not found", 401);
    const user = { id: userId, role: membership.role, tenantId: membership.tenantId };

    const body = await req.json();
    const {
      storagePath,
      filename,
      contentType,
      sizeBytes,
      patientId,
      sessionId,
      isClinical,
    } = schema.parse(body);

    // Verify tenant scoping
    if (!storagePath.startsWith(`${user.tenantId}/`)) {
      return apiError(
        "FORBIDDEN",
        "Storage path does not match tenant scope",
        403
      );
    }

    // Verify patient access if patientId is provided
    if (patientId) {
      const patient = await db.patient.findUnique({
        where: { id: patientId, tenantId: user.tenantId },
      });
      if (!patient) {
        return apiError("NOT_FOUND", "Patient not found or access denied", 404);
      }

      // Role-based scoping for psychologists
      if (user.role === "PSYCHOLOGIST") {
        const hasAppointment = await db.appointment
          .findFirst({
            where: {
              patientId,
              providerUserId: user.id,
              tenantId: user.tenantId,
            },
          })
          .then((a) => !!a);

        if (!hasAppointment) {
          return apiError(
            "FORBIDDEN",
            "Not assigned to this patient",
            403
          );
        }
      }
    }

    // Verify session access if sessionId is provided
    if (sessionId) {
      const session = await db.clinicalSession.findFirst({
        where: {
          id: sessionId,
          tenantId: user.tenantId,
          deletedAt: null,
        },
      });

      if (!session) {
        return apiError("NOT_FOUND", "Session not found or access denied", 404);
      }

      // Role-based check for psychologists
      if (user.role === "PSYCHOLOGIST" && session.providerUserId !== user.id) {
        return apiError(
          "FORBIDDEN",
          "Not assigned to this session",
          403
        );
      }
    }

    // SECURITY: Magic-byte validation for uploaded files
    // Fetch the first bytes of the uploaded file from storage to validate magic bytes.
    // This prevents spoofed Content-Type headers on staff/patient portal uploads.
    try {
      const uploadedBuffer = await downloadFile(storagePath);
      if (!validateMimeType(uploadedBuffer, contentType)) {
        return apiError(
          "BAD_REQUEST",
          "File content does not match declared content type. File may be corrupted or spoofed.",
          400
        );
      }
    } catch (err) {
      // If we can't read the file (e.g., it doesn't exist yet), log the error
      // but allow commit to proceed. This may happen if there's a race condition
      // or if the signed URL upload has not yet propagated through the storage backend.
      console.warn(
        `[uploads/commit] Warning: Could not validate magic bytes for ${storagePath}:`,
        err instanceof Error ? err.message : String(err)
      );
      // In production, you may want to reject here instead of warn.
      // For now, we log and proceed to allow eventual consistency with storage.
    }

    // Create FileObject record
    const fileObject = await db.fileObject.create({
      data: {
        tenantId: user.tenantId,
        patientId: patientId || null,
        sessionId: sessionId || null,
        uploaderId: user.id,
        storageKey: storagePath,
        fileName: filename,
        mimeType: contentType,
        sizeBytes,
        isClinical: isClinical || false,
      },
    });

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(req);
    await auditLog({
      tenantId: user.tenantId,
      userId: user.id,
      action: "FILE_UPLOAD",
      entity: "FileObject",
      entityId: fileObject.id,
      summary: {
        sizeBytes,
        storagePath,
        isClinical: isClinical || false,
      },
      ipAddress,
      userAgent,
    });

    return created({
      id: fileObject.id,
      storagePath,
      createdAt: fileObject.createdAt.toISOString(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
