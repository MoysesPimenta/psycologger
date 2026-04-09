"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { Calendar, Clock, MapPin, Video, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  location: string | null;
  videoLink: string | null;
  appointmentType: { name: string; sessionType: string; color: string };
  provider: { name: string | null };
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELED: "bg-red-100 text-red-600",
  NO_SHOW: "bg-amber-100 text-amber-700",
};

export function PortalSessionsClient() {
  const t = useTranslations();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/portal/appointments?tab=${tab}&pageSize=50`, { signal });
      if (res.ok) {
        const json = await res.json();
        setAppointments(json.data);
      } else {
        setError(t("errors.loadFailed"));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(t("errors.loadFailed"));
      }
    }
    setLoading(false);
  }, [tab, t]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      {/* TODO(i18n): Extract "Sessions" page title */}
      <h1 className="text-2xl font-bold text-gray-900">Sessões</h1>

      <div className="flex gap-2 bg-gray-100/50 rounded-xl p-1">
        {(["upcoming", "past"] as const).map((tabType) => (
          <button
            key={tabType}
            onClick={() => setTab(tabType)}
            className={cn(
              "flex-1 px-4 py-2 text-xs font-semibold rounded-lg transition-all active:scale-95",
              tab === tabType
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900",
            )}
          >
            {/* TODO(i18n): Extract tab labels "Upcoming" / "Past" */}
            {tabType === "upcoming" ? "Próximas" : "Anteriores"}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-4 rounded-xl border border-red-200" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/50 p-8 text-center">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">
            {/* TODO(i18n): Extract empty state messages for upcoming and past sessions */}
            {tab === "upcoming" ? "Nenhuma sessão agendada" : "Nenhuma sessão anterior"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map((appt) => (
            <Link
              key={appt.id}
              href={`/portal/sessions/${appt.id}`}
              className="block bg-white rounded-2xl border border-gray-200/50 p-4 hover:shadow-md active:bg-gray-50 transition-all min-h-20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">
                    {format(new Date(appt.startsAt), "EEE, dd MMM", { locale: ptBR })}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {format(new Date(appt.startsAt), "HH:mm")} – {format(new Date(appt.endsAt), "HH:mm")}
                  </p>
                  <p className="text-xs text-gray-600 mt-1.5 font-medium">
                    {appt.provider.name ?? t("portal.dashboard.therapist")}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold", STATUS_COLORS[appt.status] ?? "bg-gray-100 text-gray-600")}>
                      {/* TODO(i18n): Extract appointment status labels from enums.appointmentStatus */}
                      {appt.status === "SCHEDULED" && t("enums.appointmentStatus.SCHEDULED")}
                      {appt.status === "CONFIRMED" && t("enums.appointmentStatus.CONFIRMED")}
                      {appt.status === "COMPLETED" && t("enums.appointmentStatus.COMPLETED")}
                      {appt.status === "CANCELED" && t("enums.appointmentStatus.CANCELED")}
                      {appt.status === "NO_SHOW" && t("enums.appointmentStatus.NO_SHOW")}
                      {!["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"].includes(appt.status) && appt.status}
                    </span>
                    {appt.appointmentType.sessionType === "ONLINE" ? (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Video className="h-3 w-3" /> {t("enums.sessionType.ONLINE")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="h-3 w-3" /> {t("enums.sessionType.IN_PERSON")}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 mt-0.5 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
