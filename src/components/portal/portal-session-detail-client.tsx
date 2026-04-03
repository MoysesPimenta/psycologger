"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, Calendar, Clock, MapPin, Video, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppointmentDetail {
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

export function PortalSessionDetailClient({ id }: { id: string }) {
  const [appt, setAppt] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/portal/appointments?pageSize=200`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          const found = json.data.find((a: AppointmentDetail) => a.id === id);
          setAppt(found ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-6 w-32 bg-gray-200 rounded" />
      <div className="h-40 bg-gray-200 rounded-xl" />
    </div>;
  }

  if (!appt) {
    return <p className="text-gray-500">Sessão não encontrada.</p>;
  }

  const isOnline = appt.appointmentType.sessionType === "ONLINE";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/portal/sessions" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Detalhes da Sessão</h1>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        {/* Date & time */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: appt.appointmentType.color + "20" }}>
            <Calendar className="h-6 w-6" style={{ color: appt.appointmentType.color }} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {format(new Date(appt.startsAt), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
            <p className="text-sm text-gray-500">
              {format(new Date(appt.startsAt), "HH:mm")} – {format(new Date(appt.endsAt), "HH:mm")}
            </p>
          </div>
        </div>

        {/* Type */}
        <div className="flex items-center gap-3 text-sm">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: appt.appointmentType.color }}
          />
          <span className="text-gray-700">{appt.appointmentType.name}</span>
        </div>

        {/* Provider */}
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <User className="h-4 w-4 text-gray-400" />
          {appt.provider.name ?? "Terapeuta"}
        </div>

        {/* Location */}
        <div className="flex items-center gap-3 text-sm text-gray-600">
          {isOnline ? (
            <>
              <Video className="h-4 w-4 text-gray-400" />
              <span>Online</span>
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4 text-gray-400" />
              <span>{appt.location ?? "Presencial"}</span>
            </>
          )}
        </div>

        {/* Status */}
        <div className="pt-3 border-t">
          <p className="text-sm text-gray-500">
            Status: <span className="font-medium text-gray-700">{STATUS_LABELS[appt.status] ?? appt.status}</span>
          </p>
        </div>

        {/* Video link */}
        {appt.videoLink && (
          <a
            href={appt.videoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Video className="h-4 w-4" />
            Entrar na sala
          </a>
        )}
      </div>

      {/* Prep CTA */}
      <Link
        href="/portal/journal/new"
        className="block bg-brand-50 border border-brand-100 rounded-xl p-4 text-center hover:bg-brand-100/50 transition-colors"
      >
        <p className="text-sm font-medium text-brand-700">
          Preparar uma nota para esta sessão?
        </p>
      </Link>
    </div>
  );
}
