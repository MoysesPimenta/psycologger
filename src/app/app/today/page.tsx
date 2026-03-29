import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { TodayClient } from "@/components/appointments/today-client";
import { startOfDay, endOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Hoje" };

export default async function TodayPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext().catch(() => null);

  // User is logged in but has no active membership (e.g. new signup)
  if (!ctx) redirect("/onboarding");

  // Get tenant timezone
  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { timezone: true, name: true },
  });
  const tz = tenant?.timezone ?? "America/Sao_Paulo";

  const nowInTz = toZonedTime(new Date(), tz);
  const from = startOfDay(nowInTz);
  const to = endOfDay(nowInTz);

  const appointments = await db.appointment.findMany({
    where: {
      tenantId: ctx.tenantId,
      startsAt: { gte: from },
      endsAt: { lte: to },
      ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
    },
    include: {
      patient: {
        select: {
          id: true, fullName: true, preferredName: true, phone: true,
          defaultFeeOverrideCents: true,
          defaultAppointmentType: { select: { defaultPriceCents: true } },
        },
      },
      provider: { select: { id: true, name: true } },
      appointmentType: { select: { id: true, name: true, color: true, defaultPriceCents: true } },
      clinicalSession: { select: { id: true } },
      charges: { select: { id: true, status: true, amountCents: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Quick stats
  const stats = {
    total: appointments.length,
    completed: appointments.filter((a) => a.status === "COMPLETED").length,
    scheduled: appointments.filter((a) => ["SCHEDULED", "CONFIRMED"].includes(a.status)).length,
    noShow: appointments.filter((a) => a.status === "NO_SHOW").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Hoje — {formatDate(from, "EEEE, dd 'de' MMMM")}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{tenant?.name}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/app/calendar?new=1">
            <Plus className="h-4 w-4" />
            Nova consulta
          </Link>
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, color: "text-gray-900" },
          { label: "Realizadas", value: stats.completed, color: "text-green-600" },
          { label: "Aguardando", value: stats.scheduled, color: "text-blue-600" },
          { label: "Faltas", value: stats.noShow, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Appointments list (interactive) */}
      <TodayClient
        appointments={appointments as never}
        userId={ctx.userId}
        role={ctx.role}
      />
    </div>
  );
}
