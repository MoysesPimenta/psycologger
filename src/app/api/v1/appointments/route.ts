/**
 * GET  /api/v1/appointments
 * POST /api/v1/appointments
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, parsePagination, buildMeta, ConflictError, NotFoundError, BadRequestError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { sendAppointmentConfirmation } from "@/lib/email";
import { format, addWeeks, addMonths } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
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
  recurrenceTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), // "HH:mm" validated range
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

/**
 * Apply the same local (wall-clock) time from a reference date onto a target date,
 * using the tenant's IANA timezone. This correctly handles DST transitions:
 * e.g. "9:00 AM São Paulo" is always 9:00 AM regardless of UTC offset changes.
 *
 * 1. Convert the reference date to the tenant's local time → extract HH:MM
 * 2. Set that HH:MM on the target date in the tenant's local time
 * 3. Convert back to UTC for storage
 */
function applyLocalTime(targetDate: Date, referenceDate: Date, timezone: string): Date {
  // Get the local hours/minutes of the reference date in the tenant's timezone
  const refLocal = toZonedTime(referenceDate, timezone);
  const hours = refLocal.getHours();
  const minutes = refLocal.getMinutes();

  // Set the same local hours/minutes on the target date in the tenant's timezone
  const targetLocal = toZonedTime(targetDate, timezone);
  targetLocal.setHours(hours, minutes, 0, 0);

  // Convert back to UTC
  return fromZonedTime(targetLocal, timezone);
}

/**
 * Check for scheduling conflicts. Accepts an optional transaction client
 * so the check can run inside a transaction to prevent TOCTOU races.
 */
async function checkConflict(
  tenantId: string,
  providerUserId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any = db,
) {
  const conflict = await client.appointment.findFirst({
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
    // PSYCHOLOGIST can only see their own appointments; admins can filter by any provider
    const requestedProvider = searchParams.get("providerId");
    const providerUserId = ctx.role === "PSYCHOLOGIST"
      ? ctx.userId
      : requestedProvider ?? ctx.userId;
    const patientId = searchParams.get("patientId");
    const status = searchParams.get("status");

    const where = {
      tenantId: ctx.tenantId,
      // Filter on startsAt for both bounds so appointments that start within the
      // requested window are always included, even if they end past the boundary
      // (e.g. a 21:00 appointment that ends at 00:50 UTC the next day).
      ...(from && to
        ? { startsAt: { gte: new Date(from), lte: new Date(to) } }
        : from
        ? { startsAt: { gte: new Date(from) } }
        : to
        ? { startsAt: { lte: new Date(to) } }
        : {}),
      ...(providerUserId && { providerUserId }),
      ...(patientId && { patientId }),
      // If a specific status is requested return it; otherwise exclude CANCELED
      // (pass status=ALL to get every status, e.g. for patient history views)
      ...(status === "ALL"
        ? {}
        : status
        ? { status: status as never }
        : { status: { not: "CANCELED" as never } }),
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

    // Validate time range is positive
    if (startsAt >= endsAt) {
      throw new BadRequestError("O horário de início deve ser anterior ao horário de término.");
    }

    // Validate patient belongs to this tenant
    const patientCheck = await db.patient.findFirst({
      where: { id: body.patientId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!patientCheck) throw new NotFoundError("Patient");

    // Validate provider belongs to this tenant
    const providerCheck = await db.membership.findFirst({
      where: { userId: body.providerUserId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!providerCheck) throw new NotFoundError("Provider");

    const durationMs = endsAt.getTime() - startsAt.getTime();

    // Fetch tenant timezone for recurring slot generation
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: ctx.tenantId },
      select: { timezone: true },
    });
    const tz = tenant.timezone || "America/Sao_Paulo";

    // ── Build list of slots to create ────────────────────────────────────────
    const slots: Array<{ startsAt: Date; endsAt: Date }> = [{ startsAt, endsAt }];

    if (body.recurrenceRrule && body.recurrenceOccurrences && body.recurrenceOccurrences > 1) {
      let current = startsAt;
      for (let i = 1; i < body.recurrenceOccurrences; i++) {
        current = nextOccurrence(current, body.recurrenceRrule);
        // Apply the same wall-clock time (in the tenant's timezone) to each slot.
        // This handles DST transitions correctly: "9:00 AM São Paulo" stays
        // 9:00 AM even if the UTC offset changes between summer/winter.
        const slotStart = applyLocalTime(current, startsAt, tz);
        const slotEnd = new Date(slotStart.getTime() + durationMs);
        slots.push({ startsAt: slotStart, endsAt: slotEnd });
      }
    }

    // ── Transaction: conflict check + recurrence + all appointment slots ──────
    // Conflict check MUST run inside the transaction to prevent TOCTOU races
    // where two concurrent requests both pass the check and both create.
    const { firstAppointment, createdCount } = await db.$transaction(async (tx) => {
      // Verify no conflict for the first slot within the transaction
      const conflict = await checkConflict(ctx.tenantId, body.providerUserId, startsAt, endsAt, undefined, tx);
      if (conflict) {
        throw new ConflictError(
          `O profissional já possui uma consulta neste horário (${conflict.id}).`
        );
      }

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
    }, { timeout: 30000 }); // 30s — recurring appointments create many slots sequentially

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
