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
import { sendAppointmentConfirmation } from "@/lib/email";
import { format, addWeeks, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  recurrenceOccurrences: z.number().int().min(1).max(104).optional(),
  recurrenceTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), // "HH:mm" for recurring sessions
  // Notifications
  notifyPatient: z.boolean().optional(),
  notifyMethods: z.array(z.enum(["EMAIL", "WHATSAPP", "SMS"])).optional(),
});

/** Advance a date by one recurrence step according to the RRULE string */
function nextOccurrence(date: Date, rrule: string): Date {
  if (rrule.includes("FREQ=MONTHLY")) return addMonths(date, 1);
  const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
  return addWeeks(date, interval);
}

/** Apply an "HH:mm" time string to a Date, returning a new Date */
function applyTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const result = new Date(date);
  result.setHours(h, m, 0, 0);
  return result;
}

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

    // Conflict detection for the first slot
    const conflict = await checkConflict(ctx.tenantId, body.providerUserId, startsAt, endsAt);
    if (conflict) {
      throw new ConflictError(
        `O profissional já possui uma consulta neste horário (${conflict.id}).`
      );
    }

    const durationMs = endsAt.getTime() - startsAt.getTime();

    // ── Build list of slots to create ────────────────────────────────────────
    const slots: Array<{ startsAt: Date; endsAt: Date }> = [{ startsAt, endsAt }];

    if (body.recurrenceRrule && body.recurrenceOccurrences && body.recurrenceOccurrences > 1) {
      let current = startsAt;
      for (let i = 1; i < body.recurrenceOccurrences; i++) {
        current = nextOccurrence(current, body.recurrenceRrule);
        // Override time for recurring sessions if a specific time was set
        const slotStart = body.recurrenceTime
          ? applyTime(current, body.recurrenceTime)
          : new Date(current);
        const slotEnd = new Date(slotStart.getTime() + durationMs);
        slots.push({ startsAt: slotStart, endsAt: slotEnd });
      }
    }

    // ── Transaction: create recurrence record + all appointment slots ─────────
    const { firstAppointment, createdCount } = await db.$transaction(async (tx) => {
      let recurrenceId: string | undefined;

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let first: any = null;
      let count = 0;

      for (const slot of slots) {
        // Skip slots that conflict (soft-skip, don't abort the whole transaction)
        const hasConflict = await tx.appointment.findFirst({
          where: {
            tenantId: ctx.tenantId,
            providerUserId: body.providerUserId,
            status: { notIn: ["CANCELED", "NO_SHOW"] },
            AND: [
              { startsAt: { lt: slot.endsAt } },
              { endsAt: { gt: slot.startsAt } },
            ],
          },
        });
        if (hasConflict) continue;

        const appt = await tx.appointment.create({
          data: {
            tenantId: ctx.tenantId,
            patientId: body.patientId,
            providerUserId: body.providerUserId,
            appointmentTypeId: body.appointmentTypeId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
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

        if (!first) first = appt;
        count++;
      }

      if (!first) {
        throw new ConflictError(
          "Não foi possível criar nenhuma sessão: todos os horários estão ocupados."
        );
      }

      return { firstAppointment: first, createdCount: count };
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "APPOINTMENT_CREATE",
      entity: "Appointment",
      entityId: firstAppointment.id,
      summary: {
        patientId: body.patientId,
        providerUserId: body.providerUserId,
        totalCreated: createdCount,
        recurring: !!body.recurrenceRrule,
      },
      ipAddress,
      userAgent,
    });

    // Send confirmation email if requested and patient has an email
    if (body.notifyPatient && body.notifyMethods?.includes("EMAIL")) {
      try {
        const patient = await db.patient.findUnique({
          where: { id: body.patientId },
          select: { email: true, fullName: true, preferredName: true },
        });
        const tenant = await db.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: { name: true },
        });

        if (patient?.email) {
          await sendAppointmentConfirmation({
            to: patient.email,
            patientName: patient.preferredName ?? patient.fullName,
            appointmentDate: format(startsAt, "d 'de' MMMM 'de' yyyy", { locale: ptBR }),
            appointmentTime: format(startsAt, "HH:mm"),
            clinicName: tenant?.name ?? "Psycologger",
            location: body.location,
            videoLink: body.videoLink || undefined,
          });
        }
      } catch (emailErr) {
        // Non-fatal: log but don't fail the appointment creation
        console.error("[appointments] Failed to send confirmation email:", emailErr);
      }
    }

    return created({ ...firstAppointment, totalCreated: createdCount });
  } catch (err) {
    return handleApiError(err);
  }
}
