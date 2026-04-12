"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { format, addMinutes, addWeeks, addMonths, nextDay, getDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslations } from "next-intl";
import {
  Video, RefreshCw, Repeat, Bell, ChevronDown, ChevronUp,
  UserPlus, X, Check, Infinity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patient { id: string; fullName: string; preferredName: string | null; email: string | null }
interface AppointmentType { id: string; name: string; defaultDurationMin: number; color: string; sessionType: string }
interface Provider { id: string; name: string }

interface Props { userId: string; role: string }

// ─── Constants ────────────────────────────────────────────────────────────────

// JS day index (0=Sun) → RRULE token
const RRULE_DAY = ["SU","MO","TU","WE","TH","FR","SA"] as const;

const WEEK_DAYS = [
  { label: "Seg", dayIndex: 1 },
  { label: "Ter", dayIndex: 2 },
  { label: "Qua", dayIndex: 3 },
  { label: "Qui", dayIndex: 4 },
  { label: "Sex", dayIndex: 5 },
  { label: "Sáb", dayIndex: 6 },
  { label: "Dom", dayIndex: 0 },
];

// Indeterminate = 2 years of sessions (capped per frequency)
const INDETERMINATE_COUNTS: Record<string, Record<number, number>> = {
  WEEKLY:   { 1: 104, 2: 52 },   // 2 years
  MONTHLY:  { 1: 24 },            // 2 years
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a working Jitsi Meet link (rooms are created on first join, no auth needed) */
function generateJitsiLink(): string {
  // Use crypto-safe random to prevent guessable room IDs
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10).toUpperCase();
  return `https://meet.jit.si/Psycologger-${id}`;
}

/** Build RRULE string from UI selections */
function buildRRule(frequency: string, interval: number, dayIndex: number): string {
  const byday = RRULE_DAY[dayIndex];
  if (frequency === "MONTHLY") return `FREQ=MONTHLY`;
  const base = interval > 1 ? `FREQ=WEEKLY;INTERVAL=${interval}` : `FREQ=WEEKLY`;
  return `${base};BYDAY=${byday}`;
}

/**
 * Given a start date and RRULE + interval, advance by one period.
 * We control the RRULE format so simple string parsing is fine.
 */
function nextOccurrence(date: Date, frequency: string, interval: number): Date {
  if (frequency === "MONTHLY") return addMonths(date, 1);
  return addWeeks(date, interval);
}

/**
 * Given a target day-of-week index and a reference date,
 * return the date of the nearest future occurrence of that day
 * (same day if already correct, otherwise next week).
 */
function nearestDayOfWeek(from: Date, targetDay: number): Date {
  const current = getDay(from);
  if (current === targetDay) return from;
  // nextDay from date-fns expects Day 0-6 where 0=Sunday
  return nextDay(from, targetDay as 0|1|2|3|4|5|6);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NewAppointmentClient({ userId, role }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("newAppointment");

  const prefillPatientId = searchParams.get("patientId") ?? "";
  const today = format(new Date(), "yyyy-MM-dd");
  const prefillDate = searchParams.get("date") ?? today;
  const prefillTime = searchParams.get("time") ?? "09:00";

  // Remote data
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Main form
  const [form, setForm] = useState({
    patientId: prefillPatientId,
    appointmentTypeId: "",
    providerUserId: userId,
    date: prefillDate,
    time: prefillTime,
    durationMin: 50,
    location: "",
    videoLink: "",
    adminNotes: "",
  });

  // Inline new-patient form
  const [newPatient, setNewPatient] = useState({ fullName: "", preferredName: "", email: "", phone: "" });
  const [savingPatient, setSavingPatient] = useState(false);
  const [patientError, setPatientError] = useState("");

  // Recurrence state
  const [rec, setRec] = useState({
    enabled: false,
    frequency: "WEEKLY" as "WEEKLY" | "MONTHLY",
    interval: 1,                    // 1=weekly, 2=bi-weekly
    dayIndex: getDay(new Date()),   // JS day 0-6, synced with form.date
    time: prefillTime,              // can differ from the first session
    indeterminate: false,
    occurrences: 10,
  });

  // Notification state
  const [notif, setNotif] = useState({ enabled: false, methods: ["EMAIL"] as string[] });

  // ── Sync rec.dayIndex when form.date or form.time changes ──────────────────
  useEffect(() => {
    if (form.date) {
      try {
        const d = parseISO(form.date);
        setRec((r) => ({ ...r, dayIndex: getDay(d), time: form.time }));
      } catch {}
    }
  }, [form.date, form.time]);

  // ── Load patients + appointment types ──────────────────────────────────────
  const loadPatients = useCallback(async () => {
    const res = await fetch("/api/v1/patients?pageSize=200");
    if (res.ok) { const j = await res.json(); setPatients(j.data ?? []); }
  }, []);

  useEffect(() => {
    async function init() {
      await loadPatients();
      const tRes = await fetch("/api/v1/appointment-types");
      if (tRes.ok) {
        const j = await tRes.json();
        const active = (j.data ?? []).filter((t: any) => t.isActive);
        setAppointmentTypes(active);
        if (active.length > 0) {
          setForm((f) => ({ ...f, appointmentTypeId: f.appointmentTypeId || active[0].id, durationMin: active[0].defaultDurationMin }));
        }
      }
    }
    init();
  }, [loadPatients]);

  // ── Load providers (admins only) ───────────────────────────────────────────
  useEffect(() => {
    if (role !== "TENANT_ADMIN" && role !== "ASSISTANT") return;
    fetch("/api/v1/users")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!j) return;
        const list: Provider[] = (j.data ?? [])
          .filter((m: any) => ["PSYCHOLOGIST","TENANT_ADMIN"].includes(m.role) && m.status === "ACTIVE")
          .map((m: any) => ({ id: m.userId, name: m.user?.name?.trim() || m.user?.email || "Sem nome" }));
        setProviders(list);
        if (list.length > 0) setForm((f) => ({ ...f, providerUserId: f.providerUserId || list[0].id }));
      });
  }, [role]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleTypeChange(id: string) {
    const t = appointmentTypes.find((x) => x.id === id);
    setForm((f) => ({ ...f, appointmentTypeId: id, durationMin: t?.defaultDurationMin ?? f.durationMin }));
  }

  /** When user picks a recurrence weekday, snap form.date to the nearest future occurrence of that day */
  function handleRecDayChange(dayIndex: number) {
    try {
      const from = form.date ? parseISO(form.date) : new Date();
      const snapped = nearestDayOfWeek(from, dayIndex);
      setForm((f) => ({ ...f, date: format(snapped, "yyyy-MM-dd") }));
    } catch {}
    setRec((r) => ({ ...r, dayIndex }));
  }

  function handleGenerateLink() {
    setGeneratingLink(true);
    setTimeout(() => {
      setForm((f) => ({ ...f, videoLink: generateJitsiLink() }));
      setGeneratingLink(false);
    }, 350);
  }

  function toggleNotifyMethod(m: string) {
    setNotif((n) => ({ ...n, methods: n.methods.includes(m) ? n.methods.filter((x) => x !== m) : [...n.methods, m] }));
  }

  // ── Create new patient inline ──────────────────────────────────────────────
  async function handleCreatePatient(e: React.FormEvent) {
    e.preventDefault();
    if (!newPatient.fullName.trim()) { setPatientError("Nome é obrigatório."); return; }
    setSavingPatient(true);
    setPatientError("");
    try {
      const res = await fetchWithCsrf("/api/v1/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: newPatient.fullName.trim(),
          preferredName: newPatient.preferredName.trim() || undefined,
          email: newPatient.email.trim() || undefined,
          phone: newPatient.phone.trim() || undefined,
        }),
      });
      if (!res.ok) {
        if (res.status === 402) {
          const d = await res.json().catch(() => null);
          const msg =
            d?.code === "QUOTA_EXCEEDED"
              ? `Limite do plano atingido (${d.current ?? "?"}/${d.limit ?? "?"} pacientes). Faça upgrade para adicionar novos pacientes.`
              : "Limite do plano atingido. Faça upgrade para adicionar novos pacientes.";
          setPatientError(msg);
          return;
        }
        const d = await res.json().catch(() => ({}));
        setPatientError(typeof d?.error === "string" ? d.error : d?.error?.message ?? d?.message ?? "Erro ao criar paciente.");
        return;
      }
      const j = await res.json();
      await loadPatients();
      setForm((f) => ({ ...f, patientId: j.data?.id ?? j.id ?? "" }));
      setNewPatient({ fullName: "", preferredName: "", email: "", phone: "" });
      setShowNewPatient(false);
    } catch {
      setPatientError("Erro de rede.");
    } finally {
      setSavingPatient(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patientId || !form.appointmentTypeId) return;
    setLoading(true);
    setError("");

    try {
      const startsAt = new Date(`${form.date}T${form.time}:00`);
      const endsAt   = addMinutes(startsAt, form.durationMin);

      const rrule = rec.enabled ? buildRRule(rec.frequency, rec.interval, rec.dayIndex) : undefined;

      // Occurrences: if indeterminate, use 2-year cap based on frequency
      const occurrences = rec.enabled
        ? rec.indeterminate
          ? (INDETERMINATE_COUNTS[rec.frequency]?.[rec.interval] ?? 104)
          : rec.occurrences
        : undefined;

      const body: Record<string, unknown> = {
        patientId: form.patientId,
        appointmentTypeId: form.appointmentTypeId,
        providerUserId: form.providerUserId || userId,
        startsAt: startsAt.toISOString(),
        endsAt:   endsAt.toISOString(),
        location:    form.location    || undefined,
        videoLink:   form.videoLink   || undefined,
        adminNotes:  form.adminNotes  || undefined,
      };
      if (rrule) {
        body.recurrenceRrule        = rrule;
        body.recurrenceOccurrences  = occurrences;
        body.recurrenceTime         = rec.time;  // for expansion
        body.indeterminate          = rec.indeterminate;
      }
      if (notif.enabled && notif.methods.length > 0) {
        body.notifyPatient  = true;
        body.notifyMethods  = notif.methods;
      }

      const res = await fetchWithCsrf("/api/v1/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(typeof d?.error === "string" ? d.error : d?.error?.message ?? d?.message ?? "Erro ao criar consulta.");
        return;
      }

      router.push("/app/calendar");
      router.refresh();
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedPatient = patients.find((p) => p.id === form.patientId);
  const totalSessions = rec.enabled
    ? rec.indeterminate
      ? INDETERMINATE_COUNTS[rec.frequency]?.[rec.interval] ?? 104
      : rec.occurrences
    : 1;

  const recLabel = rec.enabled
    ? rec.frequency === "MONTHLY" ? t("monthly") : rec.interval === 2 ? t("biweekly") : t("weekly")
    : null;

  const selectedType = appointmentTypes.find((t) => t.id === form.appointmentTypeId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Card 1: Paciente e tipo ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">{t("patientAndType")}</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">

          {/* Patient selector + "novo paciente" button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="patientId">Paciente *</Label>
              <button
                type="button"
                onClick={() => setShowNewPatient((v) => !v)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
              >
                {showNewPatient ? <X className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                {showNewPatient ? t("cancel") : t("newPatient")}
              </button>
            </div>

            <select
              id="patientId"
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.patientId}
              onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
              required
            >
              <option value="">{t("selectPatient")}</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName ? `${p.preferredName} (${p.fullName})` : p.fullName}
                </option>
              ))}
            </select>

            {/* Inline new patient form */}
            {showNewPatient && (
              <div className="mt-2 border border-primary/30 bg-primary/10 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-primary/90 uppercase tracking-wide">{t("registerNewPatient")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">{t("fullName")}</Label>
                    <Input
                      placeholder="Maria da Silva"
                      value={newPatient.fullName}
                      onChange={(e) => setNewPatient((n) => ({ ...n, fullName: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("preferredName")}</Label>
                    <Input
                      placeholder="Maria"
                      value={newPatient.preferredName}
                      onChange={(e) => setNewPatient((n) => ({ ...n, preferredName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("phone")}</Label>
                    <PhoneInput
                      value={newPatient.phone}
                      onChange={(v) => setNewPatient((n) => ({ ...n, phone: v }))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      placeholder="maria@email.com"
                      value={newPatient.email}
                      onChange={(e) => setNewPatient((n) => ({ ...n, email: e.target.value }))}
                    />
                  </div>
                </div>
                {patientError && <p className="text-xs text-destructive">{patientError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" type="button" onClick={handleCreatePatient} disabled={savingPatient}>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    {savingPatient ? t("saving") : t("createAndSelect")}
                  </Button>
                  <Button size="sm" type="button" variant="outline" onClick={() => setShowNewPatient(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            )}

            {selectedPatient && !selectedPatient.email && notif.enabled && notif.methods.includes("EMAIL") && (
              <p className="text-xs text-amber-600">Paciente sem email — notificação por email não será enviada.</p>
            )}
          </div>

          {/* Appointment type */}
          <div className="space-y-1.5">
            <Label htmlFor="typeId">Tipo de consulta *</Label>
            {appointmentTypes.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                Nenhum tipo configurado.{" "}
                <a href="/app/settings/appointment-types" className="underline font-medium">Crie um tipo primeiro.</a>
              </p>
            ) : (
              <div className="flex gap-2 items-center">
                <select
                  id="typeId"
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.appointmentTypeId}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  required
                >
                  <option value="">Selecione...</option>
                  {appointmentTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {selectedType && (
                  <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedType.color }} />
                )}
              </div>
            )}
          </div>

          {/* Provider (admins only) */}
          {(role === "TENANT_ADMIN" || role === "ASSISTANT") && providers.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="providerId">Profissional *</Label>
              <select
                id="providerId"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.providerUserId}
                onChange={(e) => setForm((f) => ({ ...f, providerUserId: e.target.value }))}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 2: Data e horário ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">Data e horário</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data *</Label>
              <Input id="date" type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Horário *</Label>
              <Input id="time" type="time" value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} required />
            </div>
          </div>

          {/* Duration quick-select */}
          <div className="space-y-1.5">
            <Label>Duração</Label>
            <div className="flex gap-2 flex-wrap">
              {[30, 45, 50, 60, 90].map((d) => (
                <button key={d} type="button"
                  onClick={() => setForm((f) => ({ ...f, durationMin: d }))}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    form.durationMin === d
                      ? "bg-primary text-white border-primary"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {d}min
                </button>
              ))}
              <Input type="number" min={5} max={480} step={5}
                className="w-24"
                value={form.durationMin}
                onChange={(e) => setForm((f) => ({ ...f, durationMin: parseInt(e.target.value) || 50 }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3: Link de vídeo / local ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">Local / vídeo</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="location">Local presencial</Label>
            <Input id="location" placeholder="Ex: Sala 1, consultório principal..."
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              maxLength={200} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="videoLink">Link de videochamada</Label>
            <div className="flex gap-2">
              <Input id="videoLink" type="url"
                placeholder="https://..."
                value={form.videoLink}
                onChange={(e) => setForm((f) => ({ ...f, videoLink: e.target.value }))}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm"
                onClick={handleGenerateLink}
                disabled={generatingLink}
                className="whitespace-nowrap shrink-0 gap-1.5"
              >
                <Video className="h-3.5 w-3.5" />
                {generatingLink ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Gerar Jitsi"}
              </Button>
            </div>
            {form.videoLink?.includes("meet.jit.si") && (
              <p className="text-xs text-muted-foreground">
                Sala Jitsi criada automaticamente ao primeiro acesso. Funciona no navegador, sem instalação.{" "}
                <a href={form.videoLink} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Testar link ↗
                </a>
              </p>
            )}
            <p className="text-xs text-muted-foreground/70">
              Você também pode colar um link do Google Meet, Zoom ou qualquer outra plataforma.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 4: Recorrência ─────────────────────────────────────────── */}
      <Card>
        <button type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setShowRecurrence((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Consulta recorrente</span>
            {rec.enabled && recLabel && (
              <Badge variant="outline" className="text-xs font-normal text-primary border-primary/30 bg-primary/10">
                {recLabel} · {rec.indeterminate ? "∞" : `${rec.occurrences}x`}
              </Badge>
            )}
          </div>
          {showRecurrence ? <ChevronUp className="h-4 w-4 text-muted-foreground/70" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/70" />}
        </button>

        {showRecurrence && (
          <CardContent className="px-5 pb-5 pt-0 border-t space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center gap-2 pt-4">
              <input id="recEnabled" type="checkbox" checked={rec.enabled}
                onChange={(e) => setRec((r) => ({ ...r, enabled: e.target.checked }))} className="rounded" />
              <Label htmlFor="recEnabled" className="font-normal cursor-pointer">
                Tornar esta consulta recorrente
              </Label>
            </div>

            {rec.enabled && (
              <div className="space-y-5 pl-5 border-l-2 border-primary/30">

                {/* Frequency */}
                <div className="space-y-2">
                  <Label className="text-sm">Frequência</Label>
                  <div className="flex gap-2">
                    {[
                      { label: t("weekly"),   freq: "WEEKLY",   int: 1 },
                      { label: t("biweekly"), freq: "WEEKLY",   int: 2 },
                      { label: t("monthly"),    freq: "MONTHLY",  int: 1 },
                    ].map((opt) => {
                      const active = rec.frequency === opt.freq && rec.interval === opt.int;
                      return (
                        <button key={opt.label} type="button"
                          onClick={() => setRec((r) => ({ ...r, frequency: opt.freq as "WEEKLY"|"MONTHLY", interval: opt.int }))}
                          className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                            active ? "bg-primary text-white border-primary"
                                   : "bg-card text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Day of week (weekly/bi-weekly only) */}
                {rec.frequency === "WEEKLY" && (
                  <div className="space-y-2">
                    <Label className="text-sm">Dia da semana</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {WEEK_DAYS.map(({ label, dayIndex }) => (
                        <button key={dayIndex} type="button"
                          onClick={() => handleRecDayChange(dayIndex)}
                          className={`w-10 h-10 rounded-lg text-sm font-medium border transition-colors ${
                            rec.dayIndex === dayIndex
                              ? "bg-primary text-white border-primary"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A data de início foi ajustada para o próximo{" "}
                      <strong>{WEEK_DAYS.find((d) => d.dayIndex === rec.dayIndex)?.label}</strong>{" "}
                      ({form.date}).
                    </p>
                  </div>
                )}

                {/* Recurrence time (can differ from first session) */}
                <div className="space-y-2">
                  <Label htmlFor="recTime" className="text-sm">Horário das sessões</Label>
                  <div className="flex items-center gap-2">
                    <Input id="recTime" type="time"
                      className="w-36"
                      value={rec.time}
                      onChange={(e) => setRec((r) => ({ ...r, time: e.target.value }))}
                    />
                    {rec.time !== form.time && (
                      <button type="button"
                        onClick={() => setRec((r) => ({ ...r, time: form.time }))}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Usar horário da 1ª sessão ({form.time})
                      </button>
                    )}
                  </div>
                </div>

                {/* Duration: number of sessions OR indeterminate */}
                <div className="space-y-3">
                  <Label className="text-sm">Duração</Label>

                  {/* Indeterminate toggle */}
                  <div className="flex items-center gap-2">
                    <input id="indeterminate" type="checkbox"
                      checked={rec.indeterminate}
                      onChange={(e) => setRec((r) => ({ ...r, indeterminate: e.target.checked }))}
                      className="rounded" />
                    <Label htmlFor="indeterminate" className="font-normal cursor-pointer flex items-center gap-1.5">
                      <Infinity className="h-3.5 w-3.5 text-muted-foreground" />
                      Indeterminado (até cancelar)
                    </Label>
                  </div>

                  {rec.indeterminate ? (
                    <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md p-2">
                      Serão criadas <strong>{INDETERMINATE_COUNTS[rec.frequency]?.[rec.interval] ?? 104} sessões</strong>{" "}
                      (aproximadamente 2 anos). Você pode cancelar sessões individuais a qualquer momento.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <input type="range" min={2} max={52} value={rec.occurrences}
                          onChange={(e) => setRec((r) => ({ ...r, occurrences: parseInt(e.target.value) }))}
                          className="flex-1 accent-primary"
                        />
                        <span className="text-sm font-semibold text-foreground w-16 text-right">
                          {rec.occurrences} sessões
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {rec.frequency === "MONTHLY"
                          ? `~${rec.occurrences} meses`
                          : rec.interval === 2
                          ? `~${rec.occurrences * 2} semanas`
                          : `~${rec.occurrences} semanas`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Card 5: Notificações ────────────────────────────────────────── */}
      <Card>
        <button type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setShowNotification((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Notificar paciente</span>
            {notif.enabled && notif.methods.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal text-primary border-primary/30 bg-primary/10">
                {notif.methods.join(", ")}
              </Badge>
            )}
          </div>
          {showNotification ? <ChevronUp className="h-4 w-4 text-muted-foreground/70" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/70" />}
        </button>

        {showNotification && (
          <CardContent className="px-5 pb-5 pt-0 border-t space-y-4">
            <div className="flex items-center gap-2 pt-4">
              <input id="notifEnabled" type="checkbox" checked={notif.enabled}
                onChange={(e) => setNotif((n) => ({ ...n, enabled: e.target.checked }))} className="rounded" />
              <Label htmlFor="notifEnabled" className="font-normal cursor-pointer">
                Enviar confirmação ao paciente ao criar esta consulta
              </Label>
            </div>

            {notif.enabled && (
              <div className="space-y-3 pl-5 border-l-2 border-primary/30">
                <div className="flex gap-2 flex-wrap">
                  {/* Email — active */}
                  <button type="button" onClick={() => toggleNotifyMethod("EMAIL")}
                    className={`px-4 py-2 rounded-md text-sm border transition-colors flex items-center gap-1.5 ${
                      notif.methods.includes("EMAIL")
                        ? "bg-primary text-white border-primary"
                        : "bg-card text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    ✉️ Email
                  </button>
                  {/* WhatsApp — coming soon */}
                  {[{ emoji: "💬", label: "WhatsApp" }, { emoji: "📱", label: "SMS" }].map(({ emoji, label }) => (
                    <div key={label} className="relative">
                      <button type="button" disabled
                        className="px-4 py-2 rounded-md text-sm border border-border bg-muted/50 text-muted-foreground/70 cursor-not-allowed flex items-center gap-1.5"
                      >
                        {emoji} {label}
                      </button>
                      <span className="absolute -top-2 -right-1 text-[9px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-medium leading-4">
                        Em breve
                      </span>
                    </div>
                  ))}
                </div>

                {notif.methods.includes("EMAIL") && selectedPatient && (
                  selectedPatient.email
                    ? <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
                        Email enviado para <strong>{selectedPatient.email}</strong>.
                      </p>
                    : <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                        Paciente sem email — cadastre um email no perfil do paciente para enviar notificações.
                      </p>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Internal notes ──────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="adminNotes">Observações internas (opcional)</Label>
        <textarea id="adminNotes"
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Notas visíveis apenas para a equipe..."
          value={form.adminNotes}
          onChange={(e) => setForm((f) => ({ ...f, adminNotes: e.target.value }))}
          maxLength={1000}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md p-3" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3 pb-8">
        <Button type="button" variant="outline" onClick={() => router.back()}>{t("cancel")}</Button>
        <Button type="submit" disabled={loading || !form.patientId || !form.appointmentTypeId}>
          {loading
            ? t("saving")
            : rec.enabled
            ? t("createMultiple", { count: totalSessions })
            : t("createAppointment")}
        </Button>
      </div>
    </form>
  );
}
