/**
 * GET /api/v1/portal/appointments — Patient's appointments (paginated)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ok, apiError, handleApiError } from "@/lib/api";
import { parsePagination, buildMeta } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";
import { auditLog } from "@/lib/audit";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);
    const { searchParams } = new URL(req.url);

    // Single appointment lookup
    const id = searchParams.get("id");
    if (id) {
      const appointment = await db.appointment.findFirst({
        where: {
          id,
          tenantId: ctx.tenantId,
          patientId: ctx.patientId,
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          location: true,
          videoLink: true,
          appointmentType: {
            select: { name: true, sessionType: true, color: true },
          },
          provider: { select: { name: true } },
        },
      });

      if (!appointment) {
        return apiError("NOT_FOUND", "Sessão não encontrada.", 404);
      }

      // Redact video link if too far out
      if (appointment.videoLink) {
        const minutesUntil = (new Date(appointment.startsAt).getTime() - Date.now()) / 60_000;
        if (minutesUntil > ctx.tenant.portalVideoLinkAdvanceMin) {
          return ok({ ...appointment, videoLink: null });
        }
      }

      return ok(appointment);
    }

    const { page, pageSize, skip } = parsePagination(searchParams);

    const tab = searchParams.get("tab") ?? "upcoming"; // "upcoming" | "past"
    const now = new Date();

    const where: Prisma.AppointmentWhereInput = {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      ...(tab === "upcoming"
        ? { startsAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } }
        : { startsAt: { lt: now } }),
    };

    const [total, appointments] = await Promise.all([
      db.appointment.count({ where }),
      db.appointment.findMany({
        where,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          location: true,
          videoLink: true,
          appointmentType: {
            select: { name: true, sessionType: true, color: true },
          },
          provider: { select: { name: true } },
          // NEVER expose adminNotes to patient
        },
        orderBy: { startsAt: tab === "upcoming" ? "asc" : "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    // Redact videoLink if too far out
    const safeAppointments = appointments.map((a) => {
      if (!a.videoLink) return a;
      const minutesUntil =
        (new Date(a.startsAt).getTime() - Date.now()) / 60_000;
      if (minutesUntil > ctx.tenant.portalVideoLinkAdvanceMin) {
        return { ...a, videoLink: null };
      }
      return a;
    });

    return ok(safeAppointments, buildMeta(total, { page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── PATCH: Cancel appointment ──────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    if (!ctx.tenant.portalRescheduleEnabled) {
      return apiError("FORBIDDEN", "Cancelamento não habilitado pelo portal.", 403);
    }

    const body = await req.json();
    const schema = z.object({
      appointmentId: z.string().uuid(),
      action: z.literal("cancel"),
    });
    const { appointmentId } = schema.parse(body);

    const appointment = await db.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
    });

    if (!appointment) {
      return apiError("NOT_FOUND", "Sessão não encontrada ou já finalizada.", 404);
    }

    // Cannot cancel if appointment is in the past or within 24 hours
    const hoursUntil = (new Date(appointment.startsAt).getTime() - Date.now()) / (60 * 60 * 1000);
    if (hoursUntil < 24) {
      return apiError("BAD_REQUEST", "Não é possível cancelar com menos de 24 horas de antecedência.", 400);
    }

    await db.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELED" },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "APPOINTMENT_CANCEL",
      entity: "Appointment",
      entityId: appointmentId,
      summary: { cancelledBy: "patient", patientId: ctx.patientId },
    });

    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
