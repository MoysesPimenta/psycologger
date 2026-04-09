"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { ChevronLeft, Calendar, Clock, MapPin, Video, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/csrf-client";

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

export function PortalSessionDetailClient({ id }: { id: string }) {
  const t = useTranslations();
  const [appt, setAppt] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/portal/appointments?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setAppt(json.data);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  function getStatusLabel(status: string): string {
    const key = `enums.appointmentStatus.${status}` as const;
    return t(key);
  }

  async function handleCancel() {
    if (!confirm(t("portal.sessions.cancelConfirm"))) return;
    setCanceling(true);
    try {
      const res = await fetchWithCsrf("/api/v1/portal/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: id, action: "cancel" }),
      });
      if (res.ok) {
        setCanceled(true);
        setAppt((prev) => prev ? { ...prev, status: "CANCELED" } : null);
      } else {
        const data = await res.json().catch(() => null);
        alert(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? t("portal.sessions.errorCanceling"));
      }
    } catch {
      alert(t("portal.sessions.connectionError"));
    } finally {
      setCanceling(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-6 w-32 bg-gray-200 rounded" />
      <div className="h-40 bg-gray-200 rounded-xl" />
    </div>;
  }

  if (!appt) {
    return <p className="text-gray-500">{t("portal.sessions.notFound")}</p>;
  }

  const isOnline = appt.appointmentType.sessionType === "ONLINE";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <Link href="/portal/sessions" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" aria-label={t("portal.sessions.backToSessions")}>
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{t("portal.sessions.detailsTitle")}</h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/50 p-5 space-y-4">
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
          {appt.provider.name ?? t("portal.dashboard.therapist")}
        </div>

        {/* Location */}
        <div className="flex items-center gap-3 text-sm text-gray-600">
          {isOnline ? (
            <>
              <Video className="h-4 w-4 text-gray-400" />
              <span>{t("portal.dashboard.onlineSession")}</span>
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4 text-gray-400" />
              <span>{appt.location ?? t("portal.dashboard.inPersonSession")}</span>
            </>
          )}
        </div>

        {/* Status */}
        <div className="pt-3 border-t">
          <p className="text-sm text-gray-500">
            Status: <span className="font-medium text-gray-700">{getStatusLabel(appt.status)}</span>
          </p>
        </div>

        {/* Video link */}
        {appt.videoLink && (
          <a
            href={appt.videoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all"
          >
            <Video className="h-4 w-4" />
            {t("portal.sessions.joinRoom")}
          </a>
        )}

        {/* Cancel button */}
        {(appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && !canceled && (
          (() => {
            const hoursUntil = (new Date(appt.startsAt).getTime() - Date.now()) / (60 * 60 * 1000);
            return hoursUntil >= 24 ? (
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="w-full mt-4 px-4 py-2.5 text-sm font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-50"
              >
                {canceling ? t("portal.sessions.cancelButtonCanceling") : t("portal.sessions.cancelButton")}
              </button>
            ) : null;
          })()
        )}
        {canceled && (
          <p className="text-sm text-red-500 mt-3 text-center">{t("portal.sessions.sessionCanceled")}</p>
        )}
      </div>

      {/* Prep CTA */}
      <Link
        href="/portal/journal/new"
        className="block bg-blue-50 border border-blue-200/50 rounded-2xl p-4 text-center hover:shadow-md active:bg-blue-100 transition-all"
      >
        <p className="text-sm font-semibold text-blue-700">
          {t("portal.sessions.prepNote")}
        </p>
      </Link>
    </div>
  );
}
