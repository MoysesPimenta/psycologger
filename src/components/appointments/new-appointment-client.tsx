"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addMinutes, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Video, RefreshCw, Repeat, Bell, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patient {
  id: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
}

interface AppointmentType {
  id: string;
  name: string;
  defaultDurationMin: number;
  defaultPriceCents: number;
  color: string;
  sessionType: string;
}

interface Provider {
  id: string;
  name: string;
}

interface Props {
  userId: string;
  role: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a random Google Meet-style link: meet.google.com/xxx-xxxx-xxx */
function generateMeetLink(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const rand = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `https://meet.google.com/${rand(3)}-${rand(4)}-${rand(3)}`;
}

/** Convert a JS Date weekday (0=Sun…6=Sat) to RRULE BYDAY token */
const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function buildRRule(frequency: string, interval: number): string {
  if (frequency === "WEEKLY") {
    return interval === 1 ? "FREQ=WEEKLY" : `FREQ=WEEKLY;INTERVAL=${interval}`;
  }
  if (frequency === "MONTHLY") return "FREQ=MONTHLY";
  return "";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NewAppointmentClient({ userId, role }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const prefillPatientId = searchParams.get("patientId") ?? "";
  const prefillDate = searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");
  const prefillTime = searchParams.get("time") ?? "09:00";

  // Data
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [generatingMeet, setGeneratingMeet] = useState(false);

  // Form
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

  // Recurrence
  const [recurrence, setRecurrence] = useState({
    enabled: false,
    frequency: "WEEKLY",   // WEEKLY | MONTHLY
    interval: 1,           // 1 = weekly, 2 = bi-weekly (only used when WEEKLY)
    occurrences: 10,
  });

  // Notification
  const [notification, setNotification] = useState({
    enabled: false,
    methods: ["EMAIL"] as string[],
  });

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [pRes, tRes] = await Promise.all([
        fetch("/api/v1/patients?pageSize=200"),
        fetch("/api/v1/appointment-types"),
      ]);
      if (pRes.ok) {
        const json = await pRes.json();
        setPatients(json.data ?? []);
      }
      if (tRes.ok) {
        const json = await tRes.json();
        const active = (json.data ?? []).filter((t: AppointmentType & { isActive: boolean }) => t.isActive);
        setAppointmentTypes(active);
        if (active.length > 0) {
          setForm((f) => ({
            ...f,
            appointmentTypeId: f.appointmentTypeId || active[0].id,
            durationMin: active[0].defaultDurationMin,
          }));
        }
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role === "TENANT_ADMIN" || role === "ASSISTANT") {
      fetch("/api/v1/users")
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (!json) return;
          const mapped: Provider[] = (json.data ?? [])
            .filter((m: any) => ["PSYCHOLOGIST", "TENANT_ADMIN"].includes(m.role) && m.status === "ACTIVE")
            .map((m: any) => ({
              id: m.userId,
              name: m.user?.name?.trim() || m.user?.email || "Profissional sem nome",
            }));
          setProviders(mapped);
          if (mapped.length > 0) {
            setForm((f) => ({ ...f, providerUserId: f.providerUserId || mapped[0].id }));
          }
        });
    }
  }, [role]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleTypeChange(typeId: string) {
    const type = appointmentTypes.find((t) => t.id === typeId);
    setForm((f) => ({
      ...f,
      appointmentTypeId: typeId,
      durationMin: type?.defaultDurationMin ?? f.durationMin,
    }));
  }

  function handleGenerateMeet() {
    setGeneratingMeet(true);
    setTimeout(() => {
      setForm((f) => ({ ...f, videoLink: generateMeetLink() }));
      setGeneratingMeet(false);
    }, 400);
  }

  function toggleNotifyMethod(method: string) {
    setNotification((n) => ({
      ...n,
      methods: n.methods.includes(method)
        ? n.methods.filter((m) => m !== method)
        : [...n.methods, method],
    }));
  }

  const selectedPatient = patients.find((p) => p.id === form.patientId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patientId || !form.appointmentTypeId) return;

    setLoading(true);
    setError("");

    try {
      const startsAt = new Date(`${form.date}T${form.time}:00`);
      const endsAt = addMinutes(startsAt, form.durationMin);

      const rrule = recurrence.enabled
        ? buildRRule(recurrence.frequency, recurrence.interval)
        : undefined;

      const body: Record<string, unknown> = {
        patientId: form.patientId,
        appointmentTypeId: form.appointmentTypeId,
        providerUserId: form.providerUserId || userId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: form.location || undefined,
        videoLink: form.videoLink || undefined,
        adminNotes: form.adminNotes || undefined,
      };

      if (rrule) {
        body.recurrenceRrule = rrule;
        body.recurrenceOccurrences = recurrence.occurrences;
      }

      if (notification.enabled && notification.methods.length > 0) {
        body.notifyPatient = true;
        body.notifyMethods = notification.methods;
      }

      const res = await fetch("/api/v1/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "Erro ao criar consulta.");
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

  // ── Derived labels ────────────────────────────────────────────────────────

  const recurrenceLabel = (() => {
    if (!recurrence.enabled) return null;
    if (recurrence.frequency === "MONTHLY") return "Mensal";
    if (recurrence.interval === 2) return "Quinzenal";
    return "Semanal";
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Card 1: Who ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">Paciente e tipo</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">

          {/* Patient */}
          <div className="space-y-1.5">
            <Label htmlFor="patientId">Paciente *</Label>
            <select
              id="patientId"
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.patientId}
              onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
              required
            >
              <option value="">Selecione um paciente...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName ? `${p.preferredName} (${p.fullName})` : p.fullName}
                </option>
              ))}
            </select>
            {selectedPatient && !selectedPatient.email && notification.enabled && notification.methods.includes("EMAIL") && (
              <p className="text-xs text-amber-600">
                Este paciente não tem email cadastrado — a notificação por email não será enviada.
              </p>
            )}
          </div>

          {/* Appointment type */}
          <div className="space-y-1.5">
            <Label htmlFor="appointmentTypeId">Tipo de consulta *</Label>
            {appointmentTypes.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                Nenhum tipo configurado.{" "}
                <a href="/app/settings/appointment-types" className="underline font-medium">
                  Crie um tipo primeiro.
                </a>
              </p>
            ) : (
              <div className="flex gap-2 items-center">
                <select
                  id="appointmentTypeId"
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
                {/* Color dot */}
                {form.appointmentTypeId && (() => {
                  const t = appointmentTypes.find((x) => x.id === form.appointmentTypeId);
                  return t ? (
                    <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* Provider — admins only */}
          {(role === "TENANT_ADMIN" || role === "ASSISTANT") && providers.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="providerUserId">Profissional *</Label>
              <select
                id="providerUserId"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.providerUserId}
                onChange={(e) => setForm((f) => ({ ...f, providerUserId: e.target.value }))}
                required
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 2: When ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">Data e horário</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Horário *</Label>
              <Input
                id="time"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="durationMin">Duração (minutos)</Label>
            <div className="flex gap-2">
              {[30, 45, 50, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, durationMin: d }))}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    form.durationMin === d
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {d}min
                </button>
              ))}
              <Input
                id="durationMin"
                type="number"
                min={5}
                max={480}
                step={5}
                value={form.durationMin}
                onChange={(e) => setForm((f) => ({ ...f, durationMin: parseInt(e.target.value) || 50 }))}
                className="w-24"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3: Location / video ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">Local</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="location">Local presencial (opcional)</Label>
            <Input
              id="location"
              placeholder="Ex: Sala 1, consultório principal..."
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="videoLink">Link de videochamada (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="videoLink"
                type="url"
                placeholder="https://meet.google.com/..."
                value={form.videoLink}
                onChange={(e) => setForm((f) => ({ ...f, videoLink: e.target.value }))}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateMeet}
                disabled={generatingMeet}
                className="whitespace-nowrap gap-1.5 shrink-0"
                title="Gerar link do Google Meet automaticamente"
              >
                <Video className="h-3.5 w-3.5" />
                {generatingMeet ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Gerar Meet"
                )}
              </Button>
            </div>
            {form.videoLink && form.videoLink.includes("meet.google.com") && (
              <p className="text-xs text-gray-500">
                Link gerado. Compartilhe com o paciente após confirmar a consulta.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Card 4: Recurrence ───────────────────────────────────────────── */}
      <Card>
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setShowRecurrence((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-900">Consulta recorrente</span>
            {recurrence.enabled && recurrenceLabel && (
              <Badge variant="outline" className="text-xs font-normal text-brand-700 border-brand-300 bg-brand-50">
                {recurrenceLabel} · {recurrence.occurrences}x
              </Badge>
            )}
          </div>
          {showRecurrence ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {showRecurrence && (
          <CardContent className="px-5 pb-5 pt-0 border-t space-y-4">
            <div className="flex items-center gap-2 pt-4">
              <input
                id="recurrenceEnabled"
                type="checkbox"
                checked={recurrence.enabled}
                onChange={(e) => setRecurrence((r) => ({ ...r, enabled: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="recurrenceEnabled" className="font-normal cursor-pointer">
                Tornar esta consulta recorrente
              </Label>
            </div>

            {recurrence.enabled && (
              <div className="space-y-4 pl-6 border-l-2 border-brand-100">
                {/* Frequency */}
                <div className="space-y-1.5">
                  <Label>Frequência</Label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { label: "Semanal", frequency: "WEEKLY", interval: 1 },
                      { label: "Quinzenal", frequency: "WEEKLY", interval: 2 },
                      { label: "Mensal", frequency: "MONTHLY", interval: 1 },
                    ].map((opt) => {
                      const active =
                        recurrence.frequency === opt.frequency &&
                        recurrence.interval === opt.interval;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() =>
                            setRecurrence((r) => ({
                              ...r,
                              frequency: opt.frequency,
                              interval: opt.interval,
                            }))
                          }
                          className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                            active
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Occurrences */}
                <div className="space-y-1.5">
                  <Label htmlFor="occurrences">Número de sessões</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="occurrences"
                      type="range"
                      min={2}
                      max={52}
                      value={recurrence.occurrences}
                      onChange={(e) =>
                        setRecurrence((r) => ({ ...r, occurrences: parseInt(e.target.value) }))
                      }
                      className="flex-1 accent-brand-600"
                    />
                    <span className="text-sm font-semibold text-gray-900 w-14 text-right">
                      {recurrence.occurrences} sessões
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {recurrence.frequency === "MONTHLY"
                      ? `Duração: ~${recurrence.occurrences} meses`
                      : recurrence.interval === 2
                      ? `Duração: ~${Math.round(recurrence.occurrences * 2)} semanas`
                      : `Duração: ~${recurrence.occurrences} semanas`}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Card 5: Notifications ────────────────────────────────────────── */}
      <Card>
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setShowNotification((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-900">Notificar paciente</span>
            {notification.enabled && notification.methods.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal text-brand-700 border-brand-300 bg-brand-50">
                {notification.methods.join(", ")}
              </Badge>
            )}
          </div>
          {showNotification ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {showNotification && (
          <CardContent className="px-5 pb-5 pt-0 border-t space-y-4">
            <div className="flex items-center gap-2 pt-4">
              <input
                id="notifyEnabled"
                type="checkbox"
                checked={notification.enabled}
                onChange={(e) => setNotification((n) => ({ ...n, enabled: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="notifyEnabled" className="font-normal cursor-pointer">
                Enviar confirmação ao paciente ao criar esta consulta
              </Label>
            </div>

            {notification.enabled && (
              <div className="space-y-3 pl-6 border-l-2 border-brand-100">
                <Label className="text-xs text-gray-600 font-normal uppercase tracking-wide">
                  Canal de envio
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {/* Email — active */}
                  <button
                    type="button"
                    onClick={() => toggleNotifyMethod("EMAIL")}
                    className={`px-4 py-2 rounded-md text-sm border transition-colors flex items-center gap-1.5 ${
                      notification.methods.includes("EMAIL")
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    ✉️ Email
                  </button>

                  {/* WhatsApp — coming soon */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled
                      className="px-4 py-2 rounded-md text-sm border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed flex items-center gap-1.5"
                    >
                      💬 WhatsApp
                    </button>
                    <span className="absolute -top-2 -right-2 text-[10px] bg-gray-200 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">
                      Em breve
                    </span>
                  </div>

                  {/* SMS — coming soon */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled
                      className="px-4 py-2 rounded-md text-sm border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed flex items-center gap-1.5"
                    >
                      📱 SMS
                    </button>
                    <span className="absolute -top-2 -right-2 text-[10px] bg-gray-200 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">
                      Em breve
                    </span>
                  </div>
                </div>

                {notification.methods.includes("EMAIL") && selectedPatient && !selectedPatient.email && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                    O paciente selecionado não tem email cadastrado. A notificação não será enviada.
                  </p>
                )}
                {notification.methods.includes("EMAIL") && selectedPatient?.email && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
                    Email de confirmação será enviado para <strong>{selectedPatient.email}</strong>.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Internal notes ───────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="adminNotes">Observações internas (opcional)</Label>
        <textarea
          id="adminNotes"
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
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading || !form.patientId || !form.appointmentTypeId}
        >
          {loading
            ? "Salvando..."
            : recurrence.enabled
            ? `Criar ${recurrence.occurrences} consultas`
            : "Criar consulta"}
        </Button>
      </div>
    </form>
  );
}
