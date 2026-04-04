/**
 * GET /api/v1/portal/dashboard — Aggregated patient dashboard data
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    // Run queries in parallel
    const [nextAppointment, pendingCharges, recentJournalEntries, unreadNotifications] =
      await Promise.all([
        // Next upcoming appointment
        db.appointment.findFirst({
          where: {
            tenantId: ctx.tenantId,
            patientId: ctx.patientId,
            startsAt: { gte: new Date() },
            status: { in: ["SCHEDULED", "CONFIRMED"] },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            location: true,
            videoLink: true,
            appointmentType: { select: { name: true, sessionType: true, color: true } },
            provider: { select: { name: true } },
          },
          orderBy: { startsAt: "asc" },
        }),

        // Pending charges summary
        db.charge.findMany({
          where: {
            tenantId: ctx.tenantId,
            patientId: ctx.patientId,
            status: { in: ["PENDING", "OVERDUE"] },
          },
          select: {
            id: true,
            amountCents: true,
            discountCents: true,
            dueDate: true,
            status: true,
          },
          orderBy: { dueDate: "asc" },
          take: 5,
        }),

        // Recent journal entries (last 5)
        ctx.tenant.portalJournalEnabled
          ? dbAny.journalEntry.findMany({
              where: {
                tenantId: ctx.tenantId,
                patientId: ctx.patientId,
                deletedAt: null,
              },
              select: {
                id: true,
                entryType: true,
                moodScore: true,
                createdAt: true,
                visibility: true,
                noteText: true,
              },
              orderBy: { createdAt: "desc" as const },
              take: 5,
            })
          : [],

        // Unread notifications count
        dbAny.patientNotification.count({
          where: {
            tenantId: ctx.tenantId,
            patientId: ctx.patientId,
            readAt: null,
          },
        }),
      ]);

    // Redact videoLink if appointment is too far out
    let safeNextAppointment = nextAppointment;
    if (nextAppointment?.videoLink) {
      const minutesUntil =
        (new Date(nextAppointment.startsAt).getTime() - Date.now()) / 60_000;
      if (minutesUntil > ctx.tenant.portalVideoLinkAdvanceMin) {
        safeNextAppointment = { ...nextAppointment, videoLink: null };
      }
    }

    // Truncate journal noteText for dashboard preview
    const safeJournalEntries = (recentJournalEntries ?? []).map(
      (e: Record<string, unknown>) => ({
        ...e,
        noteText: e.noteText
          ? (e.noteText as string).substring(0, 100) +
            ((e.noteText as string).length > 100 ? "..." : "")
          : null,
      }),
    );

    const pendingTotal = pendingCharges.reduce(
      (sum: number, c: { amountCents: number; discountCents: number }) =>
        sum + c.amountCents - c.discountCents,
      0,
    );

    return ok({
      nextAppointment: safeNextAppointment
        ? {
            ...safeNextAppointment,
            // Never expose adminNotes
          }
        : null,
      payments: {
        pendingCount: pendingCharges.length,
        pendingTotalCents: pendingTotal,
        nextDue: pendingCharges[0]?.dueDate ?? null,
      },
      journal: safeJournalEntries,
      unreadNotifications,
      portalFlags: {
        paymentsVisible: ctx.tenant.portalPaymentsVisible,
        journalEnabled: ctx.tenant.portalJournalEnabled,
        rescheduleEnabled: ctx.tenant.portalRescheduleEnabled,
        safetyText: ctx.tenant.portalSafetyText,
        crisisPhone: ctx.tenant.portalSafetyCrisisPhone,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
