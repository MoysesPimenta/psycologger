"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslations, useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, Plus, Clock, User, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime, appointmentStatusLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface AppointmentType {
  id: string;
  name: string;
  defaultDurationMin: number;
  defaultPriceCents: number;
  color: string;
}

interface Provider {
  id: string;
  name: string | null;
}

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { id: string; fullName: string; preferredName: string | null };
  appointmentType: { id: string; name: string; color: string };
}

type ViewMode = "week" | "month";

export function CalendarClient({
  appointmentTypes,
  providers,
  userId,
  role,
}: {
  appointmentTypes: AppointmentType[];
  providers: Provider[];
  userId: string;
  role: string;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [show24h, setShow24h] = useState(false);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    const from = view === "week" ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfMonth(currentDate);
    const to = view === "week" ? endOfWeek(currentDate, { weekStartsOn: 1 }) : endOfMonth(currentDate);

    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      pageSize: "200",
    });
    const res = await fetch(`/api/v1/appointments?${params}`);
    if (res.ok) {
      const json = await res.json();
      // Never show cancelled appointments on the calendar — they are not real slots
      setAppointments((json.data as Appointment[]).filter((a: Appointment) => a.status !== "CANCELED"));
    }
    setLoading(false);
  }, [currentDate, view]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // When switching to 24h mode, scroll to 7h so working hours are still centred
  useEffect(() => {
    if (!show24h) return;
    const el = document.getElementById("calendar-hour-7");
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [show24h]);

  function navigate(dir: 1 | -1) {
    if (view === "week") {
      setCurrentDate((d) => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
    } else {
      setCurrentDate((d) => dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
    }
  }

  const weekDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
    end: endOfWeek(currentDate, { weekStartsOn: 1 }),
  }), [currentDate]);

  // Default: 7h–19h (13 slots). Toggle: 0h–23h (24 slots).
  const hours = useMemo(() => show24h
    ? Array.from({ length: 24 }, (_, i) => i)
    : Array.from({ length: 13 }, (_, i) => i + 7), [show24h]);

  const title = view === "week"
    ? `${format(weekDays[0], "dd MMM", { locale: ptBR })} – ${format(weekDays[6], "dd MMM yyyy", { locale: ptBR })}`
    : format(currentDate, "MMMM yyyy", { locale: ptBR });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between bg-white border rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-gray-900 min-w-[200px] text-center capitalize">{title}</span>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            {t("today")}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {/* 24h toggle — only relevant in week view */}
          {view === "week" && (
            <button
              onClick={() => setShow24h((v) => !v)}
              aria-label={show24h ? t("businessHours") : t("allDay")}
              title={show24h ? t("businessHours") : t("allDay")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                show24h
                  ? "bg-brand-600 text-white border-brand-600"
                  : "text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              24h
            </button>
          )}
          <div className="flex border rounded-lg overflow-hidden">
            {(["week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-current={view === v ? "true" : undefined}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  view === v ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {v === "week" ? t("week") : t("month")}
              </button>
            ))}
          </div>
          <Button size="sm" asChild className="w-full sm:w-auto">
            <Link href="/app/appointments/new">
              <Plus className="h-4 w-4" /> {t("newAppointment")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Week view */}
      {view === "week" && (
        <>
          {/* Desktop grid view — hidden on phones */}
          <div className="hidden md:block bg-white border rounded-xl overflow-hidden">
            {/* Day headers — overflow-y-scroll keeps the same scrollbar gutter as the body */}
            <div className="overflow-y-scroll [scrollbar-gutter:stable]" style={{ maxHeight: "unset" }}>
              <div className="grid grid-cols-8 border-b">
                <div className="p-3 text-xs text-gray-400 border-r" />
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "p-3 text-center border-r last:border-r-0",
                      isSameDay(day, new Date()) && "bg-brand-50"
                    )}
                  >
                    <p className="text-xs text-gray-500 uppercase">{format(day, "EEE", { locale: ptBR })}</p>
                    <p className={cn(
                      "text-lg font-bold mt-0.5",
                      isSameDay(day, new Date()) ? "text-brand-600" : "text-gray-900"
                    )}>
                      {format(day, "d")}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Time slots */}
            <div className="overflow-y-auto max-h-[600px] scrollbar-thin [scrollbar-gutter:stable]">
              {hours.map((hour) => (
                <div key={hour} id={`calendar-hour-${hour}`} className="grid grid-cols-8 border-b min-h-[60px]">
                  <div className="p-2 text-xs text-gray-400 border-r text-right pr-3 pt-2">
                    {format(new Date().setHours(hour, 0, 0), "HH:mm")}
                  </div>
                  {weekDays.map((day) => {
                    const dayAppts = appointments.filter((a) => {
                      const start = new Date(a.startsAt);
                      return isSameDay(start, day) && start.getHours() === hour;
                    });
                    return (
                      <div key={day.toISOString()} className={cn(
                        "border-r last:border-r-0 p-1 relative min-h-[60px]",
                        isSameDay(day, new Date()) && "bg-brand-50/30"
                      )}>
                        {dayAppts.map((appt) => (
                          <Link
                            key={appt.id}
                            href={`/app/appointments/${appt.id}`}
                            className="block rounded p-1 mb-1 text-xs text-white truncate hover:opacity-90"
                            style={{ backgroundColor: appt.appointmentType.color }}
                          >
                            <p className="font-medium truncate">
                              {appt.patient.preferredName ?? appt.patient.fullName}
                            </p>
                            <p className="opacity-80">
                              {formatTime(appt.startsAt)}
                            </p>
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Mobile stacked list view — shown only on phones */}
          <div className="md:hidden space-y-3 pb-4">
            {weekDays.map((day) => {
              const dayAppts = appointments.filter((a) => isSameDay(new Date(a.startsAt), day));
              return (
                <div key={day.toISOString()} className="bg-white border rounded-lg overflow-hidden">
                  {/* Sticky day header */}
                  <h3 className={cn(
                    "text-sm font-semibold px-4 py-3 border-b",
                    isSameDay(day, new Date()) ? "bg-brand-50 text-brand-700" : "bg-gray-50 text-gray-900"
                  )}>
                    {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </h3>
                  {dayAppts.length === 0 ? (
                    <p className="text-xs text-gray-400 px-4 py-6 text-center">Sem compromissos</p>
                  ) : (
                    <div className="divide-y">
                      {dayAppts.map((appt) => (
                        <Link
                          key={appt.id}
                          href={`/app/appointments/${appt.id}`}
                          className="block p-4 hover:bg-gray-50 active:bg-gray-100 transition min-h-[60px] flex items-center"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {appt.patient.preferredName ?? appt.patient.fullName}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                              {formatTime(appt.startsAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                            <Badge className="text-xs whitespace-nowrap" style={{ backgroundColor: appt.appointmentType.color }}>
                              {appointmentStatusLabel(appt.status)}
                            </Badge>
                            <ChevronRight className="h-5 w-5 text-gray-300" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Floating action button on mobile */}
            <div className="fixed bottom-20 right-4 md:hidden">
              <Button asChild size="lg" className="rounded-full shadow-lg">
                <Link href="/app/appointments/new">
                  <Plus className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Month view */}
      {view === "month" && (
        <div className="bg-white border rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d} className="p-3 text-xs font-medium text-gray-500 text-center border-r last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          {Array.from({ length: 6 }).map((_, weekIdx) => {
            const weekStart = addWeeks(startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }), weekIdx);
            const days = eachDayOfInterval({ start: weekStart, end: addWeeks(weekStart, 0) });
            const fullWeek = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) });
            return (
              <div key={weekIdx} className="grid grid-cols-7 border-b last:border-b-0">
                {fullWeek.map((day) => {
                  const dayAppts = appointments.filter((a) => isSameDay(new Date(a.startsAt), day));
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "border-r last:border-r-0 p-2 min-h-[80px]",
                        !isCurrentMonth && "bg-gray-50",
                        isSameDay(day, new Date()) && "bg-brand-50/50"
                      )}
                    >
                      <p className={cn(
                        "text-sm font-medium mb-1",
                        !isCurrentMonth ? "text-gray-300" : isSameDay(day, new Date()) ? "text-brand-600" : "text-gray-700"
                      )}>
                        {format(day, "d")}
                      </p>
                      {dayAppts.slice(0, 2).map((appt) => (
                        <Link
                          key={appt.id}
                          href={`/app/appointments/${appt.id}`}
                          className="block text-xs text-white rounded px-1 py-0.5 mb-0.5 truncate hover:opacity-90"
                          style={{ backgroundColor: appt.appointmentType.color }}
                        >
                          {formatTime(appt.startsAt)} {appt.patient.preferredName ?? appt.patient.fullName}
                        </Link>
                      ))}
                      {dayAppts.length > 2 && (
                        <p className="text-xs text-gray-400">+{dayAppts.length - 2} mais</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
