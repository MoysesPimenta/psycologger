/**
 * GET   /api/v1/appointments/[id]
 * PATCH /api/v1/appointments/[id]
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError, NotFoundError, ConflictError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "appointments:view");

    const appointment = await db.appointment.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      include: {
        patient: { select: { id: true, fullName: true, preferredName: true, email: true, phone: true } },
        provider: { select: { id: true, name: true, email: true } },
        appointmentType: true,
        clinicalSession: { select: { id: true, noteText: true, templateKey: true } },
        charges: {
          include: {
            payments: { select: { id: true, amountCents: true, method: true, paidAt: true } },
          },
        },
        reminderLogs: { orderBy: { sentAt: "desc" }, take: 5 },
      },
    });

    if (!appointment) throw new NotFoundError("Appointment");
    return ok(appointment);
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  status: z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"]).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  location: z.string().max(200).optional().nullable(),
  videoLink: z.string().url().optional().nullable().or(z.literal("")),
  adminNotes: z.string().max(1000).optional().nullable(),
  appointmentTypeId: z.string().uuid().optional(),
  /**
   * When cancelling a recurring appointment:
   * - "THIS"             → cancel only this occurrence (default)
   * - "THIS_AND_FUTURE"  → cancel this + all future occurrences in the series
   */
  cancelScope: z.enum(["THIS", "THIS_AND_FUTURE"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "appointments:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const existing = await db.appointment.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new NotFoundError("Appointment");

    const body = patchSchema.parse(await req.json());

    // If rescheduling, check for conflicts
    if (body.startsAt || body.endsAt) {
      const startsAt = body.startsAt ? new Date(body.startsAt) : existing.startsAt;
      const endsAt = body.endsAt ? new Date(body.endsAt) : existing.endsAt;
      const conflict = await db.appointment.findFirst({
        where: {
          tenantId: ctx.tenantId,
          providerUserId: existing.providerUserId,
          id: { not: params.id },
          status: { notIn: ["CANCELED", "NO_SHOW"] },
          AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }],
        },
      });
      if (conflict) {
        throw new ConflictError("O profissional já possui uma consulta neste horário.");
      }
    }

    const isCancelling = body.status === "CANCELED";
    const cancelFuture = isCancelling && body.cancelScope === "THIS_AND_FUTURE";

    const updated = await db.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id: params.id, tenantId: ctx.tenantId },
        data: {
          ...(body.status && { status: body.status }),
          ...(body.startsAt && { startsAt: new Date(body.startsAt) }),
          ...(body.endsAt && { endsAt: new Date(body.endsAt) }),
          ...(body.location !== undefined && { location: body.location }),
          ...(body.videoLink !== undefined && { videoLink: body.videoLink || null }),
          ...(body.adminNotes !== undefined && { adminNotes: body.adminNotes }),
          ...(body.appointmentTypeId && { appointmentTypeId: body.appointmentTypeId }),
        },
      });

      // Cancel this + all future occurrences in the same recurrence series
      if (cancelFuture && existing.recurrenceId) {
        await tx.appointment.updateMany({
          where: {
            tenantId: ctx.tenantId,
            recurrenceId: existing.recurrenceId,
            // All future occurrences (strictly after the selected one)
            startsAt: { gt: existing.startsAt },
            status: { notIn: ["CANCELED", "NO_SHOW"] },
          },
          data: { status: "CANCELED" },
        });
      }

      return appt;
    });

    const action =
      body.status === "CANCELED" ? "APPOINTMENT_CANCEL"
        : body.status === "NO_SHOW" ? "APPOINTMENT_NO_SHOW"
        : body.status === "COMPLETED" ? "APPOINTMENT_COMPLETE"
        : "APPOINTMENT_UPDATE";

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action,
      entity: "Appointment",
      entityId: params.id,
      summary: {
        newStatus: body.status,
        fields: Object.keys(body),
        cancelScope: body.cancelScope ?? "THIS",
        recurrenceId: existing.recurrenceId ?? undefined,
      },
      ipAddress,
      userAgent,
    });

    return ok(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
