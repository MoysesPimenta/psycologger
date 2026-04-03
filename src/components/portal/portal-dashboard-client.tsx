"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, CreditCard, PenLine, ChevronRight, Clock, MapPin, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardData {
  nextAppointment: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    location: string | null;
    videoLink: string | null;
    appointmentType: { name: string; sessionType: string; color: string };
    provider: { name: string | null };
  } | null;
  payments: {
    pendingCount: number;
    pendingTotalCents: number;
    nextDue: string | null;
  };
  journal: Array<{
    id: string;
    entryType: string;
    moodScore: number | null;
    createdAt: string;
    noteText: string | null;
  }>;
  unreadNotifications: number;
  portalFlags: {
    paymentsVisible: boolean;
    journalEnabled: boolean;
    rescheduleEnabled: boolean;
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const GREETING_MAP: Record<string, string> = {
  morning: "Bom dia",
  afternoon: "Boa tarde",
  evening: "Boa noite",
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return GREETING_MAP.morning;
  if (h < 18) return GREETING_MAP.afternoon;
  return GREETING_MAP.evening;
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  MOOD_CHECKIN: "Humor",
  REFLECTION: "Reflexão",
  SESSION_PREP: "Próxima sessão",
  QUESTION: "Pergunta",
  IMPORTANT_EVENT: "Evento",
  GRATITUDE: "Gratidão",
};

export function PortalDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/portal/dashboard", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setData(json.data); })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError("Erro ao carregar dados.");
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-32 bg-gray-200 rounded-xl" />
        <div className="h-24 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  if (!data) {
    return <p className="text-gray-500">Erro ao carregar dados.</p>;
  }

  const appt = data.nextAppointment;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">{getGreeting()}</h1>

      {/* Next session card */}
      {appt && (
        <Link
          href={`/portal/sessions/${appt.id}`}
          className="block bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow"
        >
          <p className="text-xs font-medium text-gray-400 uppercase mb-2">Próxima sessão</p>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-gray-900">
                {format(new Date(appt.startsAt), "EEE, dd MMM · HH:mm", { locale: ptBR })}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                {appt.provider.name ?? "Terapeuta"} · {appt.appointmentType.name}
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                {appt.appointmentType.sessionType === "ONLINE" ? (
                  <>
                    <Video className="h-3.5 w-3.5" />
                    <span>Online</span>
                  </>
                ) : (
                  <>
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{appt.location ?? "Presencial"}</span>
                  </>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-300 mt-1 flex-shrink-0" />
          </div>
          {appt.videoLink && appt.videoLink.startsWith("https://") && (
            <a
              href={appt.videoLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Video className="h-4 w-4" />
              Entrar na sala
            </a>
          )}
        </Link>
      )}
      {!appt && (
        <div className="bg-white rounded-xl border p-4 text-center text-sm text-gray-400">
          <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          Nenhuma sessão agendada
        </div>
      )}

      {/* Quick mood check-in */}
      {data.portalFlags.journalEnabled && (
        <Link
          href="/portal/journal/new"
          className="block bg-gradient-to-r from-brand-50 to-blue-50 rounded-xl border border-brand-100 p-4 hover:shadow-sm transition-shadow"
        >
          <p className="text-xs font-medium text-brand-600 uppercase mb-2">Como você está?</p>
          <div className="flex justify-between items-center">
            <div className="flex gap-3 text-2xl">
              {["😔", "😐", "🙂", "😊", "😄"].map((emoji) => (
                <span key={emoji} className="hover:scale-110 transition-transform cursor-pointer">
                  {emoji}
                </span>
              ))}
            </div>
            <PenLine className="h-5 w-5 text-brand-400" />
          </div>
        </Link>
      )}

      {/* Payments summary */}
      {data.portalFlags.paymentsVisible && data.payments.pendingCount > 0 && (
        <Link
          href="/portal/payments"
          className="block bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {data.payments.pendingCount} pendente{data.payments.pendingCount > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-gray-500">
                  {formatCurrency(data.payments.pendingTotalCents)}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-300" />
          </div>
        </Link>
      )}

      {/* Recent journal */}
      {data.portalFlags.journalEnabled && data.journal.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-400 uppercase">Últimas anotações</p>
            <Link href="/portal/journal" className="text-xs text-brand-600 hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="space-y-2">
            {data.journal.slice(0, 3).map((entry) => (
              <Link
                key={entry.id}
                href={`/portal/journal/${entry.id}`}
                className="block bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                    </span>
                    {entry.moodScore && (
                      <span className="text-xs text-gray-400">· {entry.moodScore}/10</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-300">
                    {format(new Date(entry.createdAt), "dd/MM", { locale: ptBR })}
                  </span>
                </div>
                {entry.noteText && (
                  <p className="text-sm text-gray-500 mt-1 truncate">{entry.noteText}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
