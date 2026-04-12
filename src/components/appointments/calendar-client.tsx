"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR, enUS, es, he, it, fr, de } from "date-fns/locale";
import { useTranslations, useLocale } from "next-intl";
import type { Locale as DateFnsLocale } from "date-fns";

const dateFnsLocaleMap: Record<string, DateFnsLocale> = {
  "pt-BR": ptBR, en: enUS, es, he, it, fr, de,
};
import { ChevronLeft, ChevronRight, Plus, Clock, User, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime, appointmentStatusLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
const statusColors: Record<string, BadgeVariant> = {
  SCHEDULED: "info",
  CONFIRMED: "success",
  COMPLETED: "success",
  CANCELED: "secondary",
  NO_SHOW: "warning",
};

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
  const dfLocale = dateFnsLocaleMap[locale] ?? ptBR;
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
    ? `${format(weekDays[0], "dd MMM", { locale: dfLocale })} – ${format(weekDays[6], "dd MMM yyyy", { locale: dfLocale })}`
    : format(currentDate, "MMMM yyyy", { locale: dfLocale });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card border border-border/50 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-foreground min-w-0 flex-1 sm:min-w-[200px] text-center capitalize text-sm sm:text-base truncate">{title}</span>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="hidden sm:inline-flex">
            {t("today")}
          </Button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="sm:hidden whitespace-nowrap">
            {t("today")}
          </Button>
          {/* 24h toggle — only relevant in week view */}
          {view === "week" && (
            <button
              onClick={() => setShow24h((v) => !v)}
              aria-label={show24h ? t("businessHours") : t("allDay")}
              title={show24h ? t("businessHours") : t("allDay")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap flex-shrink-0",
                show24h
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground border-border hover:bg-muted"
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              24h
            </button>
          )}
          <div className="flex border border-border rounded-lg overflow-hidden flex-shrink-0">
            {(["week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-current={view === v ? "true" : undefined}
                className={cn(
                  "px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {v === "week" ? t("week") : t("month")}
              </button>
            ))}
          </div>
          <Button size="sm" asChild className="hidden sm:inline-flex whitespace-nowrap flex-shrink-0">
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
          <div className="hidden md:block bg-card border border-border/50 rounded-xl overflow-hidden">
            {/* Day headers */}
            <div className="overflow-y-scroll [scrollbar-gutter:stable]" style={{ maxHeight: "unset" }}>
              <div className="grid grid-cols-8 border-b border-border/50">
                <div className="p-3 text-xs text-muted-foreground border-r border-border/50" />
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "p-3 text-center border-r border-border/50 last:border-r-0",
                      isSameDay(day, new Date()) && "bg-primary/5"
                    )}
                  >
                    <p className="text-xs text-muted-foreground uppercase">{format(day, "EEE", { locale: dfLocale })}</p>
                    <p className={cn(
                      "text-lg font-bold mt-0.5",
                      isSameDay(day, new Date()) ? "text-primary" : "text-foreground"
                    )}>
                      {format(day, "d")}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Time slots */}
            <div className="overflow-y-auto max-h-[calc(100dvh-280px)] scrollbar-thin [scrollbar-gutter:stable]">
              {hours.map((hour) => (
                <div key={hour} id={`calendar-hour-${hour}`} className="grid grid-cols-8 border-b border-border/50 min-h-[60px]">
                  <div className="p-2 text-xs text-muted-foreground border-r border-border/50 text-right pr-3 pt-2">
                    {format(new Date().setHours(hour, 0, 0), "HH:mm")}
                  </div>
                  {weekDays.map((day) => {
                    const dayAppts = appointments.filter((a) => {
                      const start = new Date(a.startsAt);
                      return isSameDay(start, day) && start.getHours() === hour;
                    });
                    return (
                      <div key={day.toISOString()} className={cn(
                        "border-r border-border/50 last:border-r-0 p-1 relative min-h-[60px]",
                        isSameDay(day, new Date()) && "bg-primary/5"
                      )}>
                        {dayAppts.map((appt) => (
                          <Link
                            key={appt.id}
                            href={`/app/appointments/${appt.id}`}
                            className="block rounded-md p-1.5 mb-1 text-xs text-white truncate hover:opacity-90 transition-opacity"
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
                <div key={day.toISOString()} className="bg-card border border-border/50 rounded-xl overflow-hidden">
                  {/* Day header */}
                  <h3 className={cn(
                    "text-sm font-semibold px-4 py-3 border-b border-border/50 capitalize",
                    isSameDay(day, new Date()) ? "bg-primary/10 text-primary" : "bg-muted/50 text-foreground"
                  )}>
                    {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(day)}
                  </h3>
                  {dayAppts.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-4 py-5 text-center">{t("noAppointments")}</p>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {dayAppts.map((appt) => (
                        <Link
                          key={appt.id}
                          href={`/app/appointments/${appt.id}`}
                          className="flex items-center p-3.5 hover:bg-muted/50 active:bg-muted transition-colors min-h-[56px]"
                        >
                          <div
                            className="w-1 h-10 rounded-full flex-shrink-0 me-3"
                            style={{ backgroundColor: appt.appointmentType.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {appt.patient.preferredName ?? appt.patient.fullName}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                              {formatTime(appt.startsAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ms-3 flex-shrink-0">
                            <Badge variant={statusColors[appt.status] ?? "secondary"} className="text-[10px]">
                              {appointmentStatusLabel(appt.status)}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Floating action button on mobile — positioned above the bottom nav */}
            <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] end-4 md:hidden z-30">
              <Button asChild size="lg" className="rounded-full shadow-lg h-14 w-14">
                <Link href="/app/appointments/new">
                  <Plus className="h-6 w-6" />
                </Link>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Month view */}
      {view === "month" && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border/50">
            {eachDayOfInterval({
              start: startOfWeek(new Date(), { weekStartsOn: 1 }),
              end: endOfWeek(new Date(), { weekStartsOn: 1 }),
            }).map((d) => (
              <div key={d.toISOString()} className="p-2 sm:p-3 text-[10px] sm:text-xs font-medium text-muted-foreground text-center border-r border-border/50 last:border-r-0">
                <span className="hidden sm:inline">{format(d, "EEE", { locale: dfLocale })}</span>
                <span className="sm:hidden">{format(d, "EEEEE", { locale: dfLocale })}</span>
              </div>
            ))}
          </div>

          {/* Days grid */}
          {Array.from({ length: 6 }).map((_, weekIdx) => {
            const weekStart = addWeeks(startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }), weekIdx);
            const fullWeek = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) });
            return (
              <div key={weekIdx} className="grid grid-cols-7 border-b border-border/50 last:border-b-0">
                {fullWeek.map((day) => {
                  const dayAppts = appointments.filter((a) => isSameDay(new Date(a.startsAt), day));
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "border-r border-border/50 last:border-r-0 p-1 sm:p-2 min-h-[48px] sm:min-h-[80px]",
                        !isCurrentMonth && "bg-muted/30",
                        isSameDay(day, new Date()) && "bg-primary/5"
                      )}
                    >
                      <p className={cn(
                        "text-xs sm:text-sm font-medium mb-0.5 sm:mb-1",
                        !isCurrentMonth ? "text-muted-foreground/40" : isSameDay(day, new Date()) ? "text-primary" : "text-foreground"
                      )}>
                        {format(day, "d")}
                      </p>
                      {/* On mobile: show dots only. On desktop: show labels */}
                      <div className="hidden sm:block">
                        {dayAppts.slice(0, 2).map((appt) => (
                          <Link
                            key={appt.id}
                            href={`/app/appointments/${appt.id}`}
                            className="block text-xs text-white rounded-md px-1.5 py-0.5 mb-0.5 truncate hover:opacity-90 transition-opacity"
                            style={{ backgroundColor: appt.appointmentType.color }}
                          >
                            {formatTime(appt.startsAt)} {appt.patient.preferredName ?? appt.patient.fullName}
                          </Link>
                        ))}
                        {dayAppts.length > 2 && (
                          <p className="text-xs text-muted-foreground">+{dayAppts.length - 2}</p>
                        )}
                      </div>
                      {/* Mobile dots */}
                      {dayAppts.length > 0 && (
                        <div className="sm:hidden flex gap-0.5 justify-center mt-1">
                          {dayAppts.slice(0, 3).map((appt) => (
                            <div
                              key={appt.id}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: appt.appointmentType.color }}
                            />
                          ))}
                          {dayAppts.length > 3 && (
                            <span className="text-[8px] text-muted-foreground leading-none">+</span>
                          )}
                        </div>
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
