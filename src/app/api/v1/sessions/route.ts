/**
 * GET  /api/v1/sessions
 * POST /api/v1/sessions
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, parsePagination, buildMeta } from "@/lib/api";
import { requirePermission, getPatientScope } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const createSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  templateKey: z.enum(["FREE", "SOAP", "BIRP"]).default("FREE"),
  noteText: z.string().min(1).max(50000),
  tags: z.array(z.string()).default([]),
  sessionDate: z.string().datetime(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    requirePermission(ctx, "sessions:view");

    const { searchParams } = new URL(req.url);
    const pagination = parsePagination(searchParams);
    const patientId = searchParams.get("patientId");

    const scope = getPatientScope(ctx);
    const sessions = await db.clinicalSession.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(scope === "ASSIGNED" && { providerUserId: ctx.userId }),
        ...(patientId && { patientId }),
      },
      select: {
        id: true,
        patientId: true,
        providerUserId: true,
        templateKey: true,
        tags: true,
        sessionDate: true,
        createdAt: true,
        updatedAt: true,
        patient: { select: { id: true, fullName: true } },
        provider: { select: { id: true, name: true } },
        // Note text excluded from list view for performance
      },
      orderBy: { sessionDate: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    });

    const total = await db.clinicalSession.count({
      where: {
        tenantId: ctx.tenantId,
        ...(scope === "ASSIGNED" && { providerUserId: ctx.userId }),
        ...(patientId && { patientId }),
      },
    });

    return ok(sessions, buildMeta(total, pagination));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    requirePermission(ctx, "sessions:create");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = createSchema.parse(await req.json());

    const session = await db.$transaction(async (tx) => {
      const sess = await tx.clinicalSession.create({
        data: {
          tenantId: ctx.tenantId,
          appointmentId: body.appointmentId ?? null,
          patientId: body.patientId,
          providerUserId: ctx.userId,
          templateKey: body.templateKey,
          noteText: body.noteText,
          tags: body.tags,
          sessionDate: new Date(body.sessionDate),
        },
      });

      // Store initial revision
      await tx.sessionRevision.create({
        data: {
          tenantId: ctx.tenantId,
          sessionId: sess.id,
          noteText: body.noteText,
          editedById: ctx.userId,
        },
      });

      // Mark appointment as completed if linked
      if (body.appointmentId) {
        await tx.appointment.update({
          where: { id: body.appointmentId },
          data: { status: "COMPLETED" },
        });
      }

      return sess;
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "SESSION_CREATE",
      entity: "ClinicalSession",
      entityId: session.id,
      summary: { patientId: body.patientId, templateKey: body.templateKey },
      ipAddress,
      userAgent,
    });

    return created(session);
  } catch (err) {
    return handleApiError(err);
  }
}
