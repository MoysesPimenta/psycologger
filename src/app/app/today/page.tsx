import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { TodayClient } from "@/components/appointments/today-client";
import { startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("pageTitle");
  return { title: t("today") };
}

export default async function TodayPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext().catch(() => null);

  // User is logged in but has no active membership (e.g. new signup)
  if (!ctx) redirect("/onboarding");

  const t = await getTranslations("pageTitle");

  // Get tenant timezone
  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { timezone: true, name: true },
  });
  const tz = tenant?.timezone ?? "America/Sao_Paulo";

  // Compute today's bounds in the tenant timezone and convert to UTC for the DB query.
  // Using fromZonedTime is critical — without it, startOfDay/endOfDay operate in the
  // server's local timezone (UTC) instead of the tenant's timezone, causing evening
  // appointments (e.g. 21:00 BRT = 00:01 UTC next day) to be missed.
  const nowInTz = toZonedTime(new Date(), tz);
  const from = fromZonedTime(startOfDay(nowInTz), tz);
  const to = fromZonedTime(endOfDay(nowInTz), tz);

  const appointments = await db.appointment.findMany({
    where: {
      tenantId: ctx.tenantId,
      // Filter on startsAt only — using endsAt as upper bound excludes appointments
      // that start today but end past midnight UTC.
      startsAt: { gte: from, lte: to },
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
            {t("today")} — {formatDate(from, "EEEE, dd 'de' MMMM")}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{tenant?.name}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/app/appointments/new">
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
        appointments={appointments as any}
        userId={ctx.userId}
        role={ctx.role}
      />
    </div>
  );
}
