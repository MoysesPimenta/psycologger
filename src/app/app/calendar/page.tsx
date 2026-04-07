import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { CalendarClient } from "@/components/appointments/calendar-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("pageTitle");
  return { title: t("calendar") };
}

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const t = await getTranslations("pageTitle");
  const tCalendar = await getTranslations("calendar");

  const [appointmentTypes, providers] = await Promise.all([
    db.appointmentType.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true, defaultDurationMin: true, defaultPriceCents: true, color: true },
    }),
    ctx.role === "PSYCHOLOGIST"
      ? Promise.resolve([])
      : db.membership.findMany({
          where: { tenantId: ctx.tenantId, role: { in: ["PSYCHOLOGIST", "TENANT_ADMIN"] }, status: "ACTIVE" },
          include: { user: { select: { id: true, name: true } } },
        }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("calendar")}</h1>
        <p className="text-sm text-gray-500 mt-1">{tCalendar("headerSubtitle")}</p>
      </div>
      <CalendarClient
        appointmentTypes={appointmentTypes}
        providers={providers.map((m: any) => ({ id: m.userId, name: m.user.name }))}
        userId={ctx.userId}
        role={ctx.role}
      />
    </div>
  );
}
