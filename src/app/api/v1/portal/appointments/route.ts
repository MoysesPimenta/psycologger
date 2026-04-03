/**
 * GET /api/v1/portal/appointments — Patient's appointments (paginated)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/api";
import { parsePagination, buildMeta } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);
    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(searchParams);

    const tab = searchParams.get("tab") ?? "upcoming"; // "upcoming" | "past"
    const now = new Date();

    const where = {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      ...(tab === "upcoming"
        ? { startsAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] as const } }
        : { startsAt: { lt: now } }),
    } as never;

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
