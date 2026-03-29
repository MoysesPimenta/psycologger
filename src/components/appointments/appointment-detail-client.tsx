"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar, Clock, MapPin, Video, User, Stethoscope, FileText,
  Edit2, X, Check, AlertTriangle, ChevronLeft, ExternalLink,
  Repeat, CreditCard, Trash2, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppointmentType {
  id: string; name: string; color: string;
  sessionType: string; defaultDurationMin: number; defaultPriceCents: number;
}
interface Patient {
  id: string; fullName: string; preferredName: string | null;
  email: string | null; phone: string | null;
  defaultFeeOverrideCents?: number | null;
  defaultAppointmentType?: { id: string; name: string; defaultPriceCents: number } | null;
}
interface Provider { id: string; name: string; email: string | null }
interface Recurrence { id: string; rrule: string; occurrences: number | null; startsAt: string }
interface Payment { id: string; amountCents: number; method: string; paidAt: string }
interface Charge {
  id: string; status: string; amountCents: number; discountCents: number | null;
  payments: Payment[];
}
interface ClinicalSession { id: string }

interface Appointment {
  id: string;
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW";
  startsAt: string;
  endsAt: string;
  location: string | null;
  videoLink: string | null;
  adminNotes: string | null;
  recurrenceId: string | null;
  patient: Patient;
  provider: Provider;
  appointmentType: AppointmentType;
  recurrence: Recurrence | null;
  clinicalSession: ClinicalSession | null;
  charges: Charge[];
}

interface Props {
  appointment: Appointment;
  role: string;
  canViewSessions?: boolean;
  recurrenceTotal: number;
  recurrenceFutureCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  COMPLETED: "Realizada",
  CANCELED:  "Cancelada",
  NO_SHOW:   "Falta",
};

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 border-blue-200",
  CONFIRMED: "bg-green-100 text-green-800 border-green-200",
  COMPLETED: "bg-gray-100 text-gray-800 border-gray-200",
  CANCELED:  "bg-red-100 text-red-800 border-red-200",
  NO_SHOW:   "bg-orange-100 text-orange-800 border-orange-200",
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  IN_PERSON: "Presencial",
  ONLINE: "Online",
  EVALUATION: "Avaliação",
  GROUP: "Grupo",
};

function formatRRule(rrule: string): string {
  if (rrule.includes("FREQ=MONTHLY")) return "Mensal";
  const days: Record<string, string> = {
    MO: "segunda", TU: "terça", WE: "quarta",
    TH: "quinta", FR: "sexta", SA: "sábado", SU: "domingo",
  };
  const dayMatch = rrule.match(/BYDAY=([A-Z]+)/);
  const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
  const day = dayMatch ? (days[dayMatch[1]] ?? dayMatch[1]) : "";
  if (interval === 2) return `Quinzenal (${day})`;
  return `Semanal (${day})`;
}

// ─── Component ────────────────────────────────────────────────────────────────

/** Normalize any date value (Date object or string) to an ISO string */
function toISO(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  return String(val);
}

/** Normalize an appointment so all date fields are ISO strings */
function normalizeAppt(raw: Appointment): Appointment {
  return {
    ...raw,
    startsAt: toISO(raw.startsAt),
    endsAt:   toISO(raw.endsAt),
    recurrence: raw.recurrence
      ? { ...raw.recurrence, startsAt: toISO(raw.recurrence.startsAt) }
      : null,
  };
}

