/**
 * GET   /api/v1/sessions/[id]
 * PATCH /api/v1/sessions/[id]
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, noContent, handleApiError, NotFoundError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { SOFT_DELETE_RETENTION_MS } from "@/lib/constants";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "sessions:view");

    const session = await db.clinicalSession.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        deletedAt: null,
        // PSYCHOLOGIST can only see their own sessions
        ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      },
      include: {
        patient: { select: { id: true, fullName: true, preferredName: true } },
        provider: { select: { id: true, name: true } },
        appointment: { select: { id: true, startsAt: true, status: true } },
        revisions: {
          orderBy: { editedAt: "desc" },
          take: 10,
          select: {
            id: true,
            editedAt: true,
            editedById: true,
            editedBy: { select: { name: true, email: true } },
          },
        },
        files: {
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });

    if (!session) throw new NotFoundError("Session");
    return ok(session);
  } catch (err) {
    return handleApiError(err);
  }
}

const updateSchema = z.object({
  noteText: z.string().min(1).max(50000).optional(),
  templateKey: z.enum(["FREE", "SOAP", "BIRP"]).optional(),
  tags: z.array(z.string()).optional(),
  restore: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "sessions:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = updateSchema.parse(await req.json());

    // Restore requires finding even soft-deleted records; normal edits must not touch deleted sessions
    // PSYCHOLOGIST can only edit their own sessions
    const existing = await db.clinicalSession.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        ...(body.restore !== true && { deletedAt: null }),
        ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      },
    });
    if (!existing) throw new NotFoundError("Session");

    // Restore from soft-delete
    if (body.restore === true) {
      if (!existing.deletedAt) {
        throw new NotFoundError("Session is not deleted");
      }
      const restored = await db.clinicalSession.update({
        where: { id: params.id, tenantId: ctx.tenantId },
        data: { deletedAt: null, deletedBy: null },
      });
      await auditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "SESSION_RESTORE",
        entity: "ClinicalSession",
        entityId: params.id,
        summary: { patientId: existing.patientId },
        ipAddress,
        userAgent,
      });
      return ok(restored);
    }

    const updated = await db.$transaction(async (tx) => {
      const sess = await tx.clinicalSession.update({
        where: { id: params.id, tenantId: ctx.tenantId },
        data: {
          ...(body.noteText !== undefined && { noteText: body.noteText }),
          ...(body.templateKey && { templateKey: body.templateKey }),
          ...(body.tags !== undefined && { tags: body.tags }),
        },
      });

      // Store revision if note changed
      if (body.noteText !== undefined && body.noteText !== existing.noteText) {
        await tx.sessionRevision.create({
          data: {
            tenantId: ctx.tenantId,
            sessionId: params.id,
            noteText: body.noteText,
            editedById: ctx.userId,
          },
        });
      }

      return sess;
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "SESSION_UPDATE",
      entity: "ClinicalSession",
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

/**
 * DELETE /api/v1/sessions/[id]
 * Soft-deletes a session. The record is hidden immediately and hard-deleted
 * by the cleanup job after 30 days.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "sessions:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const existing = await db.clinicalSession.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Session");

    await db.clinicalSession.update({
      where: { id: params.id, tenantId: ctx.tenantId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "SESSION_DELETE",
      entity: "ClinicalSession",
      entityId: params.id,
      summary: { patientId: existing.patientId, scheduledHardDeleteAt: new Date(Date.now() + SOFT_DELETE_RETENTION_MS) },
      ipAddress,
      userAgent,
    });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
