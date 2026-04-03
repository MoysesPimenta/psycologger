"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  COMPLETED: "Realizada",
  CANCELED: "Cancelada",
  NO_SHOW: "Não compareceu",
};

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELED: "bg-red-100 text-red-600",
  NO_SHOW: "bg-amber-100 text-amber-700",
};

export function PortalSessionsClient() {
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
        setError("Erro ao carregar sessões.");
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError("Erro ao carregar sessões.");
      }
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Sessões</h1>

      <div className="flex gap-2">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === t ? "bg-brand-600 text-white" : "bg-white text-gray-600 border hover:bg-gray-50",
            )}
          >
            {t === "upcoming" ? "Próximas" : "Anteriores"}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          {tab === "upcoming" ? "Nenhuma sessão agendada" : "Nenhuma sessão anterior"}
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map((appt) => (
            <Link
              key={appt.id}
              href={`/portal/sessions/${appt.id}`}
              className="block bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {format(new Date(appt.startsAt), "EEE, dd MMM · HH:mm", { locale: ptBR })}
                    <span className="text-gray-400"> – </span>
                    {format(new Date(appt.endsAt), "HH:mm")}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {appt.provider.name ?? "Terapeuta"} · {appt.appointmentType.name}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[appt.status] ?? "bg-gray-100 text-gray-600")}>
                      {STATUS_LABELS[appt.status] ?? appt.status}
                    </span>
                    {appt.appointmentType.sessionType === "ONLINE" ? (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Video className="h-3 w-3" /> Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="h-3 w-3" /> Presencial
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 mt-1 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
