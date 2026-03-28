/**
 * GET   /api/v1/sessions/[id]
 * PATCH /api/v1/sessions/[id]
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError, NotFoundError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext();
    requirePermission(ctx, "sessions:view");

    const session = await db.clinicalSession.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
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
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext();
    requirePermission(ctx, "sessions:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const existing = await db.clinicalSession.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new NotFoundError("Session");

    const body = updateSchema.parse(await req.json());

    const updated = await db.$transaction(async (tx) => {
      const sess = await tx.clinicalSession.update({
        where: { id: params.id },
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
