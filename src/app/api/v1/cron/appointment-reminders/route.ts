/**
 * POST /api/v1/cron/appointment-reminders
 *
 * Called daily (e.g. via Vercel Cron at 8 AM BRT) to send 24-hour
 * reminders for appointments scheduled tomorrow.
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendAppointmentReminder } from "@/lib/email";
import { formatDatePlain } from "@/lib/utils";
import { requireCronAuth } from "@/lib/cron-auth";

interface AppointmentWithRelations {
  id: string;
  tenantId: string;
  startsAt: Date;
  status: string;
  patient: { id: string; fullName: string; email: string | null };
  provider: { id: string; name: string | null };
  tenant: { id: string; name: string };
}

async function hasReminderBeenSent(
  appointmentId: string,
  type: "CONFIRMATION" | "REMINDER_24H" | "REMINDER_1H",
  tenantId: string,
): Promise<boolean> {
  const count = await db.reminderLog.count({
    where: { appointmentId, type, tenantId },
  });
  return count > 0;
}

async function logReminder(data: {
  tenantId: string;
  appointmentId: string;
  type: "CONFIRMATION" | "REMINDER_24H" | "REMINDER_1H";
  recipient: string;
  status: "SENT" | "FAILED" | "BOUNCED";
  errorMsg?: string;
}) {
  await db.reminderLog.create({
    data: {
      tenantId: data.tenantId,
      appointmentId: data.appointmentId,
      type: data.type,
      channel: "EMAIL",
      recipient: data.recipient,
      status: data.status,
      errorMsg: data.errorMsg ?? null,
    },
  });
}

/** Format time as HH:mm for Brazilian locale. */
function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export async function POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const now = new Date();
  // UTC boundaries for "tomorrow"
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);

  let sentCount = 0;
  let errorCount = 0;

  // Find appointments scheduled for tomorrow that are SCHEDULED or CONFIRMED
  const appointments = (await db.appointment.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] as const },
      startsAt: { gte: tomorrow, lt: dayAfterTomorrow },
    },
    include: {
      patient: { select: { id: true, fullName: true, email: true } },
      provider: { select: { id: true, name: true } },
      tenant: { select: { id: true, name: true } },
    },
  })) as unknown as AppointmentWithRelations[];

  for (const appt of appointments) {
    if (!appt.patient.email) continue;
    if (await hasReminderBeenSent(appt.id, "REMINDER_24H", appt.tenantId))
      continue;

    // Check if tenant has this template active (skip only if template exists AND is inactive)
    const template = await db.reminderTemplate.findFirst({
      where: { tenantId: appt.tenantId, type: "REMINDER_24H" },
    });
    if (template && !template.isActive) continue;

    try {
      await sendAppointmentReminder({
        to: appt.patient.email,
        patientName: appt.patient.fullName,
        appointmentDate: formatDatePlain(appt.startsAt),
        appointmentTime: formatTime(appt.startsAt),
        clinicName: appt.tenant.name,
      });

      await logReminder({
        tenantId: appt.tenantId,
        appointmentId: appt.id,
        type: "REMINDER_24H",
        recipient: appt.patient.email,
        status: "SENT",
      });
      sentCount++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await logReminder({
        tenantId: appt.tenantId,
        appointmentId: appt.id,
        type: "REMINDER_24H",
        recipient: appt.patient.email,
        status: "FAILED",
        errorMsg,
      });
      errorCount++;
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sentCount,
    errors: errorCount,
    timestamp: now.toISOString(),
  });
}
