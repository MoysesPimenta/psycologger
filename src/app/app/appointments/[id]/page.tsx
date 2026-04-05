import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getAuthContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { AppointmentDetailClient } from "@/components/appointments/appointment-detail-client";

export const metadata = { title: "Consulta" };

interface Props {
  params: { id: string };
}

export default async function AppointmentDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const appointment = await db.appointment.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    include: {
      patient: {
        select: {
          id: true, fullName: true, preferredName: true, email: true, phone: true,
          defaultFeeOverrideCents: true,
          defaultAppointmentType: { select: { id: true, name: true, defaultPriceCents: true } },
        },
      },
      provider: { select: { id: true, name: true, email: true } },
      appointmentType: true,
      recurrence: { select: { id: true, rrule: true, occurrences: true, startsAt: true } },
      clinicalSession: { select: { id: true } },
      charges: {
        select: {
          id: true, status: true, amountCents: true, discountCents: true, dueDate: true,
          description: true,
          payments: { select: { id: true, amountCents: true, method: true, paidAt: true } },
        },
      },
    },
  });

  if (!appointment) notFound();

  // Count sibling appointments in the recurrence series
  let recurrenceTotal = 0;
  let recurrenceFutureCount = 0;
  if (appointment.recurrenceId) {
    [recurrenceTotal, recurrenceFutureCount] = await Promise.all([
      db.appointment.count({
        where: { recurrenceId: appointment.recurrenceId, status: { notIn: ["CANCELED"] } },
      }),
      db.appointment.count({
        where: {
          recurrenceId: appointment.recurrenceId,
          startsAt: { gt: appointment.startsAt },
          status: { notIn: ["CANCELED"] },
        },
      }),
    ]);
  }

  return (
    <AppointmentDetailClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appointment={appointment as any}
      role={ctx.role}
      canViewSessions={can(ctx, "sessions:view")}
      recurrenceTotal={recurrenceTotal}
      recurrenceFutureCount={recurrenceFutureCount}
    />
  );
}
