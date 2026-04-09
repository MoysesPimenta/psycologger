"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslations } from "next-intl";
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
  lastLogin: {
    at: string | null;
    ip: string | null;
  };
  portalFlags: {
    paymentsVisible: boolean;
    journalEnabled: boolean;
    rescheduleEnabled: boolean;
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

// TODO(i18n): entry type labels moved to i18n: portal.journal.entryTypes.*
// Future extraction: move ENTRY_TYPE_LABELS to message JSON for full i18n support

export function PortalDashboardClient() {
  const t = useTranslations();
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
          setError(t("portal.dashboard.errorLoading"));
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [t]);

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
    return <p className="text-gray-500">{t("portal.dashboard.errorLoading")}</p>;
  }

  const appt = data.nextAppointment;

  function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return t("portal.dashboard.greeting.morning");
    if (h < 18) return t("portal.dashboard.greeting.afternoon");
    return t("portal.dashboard.greeting.evening");
  }

  // TODO(i18n): Extract remaining entry type labels
  const ENTRY_TYPE_LABELS: Record<string, string> = {
    MOOD_CHECKIN: "Humor",
    REFLECTION: "Reflexão",
    SESSION_PREP: "Próxima sessão",
    QUESTION: "Pergunta",
    IMPORTANT_EVENT: "Evento",
    GRATITUDE: "Gratidão",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 pt-2">{getGreeting()}</h1>

      {/* Next session card */}
      {appt && (
        <Link
          href={`/portal/sessions/${appt.id}`}
          className="block bg-white rounded-2xl border border-gray-200/50 p-5 hover:shadow-md active:bg-gray-50 transition-all"
        >
          <p className="text-xs font-semibold text-blue-600 uppercase mb-3 tracking-wide">{t("portal.dashboard.nextSession")}</p>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="font-semibold text-gray-900 leading-tight">
                {format(new Date(appt.startsAt), "EEE, dd MMM · HH:mm", { locale: ptBR })}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {appt.provider.name ?? t("portal.dashboard.therapist")}
              </p>
              <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                {appt.appointmentType.sessionType === "ONLINE" ? (
                  <>
                    <Video className="h-4 w-4 text-blue-500" />
                    <span>{t("portal.dashboard.onlineSession")}</span>
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 text-blue-500" />
                    <span>{appt.location ?? t("portal.dashboard.inPersonSession")}</span>
                  </>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-300 mt-0.5 flex-shrink-0" />
          </div>
          {appt.videoLink && appt.videoLink.startsWith("https://") && (
            <a
              href={appt.videoLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-4 inline-flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 active:scale-95 transition-all"
            >
              <Video className="h-4 w-4" />
              {t("common.open")}
            </a>
          )}
        </Link>
      )}
      {!appt && (
        <div className="bg-white rounded-2xl border border-gray-200/50 p-8 text-center">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">{t("portal.dashboard.noUpcomingSessions")}</p>
        </div>
      )}

      {/* Quick mood check-in */}
      {data.portalFlags.journalEnabled && (
        <Link
          href="/portal/journal/new"
          className="block bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl border border-blue-200/50 p-5 hover:shadow-md active:bg-blue-100 transition-all"
        >
          <p className="text-xs font-semibold text-blue-600 uppercase mb-3 tracking-wide">{t("portal.journal.newEntry")}</p>
          <div className="flex justify-between items-center">
            <div className="flex gap-2.5 text-2xl">
              {["😔", "😐", "🙂", "😊", "😄"].map((emoji) => (
                <span key={emoji} className="hover:scale-125 transition-transform cursor-pointer">
                  {emoji}
                </span>
              ))}
            </div>
            <PenLine className="h-5 w-5 text-blue-500" />
          </div>
        </Link>
      )}

      {/* Payments summary */}
      {data.portalFlags.paymentsVisible && data.payments.pendingCount > 0 && (
        <Link
          href="/portal/payments"
          className="block bg-white rounded-2xl border border-gray-200/50 p-5 hover:shadow-md active:bg-gray-50 transition-all"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-amber-100/50 rounded-xl flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {data.payments.pendingCount} pendente{data.payments.pendingCount > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatCurrency(data.payments.pendingTotalCents)}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
          </div>
        </Link>
      )}

      {/* Recent journal */}
      {data.portalFlags.journalEnabled && data.journal.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("journal.unread")}</p>
            <Link href="/portal/journal" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              {t("common.view")}
            </Link>
          </div>
          <div className="space-y-2">
            {data.journal.slice(0, 3).map((entry) => (
              <Link
                key={entry.id}
                href={`/portal/journal/${entry.id}`}
                className="block bg-white rounded-2xl border border-gray-200/50 p-4 hover:shadow-md active:bg-gray-50 transition-all min-h-14 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">
                      {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                    </span>
                    {entry.moodScore && (
                      <span className="text-xs text-gray-500">· {entry.moodScore}/10</span>
                    )}
                  </div>
                  {entry.noteText && (
                    <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{entry.noteText}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                  {format(new Date(entry.createdAt), "dd/MM", { locale: ptBR })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Last login info (subtle footer) */}
      {data.lastLogin.at && (
        <div className="border-t border-gray-200/50 pt-4 mt-6">
          <p className="text-xs text-gray-500 text-center">
            {/* TODO(i18n): Extract "Last login" label and IP address display */}
            Último acesso: {format(new Date(data.lastLogin.at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
            {data.lastLogin.ip && (
              <>
                {" "}de <span className="font-mono">{data.lastLogin.ip}</span></>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