/** Format a datetime ISO string as a local datetime-local input value "YYYY-MM-DDTHH:mm" */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentDetailClient({
  appointment: initialAppt,
  role,
  canViewSessions = true,
  recurrenceTotal,
  recurrenceFutureCount,
}: Props) {
  const router = useRouter();
  const [appt, setAppt] = useState(() => normalizeAppt(initialAppt));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Cancel dialog state
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelScope, setCancelScope] = useState<"THIS" | "THIS_AND_FUTURE">("THIS");
  const [cancelling, setCancelling] = useState(false);

  // Charge prompt state — shown after COMPLETED / CANCELED / NO_SHOW if patient has billing defaults
  const [chargePrompt, setChargePrompt] = useState<{
    pendingStatus: string;
    feeCents: number;
    label: string;
  } | null>(null);
  const [creatingCharge, setCreatingCharge] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    startsAt: toLocalInput(toISO(initialAppt.startsAt)),
    endsAt:   toLocalInput(toISO(initialAppt.endsAt)),
    location: initialAppt.location ?? "",
    videoLink: initialAppt.videoLink ?? "",
    adminNotes: initialAppt.adminNotes ?? "",
    appointmentTypeId: initialAppt.appointmentType.id,
  });

  // "Active" = can still be progressed forward (scheduled/confirmed)
  const isActive   = !["CANCELED", "NO_SHOW", "COMPLETED"].includes(appt.status);
  // "Editable" = can edit fields (also allow for completed — psychologist may need to fix notes/link)
  const canEdit    = !["CANCELED"].includes(appt.status) && ["SUPERADMIN", "TENANT_ADMIN", "PSYCHOLOGIST", "ASSISTANT"].includes(role);
  const canCancel  = isActive && ["SUPERADMIN", "TENANT_ADMIN", "PSYCHOLOGIST", "ASSISTANT"].includes(role);
  const canComplete= isActive && ["SUPERADMIN", "TENANT_ADMIN", "PSYCHOLOGIST"].includes(role);
  const canCorrect = ["COMPLETED", "NO_SHOW"].includes(appt.status) && ["SUPERADMIN", "TENANT_ADMIN", "PSYCHOLOGIST"].includes(role);

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Effective fee: patient override > patient default type > appointment type default
  const effectiveFeeCents: number | null =
    appt.patient.defaultFeeOverrideCents != null
      ? appt.patient.defaultFeeOverrideCents
      : appt.patient.defaultAppointmentType?.defaultPriceCents != null
        ? appt.patient.defaultAppointmentType.defaultPriceCents
        : appt.appointmentType.defaultPriceCents > 0
          ? appt.appointmentType.defaultPriceCents
          : null;

  const hasExistingCharge = appt.charges.length > 0;

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/v1/appointments/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Erro ao atualizar consulta.");
    }
    return res.json();
  }

  async function applyStatusChange(status: string) {
    setSaving(true);
    setError("");
    try {
      await patch({ status });
      setAppt((a) => ({ ...a, status: status as Appointment["status"] }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: string) {
    // For statuses that warrant a charge prompt — show it if patient has fee configured
    if (
      ["COMPLETED", "CANCELED", "NO_SHOW"].includes(status) &&
      effectiveFeeCents != null &&
      !hasExistingCharge
    ) {
      const labels: Record<string, string> = {
        COMPLETED: "Consulta realizada",
        CANCELED: "Consulta cancelada",
        NO_SHOW: "Falta registrada",
      };
      setChargePrompt({ pendingStatus: status, feeCents: effectiveFeeCents, label: labels[status] });
      return;
    }
    await applyStatusChange(status);
  }

  async function handleChargeDecision(charge: boolean) {
    if (!chargePrompt) return;
    await applyStatusChange(chargePrompt.pendingStatus);
    if (charge) {
      setCreatingCharge(true);
      try {
        await fetch("/api/v1/charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: appt.patient.id,
            appointmentId: appt.id,
            providerUserId: appt.provider.id,
            amountCents: chargePrompt.feeCents,
            dueDate: new Date().toISOString().split("T")[0],
            description: chargePrompt.label,
          }),
        });
        setAppt((a) => ({
          ...a,
          charges: [...a.charges, {
            id: crypto.randomUUID(),
            status: "PENDING",
            amountCents: chargePrompt.feeCents,
            discountCents: 0,
            payments: [],
          }],
        }));
      } catch {
        // charge failed silently — user can create manually
      } finally {
        setCreatingCharge(false);
      }
    }
    setChargePrompt(null);
  }

  async function handleSaveEdit() {
    try {
      setSaving(true);
      setError("");
      // Convert local datetime-local strings → UTC ISO strings
      const isoStart = new Date(editForm.startsAt).toISOString();
      const isoEnd   = new Date(editForm.endsAt).toISOString();
      await patch({
        startsAt: isoStart,
        endsAt: isoEnd,
        location: editForm.location || null,
        videoLink: editForm.videoLink || null,
        adminNotes: editForm.adminNotes || null,
      });
      setAppt((a) => ({
        ...a,
        startsAt: isoStart,
        endsAt: isoEnd,
        location: editForm.location || null,
        videoLink: editForm.videoLink || null,
        adminNotes: editForm.adminNotes || null,
      }));
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    try {
      setCancelling(true);
      setError("");
      // If recurring with scope, do the special cancel — otherwise go through charge prompt
      if (cancelScope === "THIS_AND_FUTURE" && appt.recurrenceId) {
        await patch({ status: "CANCELED", cancelScope });
        setAppt((a) => ({ ...a, status: "CANCELED" }));
        setCancelDialog(false);
      } else {
        setCancelDialog(false);
        await handleStatusChange("CANCELED");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setCancelling(false);
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const startsAtDate = parseISO(appt.startsAt);
  const endsAtDate   = parseISO(appt.endsAt);
  const dateLabel    = format(startsAtDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const timeLabel    = `${format(startsAtDate, "HH:mm")} – ${format(endsAtDate, "HH:mm")}`;
  const durationMin  = Math.round((endsAtDate.getTime() - startsAtDate.getTime()) / 60000);

  const totalCharged = appt.charges.reduce((s, c) => s + c.amountCents - (c.discountCents ?? 0), 0);
  const totalPaid    = appt.charges.flatMap((c) => c.payments).reduce((s, p) => s + p.amountCents, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 text-gray-500">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex-1" />
        <Badge className={`border text-xs font-medium ${STATUS_COLORS[appt.status]}`}>
          {STATUS_LABELS[appt.status]}
        </Badge>
      </div>

      {/* ── Title block ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {appt.patient.preferredName ?? appt.patient.fullName}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">{dateLabel}</p>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Main info card ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Detalhes da Consulta</CardTitle>
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Edit2 className="h-3.5 w-3.5" /> Editar
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {!editing ? (
            // ── View mode ──────────────────────────────────────────────────
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={<Calendar className="h-4 w-4 text-brand-500" />} label="Data">
                <span className="capitalize">{dateLabel}</span>
              </InfoRow>
              <InfoRow icon={<Clock className="h-4 w-4 text-brand-500" />} label="Horário">
                {timeLabel} <span className="text-gray-400">({durationMin} min)</span>
              </InfoRow>
              <InfoRow icon={<User className="h-4 w-4 text-brand-500" />} label="Paciente">
                <a
                  href={`/app/patients/${appt.patient.id}`}
                  className="text-brand-600 hover:underline font-medium"
                >
                  {appt.patient.fullName}
                </a>
                {appt.patient.email && (
                  <span className="block text-xs text-gray-500">{appt.patient.email}</span>
                )}
              </InfoRow>
              <InfoRow icon={<Stethoscope className="h-4 w-4 text-brand-500" />} label="Profissional">
                {appt.provider.name}
              </InfoRow>
              <InfoRow icon={<div className="h-3 w-3 rounded-full" style={{ backgroundColor: appt.appointmentType.color }} />} label="Tipo">
                {appt.appointmentType.name}
                <span className="ml-1.5 text-xs text-gray-400">
                  ({SESSION_TYPE_LABELS[appt.appointmentType.sessionType] ?? appt.appointmentType.sessionType})
                </span>
              </InfoRow>
              {appt.location && (
                <InfoRow icon={<MapPin className="h-4 w-4 text-brand-500" />} label="Local">
                  {appt.location}
                </InfoRow>
              )}
              {appt.videoLink && (
                <InfoRow icon={<Video className="h-4 w-4 text-brand-500" />} label="Videoconferência">
                  <a
                    href={appt.videoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  >
                    Entrar na sala <ExternalLink className="h-3 w-3" />
                  </a>
                </InfoRow>
              )}
              {appt.recurrence && (
                <InfoRow icon={<Repeat className="h-4 w-4 text-brand-500" />} label="Recorrência">
                  {formatRRule(appt.recurrence.rrule)}
                  {recurrenceTotal > 0 && (
                    <span className="ml-1.5 text-xs text-gray-400">
                      · {recurrenceTotal} sessões ativas
                    </span>
                  )}
                </InfoRow>
              )}
              {appt.adminNotes && (
                <div className="sm:col-span-2">
                  <InfoRow icon={<FileText className="h-4 w-4 text-brand-500" />} label="Observações">
                    <p className="whitespace-pre-wrap text-gray-700">{appt.adminNotes}</p>
                  </InfoRow>
                </div>
              )}
            </div>
          ) : (
            // ── Edit mode ──────────────────────────────────────────────────
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Início</Label>
                  <Input
                    type="datetime-local"
                    value={editForm.startsAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, startsAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Término</Label>
                  <Input
                    type="datetime-local"
                    value={editForm.endsAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, endsAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Local</Label>
                <Input
                  placeholder="Consultório, endereço..."
                  value={editForm.location}
                  onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Link de videoconferência</Label>
                <Input
                  placeholder="https://meet.jit.si/..."
                  value={editForm.videoLink}
                  onChange={(e) => setEditForm((f) => ({ ...f, videoLink: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <textarea
                  rows={3}
                  placeholder="Notas internas..."
                  value={editForm.adminNotes}
                  onChange={(e) => setEditForm((f) => ({ ...f, adminNotes: e.target.value }))}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="gap-1.5 bg-brand-600 hover:bg-brand-700"
                >
                  <Check className="h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Status actions (active appointments) ── */}
      {isActive && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ações</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {appt.status === "SCHEDULED" && (
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => handleStatusChange("CONFIRMED")}
                className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
              >
                <Check className="h-3.5 w-3.5" /> Confirmar presença
              </Button>
            )}
            {canComplete && (
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => handleStatusChange("COMPLETED")}
                className="gap-1.5 border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <Check className="h-3.5 w-3.5" /> Marcar como realizada
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => handleStatusChange("NO_SHOW")}
              className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <X className="h-3.5 w-3.5" /> Registrar falta
            </Button>
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setCancelDialog(true)}
                className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 ml-auto"
              >
                <Trash2 className="h-3.5 w-3.5" /> Cancelar consulta
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Restore panel (cancelled or no-show) ── */}
      {(appt.status === "CANCELED" || appt.status === "NO_SHOW") && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-amber-800">
              {appt.status === "CANCELED" ? "Consulta cancelada" : "Falta registrada"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-amber-700">
              {appt.status === "CANCELED"
                ? "Esta consulta foi cancelada. Se foi um engano ou o paciente confirmou presença, você pode reativá-la."
                : "A falta foi registrada. Se o paciente compareceu ou houve um engano, você pode corrigir o status."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => handleStatusChange("SCHEDULED")}
                className="gap-1.5 border-amber-400 text-amber-800 hover:bg-amber-100 bg-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reagendar (voltar para agendada)
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => handleStatusChange("CONFIRMED")}
                className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50 bg-white"
              >
                <Check className="h-3.5 w-3.5" /> Marcar como confirmada
              </Button>
              {appt.status === "NO_SHOW" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => handleStatusChange("COMPLETED")}
                  className="gap-1.5 border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
                >
                  <Check className="h-3.5 w-3.5" /> O paciente compareceu (marcar realizada)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Correct status for COMPLETED ── */}
      {canCorrect && appt.status === "COMPLETED" && (
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-700">Corrigir status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline" size="sm" disabled={saving}
              onClick={() => handleStatusChange("NO_SHOW")}
              className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <X className="h-3.5 w-3.5" /> O paciente faltou (registrar falta)
            </Button>
            <Button
              variant="outline" size="sm" disabled={saving}
              onClick={() => handleStatusChange("CANCELED")}
              className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Cancelar consulta
            </Button>
            <Button
              variant="outline" size="sm" disabled={saving}
              onClick={() => handleStatusChange("SCHEDULED")}
              className="gap-1.5 border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Voltar para agendada
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Clinical session ── */}
      {appt.status === "COMPLETED" && canViewSessions && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Prontuário</CardTitle>
            <Button
              variant={appt.clinicalSession ? "outline" : "default"}
              size="sm"
              onClick={() =>
                appt.clinicalSession
                  ? router.push(`/app/sessions/${appt.clinicalSession.id}`)
                  : router.push(`/app/sessions/new?appointmentId=${appt.id}&patientId=${appt.patient.id}`)
              }
              className={!appt.clinicalSession ? "bg-brand-600 hover:bg-brand-700" : ""}
            >
              {appt.clinicalSession ? "Ver anotação" : "Criar anotação clínica"}
            </Button>
          </CardHeader>
          {!appt.clinicalSession && (
            <CardContent>
              <p className="text-sm text-gray-500">
                Nenhuma anotação clínica registrada para esta consulta.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Financial ── */}
      {appt.charges.length > 0 && (
        <ChargesCard
          charges={appt.charges}
          totalCharged={totalCharged}
          totalPaid={totalPaid}
          onChargesChange={(charges) => setAppt((a) => ({ ...a, charges }))}
        />
      )}

      {/* ── Charge prompt modal ── */}
      {chargePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                <CreditCard className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Cobrar esta sessão?</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {chargePrompt.label} — {appt.patient.preferredName ?? appt.patient.fullName}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 border px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Valor a cobrar</span>
              <span className="text-lg font-bold text-gray-900">
                R$ {(chargePrompt.feeCents / 100).toFixed(2).replace(".", ",")}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Uma cobrança com status <strong>pendente</strong> será criada no financeiro do paciente. Você pode ajustar o valor ou aplicar desconto depois.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                onClick={() => handleChargeDecision(false)}
                disabled={creatingCharge}
              >
                Não cobrar
              </Button>
              <Button
                onClick={() => handleChargeDecision(true)}
                disabled={creatingCharge}
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
              >
                <CreditCard className="h-4 w-4" />
                {creatingCharge ? "Criando..." : `Cobrar R$ ${(chargePrompt.feeCents / 100).toFixed(2).replace(".", ",")}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel dialog (modal-style) ── */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Cancelar consulta</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {format(parseISO(appt.startsAt), "d 'de' MMMM · HH:mm", { locale: ptBR })} —{" "}
                  {appt.patient.preferredName ?? appt.patient.fullName}
                </p>
              </div>
            </div>

            {/* Show scope selector only for recurring appointments with future sessions */}
            {appt.recurrenceId && recurrenceFutureCount > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">O que deseja cancelar?</p>
                <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
                  <input
                    type="radio"
                    name="cancelScope"
                    value="THIS"
                    checked={cancelScope === "THIS"}
                    onChange={() => setCancelScope("THIS")}
                    className="mt-0.5 accent-brand-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Somente esta consulta</p>
                    <p className="text-xs text-gray-500">
                      As {recurrenceFutureCount} próximas sessões permanecem agendadas.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-red-400 has-[:checked]:bg-red-50">
                  <input
                    type="radio"
                    name="cancelScope"
                    value="THIS_AND_FUTURE"
                    checked={cancelScope === "THIS_AND_FUTURE"}
                    onChange={() => setCancelScope("THIS_AND_FUTURE")}
                    className="mt-0.5 accent-red-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Esta e todas as futuras</p>
                    <p className="text-xs text-gray-500">
                      Esta consulta + {recurrenceFutureCount} sessão(ões) seguintes serão canceladas.
                    </p>
                  </div>
                </label>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                Esta ação irá cancelar a consulta. Ela não poderá ser desfeita automaticamente.
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                onClick={() => setCancelDialog(false)}
                disabled={cancelling}
              >
                Manter consulta
              </Button>
              <Button
                onClick={handleCancel}
                disabled={cancelling}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {cancelling
                  ? "Cancelando..."
                  : cancelScope === "THIS_AND_FUTURE"
                  ? `Cancelar ${recurrenceFutureCount + 1} sessões`
                  : "Cancelar esta consulta"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Charges card ─────────────────────────────────────────────────────────────

function ChargesCard({
  charges: initialCharges,
  totalCharged,
  totalPaid,
  onChargesChange,
}: {
  charges: Charge[];
  totalCharged: number;
  totalPaid: number;
  onChargesChange: (charges: Charge[]) => void;
}) {
  const [charges, setCharges] = useState(initialCharges);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ amountCents: "", discountCents: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function startEdit(charge: Charge) {
    setEditingId(charge.id);
    setEditForm({
      amountCents: (charge.amountCents / 100).toFixed(2),
      discountCents: ((charge.discountCents ?? 0) / 100).toFixed(2),
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const amount = Math.round(parseFloat(editForm.amountCents.replace(",", ".")) * 100);
      const discount = Math.round(parseFloat((editForm.discountCents || "0").replace(",", ".")) * 100);
      const res = await fetch(`/api/v1/charges/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: amount, discountCents: discount }),
      });
      if (!res.ok) throw new Error();
      const updated = charges.map((c) =>
        c.id === id ? { ...c, amountCents: amount, discountCents: discount } : c
      );
      setCharges(updated);
      onChargesChange(updated);
      setEditingId(null);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  async function deleteCharge(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/charges/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const updated = charges.filter((c) => c.id !== id);
      setCharges(updated);
      onChargesChange(updated);
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  }

  const STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendente", PAID: "Pago", OVERDUE: "Vencido",
    PARTIAL: "Parcial", VOID: "Cancelado",
  };

  if (charges.length === 0) return null;

  const computedTotal = charges.reduce((s, c) => s + c.amountCents - (c.discountCents ?? 0), 0);
  const computedPaid  = charges.flatMap((c) => c.payments).reduce((s, p) => s + p.amountCents, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Financeiro</CardTitle>
        <div className="text-sm font-medium text-gray-600">
          {computedPaid >= computedTotal ? (
            <span className="text-green-700">Pago</span>
          ) : (
            <span className="text-orange-700">
              Pendente · R$ {((computedTotal - computedPaid) / 100).toFixed(2).replace(".", ",")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {charges.map((charge) => (
          <div key={charge.id} className="rounded-lg border border-gray-100 p-3 space-y-2">
            {editingId === charge.id ? (
              // ── Edit mode ──
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Valor (R$)</label>
                    <input
                      type="text" inputMode="decimal"
                      value={editForm.amountCents}
                      onChange={(e) => setEditForm((f) => ({ ...f, amountCents: e.target.value }))}
                      className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Desconto (R$)</label>
                    <input
                      type="text" inputMode="decimal"
                      value={editForm.discountCents}
                      onChange={(e) => setEditForm((f) => ({ ...f, discountCents: e.target.value }))}
                      className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
                {editForm.discountCents && parseFloat(editForm.discountCents.replace(",", ".")) > 0 && (
                  <p className="text-xs text-gray-500">
                    Valor final: R$ {Math.max(0, (parseFloat(editForm.amountCents.replace(",", ".")) - parseFloat(editForm.discountCents.replace(",", ".")))).toFixed(2).replace(".", ",")}
                  </p>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setEditingId(null)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => saveEdit(charge.id)} disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            ) : (
              // ── View mode ──
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-medium text-gray-800">
                    R$ {((charge.amountCents - (charge.discountCents ?? 0)) / 100).toFixed(2).replace(".", ",")}
                  </span>
                  {(charge.discountCents ?? 0) > 0 && (
                    <span className="text-xs text-gray-400 line-through">
                      R$ {(charge.amountCents / 100).toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs">
                    {STATUS_LABELS[charge.status] ?? charge.status}
                  </Badge>
                  {/* Only allow edit/delete if no payments yet */}
                  {charge.payments.length === 0 && (
                    <>
                      <button
                        onClick={() => startEdit(charge)}
                        title="Editar cobrança"
                        className="p-1 rounded text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCharge(charge.id)}
                        disabled={deletingId === charge.id}
                        title="Excluir cobrança"
                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Info Row helper ──────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <div className="text-sm text-gray-900 mt-0.5">{children}</div>
      </div>
    </div>
  );
}
