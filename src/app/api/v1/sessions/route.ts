/**
 * GET  /api/v1/sessions
 * POST /api/v1/sessions
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, parsePagination, buildMeta, NotFoundError, BadRequestError } from "@/lib/api";
import { requirePermission, getPatientScope } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

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
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "sessions:view");

    const { searchParams } = new URL(req.url);
    const pagination = parsePagination(searchParams);
    const patientId = searchParams.get("patientId");

    const scope = getPatientScope(ctx);
    const sessions = await db.clinicalSession.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null, // exclude soft-deleted
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
        deletedAt: null, // exclude soft-deleted
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
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "sessions:create");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Rate limit session creation: 100 per hour per user
    const rl = await rateLimit(`sessions:${ctx.userId}`, 100, 3600 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Limite de sessões atingido. Tente novamente mais tarde." } },
        { status: 429 }
      );
    }

    const body = createSchema.parse(await req.json());

    // ── Validate patient belongs to this tenant ──
    const patient = await db.patient.findFirst({
      where: { id: body.patientId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundError("Patient");

    // ── Validate appointment belongs to this tenant (if provided) ──
    if (body.appointmentId) {
      const appt = await db.appointment.findFirst({
        where: { id: body.appointmentId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!appt) throw new NotFoundError("Appointment");
    }

    const session = await db.$transaction(async (tx) => {
      // Guard: prevent duplicate sessions for the same appointment
      if (body.appointmentId) {
        const existingSession = await tx.clinicalSession.findFirst({
          where: { appointmentId: body.appointmentId, tenantId: ctx.tenantId, deletedAt: null },
          select: { id: true },
        });
        if (existingSession) {
          throw new BadRequestError("Esta consulta já possui uma sessão clínica vinculada.");
        }
      }

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

      // Mark appointment as completed if linked (only if still in a non-final state)
      if (body.appointmentId) {
        await tx.appointment.updateMany({
          where: {
            id: body.appointmentId,
            tenantId: ctx.tenantId,
            status: { notIn: ["CANCELED", "NO_SHOW", "COMPLETED"] as const },
          },
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
