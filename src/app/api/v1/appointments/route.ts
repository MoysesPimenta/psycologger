/**
 * GET  /api/v1/appointments
 * POST /api/v1/appointments
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, parsePagination, buildMeta, ConflictError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const createSchema = z.object({
  patientId: z.string().uuid(),
  providerUserId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  location: z.string().max(200).optional(),
  videoLink: z.string().url().optional().or(z.literal("")),
  adminNotes: z.string().max(1000).optional(),
  // Recurring
  recurrenceRrule: z.string().optional(),
  recurrenceOccurrences: z.number().int().min(1).max(52).optional(),
});

async function checkConflict(
  tenantId: string,
  providerUserId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string
) {
  const conflict = await db.appointment.findFirst({
    where: {
      tenantId,
      providerUserId,
      status: { notIn: ["CANCELED", "NO_SHOW"] },
      id: excludeId ? { not: excludeId } : undefined,
      AND: [
        { startsAt: { lt: endsAt } },
        { endsAt: { gt: startsAt } },
      ],
    },
  });
  return conflict;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "appointments:view");

    const { searchParams } = new URL(req.url);
    const pagination = parsePagination(searchParams);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const providerUserId = searchParams.get("providerId") ?? ctx.userId;
    const patientId = searchParams.get("patientId");
    const status = searchParams.get("status");

    const where = {
      tenantId: ctx.tenantId,
      ...(from && { startsAt: { gte: new Date(from) } }),
      ...(to && { endsAt: { lte: new Date(to) } }),
      ...(providerUserId && { providerUserId }),
      ...(patientId && { patientId }),
      ...(status && { status: status as never }),
    };

    const [appointments, total] = await Promise.all([
      db.appointment.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true, preferredName: true } },
          provider: { select: { id: true, name: true } },
          appointmentType: { select: { id: true, name: true, color: true, defaultDurationMin: true } },
          clinicalSession: { select: { id: true } },
          charges: { select: { id: true, status: true, amountCents: true } },
        },
        orderBy: { startsAt: "asc" },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      db.appointment.count({ where }),
    ]);

    return ok(appointments, buildMeta(total, pagination));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "appointments:create");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = createSchema.parse(await req.json());
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);

    // Conflict detection
    const conflict = await checkConflict(ctx.tenantId, body.providerUserId, startsAt, endsAt);
    if (conflict) {
      throw new ConflictError(
        `O profissional já possui uma consulta neste horário (${conflict.id}).`
      );
    }

    let recurrenceId: string | undefined;

    const appointment = await db.$transaction(async (tx) => {
      // Create recurrence if requested
      if (body.recurrenceRrule) {
        const recurrence = await tx.recurrence.create({
          data: {
            tenantId: ctx.tenantId,
            rrule: body.recurrenceRrule,
            startsAt,
            occurrences: body.recurrenceOccurrences,
            createdById: ctx.userId,
          },
        });
        recurrenceId = recurrence.id;
      }

      return tx.appointment.create({
        data: {
          tenantId: ctx.tenantId,
          patientId: body.patientId,
          providerUserId: body.providerUserId,
          appointmentTypeId: body.appointmentTypeId,
          startsAt,
          endsAt,
          location: body.location ?? null,
          videoLink: body.videoLink || null,
          adminNotes: body.adminNotes ?? null,
          recurrenceId: recurrenceId ?? null,
        },
        include: {
          patient: { select: { id: true, fullName: true } },
          appointmentType: { select: { id: true, name: true } },
        },
      });
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "APPOINTMENT_CREATE",
      entity: "Appointment",
      entityId: appointment.id,
      summary: { patientId: body.patientId, providerUserId: body.providerUserId },
      ipAddress,
      userAgent,
    });

    return created(appointment);
  } catch (err) {
    return handleApiError(err);
  }
}
