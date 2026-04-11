"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format, parseISO } from "date-fns";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { ptBR } from "date-fns/locale";
import {
  Calendar, Clock, MapPin, Video, User, Stethoscope, FileText,
  Edit2, X, Check, AlertTriangle, ChevronLeft, ExternalLink,
  Repeat, CreditCard, Trash2, RefreshCw, DollarSign, Split,
} from "lucide-react";
import { chargeStatusLabel } from "@/lib/utils";
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
  dueDate?: string | null;
  description?: string | null;
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

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 border-blue-200",
  CONFIRMED: "bg-green-100 text-green-800 border-green-200",
  COMPLETED: "bg-muted text-gray-800 border-border",
  CANCELED:  "bg-red-100 text-red-800 border-red-200",
  NO_SHOW:   "bg-orange-100 text-orange-800 border-orange-200",
};

const DAYS_PT_BR: Record<string, string> = {
  MO: "segunda", TU: "terça", WE: "quarta",
  TH: "quinta", FR: "sexta", SA: "sábado", SU: "domingo",
};

function formatRRule(rrule: string): string {
  if (rrule.includes("FREQ=MONTHLY")) return "Mensal";
  const dayMatch = rrule.match(/BYDAY=([A-Z]+)/);
  const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
  const day = dayMatch ? (DAYS_PT_BR[dayMatch[1]] ?? dayMatch[1]) : "";
  if (interval === 2) return `Quinzenal (${day})`;
  return `Semanal (${day})`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build payment method options from translations */
function buildPaymentMethods(t: ReturnType<typeof useTranslations>) {
  return [
    { value: "PIX", label: t("enums.paymentMethod.PIX") },
    { value: "CASH", label: t("enums.paymentMethod.CASH") },
    { value: "CARD", label: t("enums.paymentMethod.CARD") },
    { value: "TRANSFER", label: t("enums.paymentMethod.TRANSFER") },
    { value: "INSURANCE", label: t("enums.paymentMethod.INSURANCE") },
    { value: "OTHER", label: t("enums.paymentMethod.OTHER") },
  ];
}

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

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({
  chargeId,
  netAmountCents,
  chargeDueDate,
  patientId,
  providerId,
  appointmentId,
  onClose,
  onPaid,
  partial = false,
  t,
}: {
  chargeId: string;
  netAmountCents: number;
  chargeDueDate?: string | null;
  patientId: string;
  providerId: string;
  appointmentId: string;
  onClose: () => void;
  onPaid: (payment: Payment, newStatus: string, remainderCharge?: Charge) => void;
  partial?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [method, setMethod] = useState("PIX");
  const [amount, setAmount] = useState((netAmountCents / 100).toFixed(2));
  const [paidAt, setPaidAt] = useState(todayISO());
  const [dueDate, setDueDate] = useState(chargeDueDate ? new Date(chargeDueDate).toISOString().slice(0, 10) : todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const amountCents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
      if (!amountCents || amountCents <= 0) {
        setError(t("paymentErrorAmount"));
        setSaving(false);
        return;
      }
      if (amountCents > netAmountCents) {
        setError(`${t("paymentErrorExceeds")} R$ ${(netAmountCents / 100).toFixed(2).replace(".", ",")}.`);
        setSaving(false);
        return;
      }

      const res = await fetchWithCsrf("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeId,
          amountCents,
          method,
          paidAt: new Date(paidAt).toISOString(),
          remainderDueDate: dueDate || undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(typeof errData?.error === "string" ? errData.error : errData?.error?.message ?? errData?.message ?? t("paymentErrorGeneral"));
      }
      const payData = await res.json();

      // Server handles remainder charge creation atomically — just read the result
      const serverRemainder = payData.data?.remainderCharge;
      const remainderCharge: Charge | undefined = serverRemainder
        ? { ...serverRemainder, payments: [] }
        : undefined;

      const newPayment: Payment = {
        id: payData.data?.payment?.id ?? crypto.randomUUID(),
        amountCents,
        method,
        paidAt: new Date(paidAt).toISOString(),
      };

      // Original charge is PAID whenever server created a remainder or full amount was covered
      const newStatus = remainderCharge ? "PAID" : (amountCents >= netAmountCents ? "PAID" : "PENDING");
      onPaid(newPayment, newStatus, remainderCharge);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("paymentErrorGeneral"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="appt-payment-modal-title">
      <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
            <CreditCard className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h2 id="appt-payment-modal-title" className="font-semibold text-foreground">
              {partial ? t("paymentModalTitlePartial") : t("paymentModalTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("paymentModalTotal")} R$ {(netAmountCents / 100).toFixed(2).replace(".", ",")}
            </p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("paymentMethodLabel")}</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {buildPaymentMethods(t).map((m: any) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("paymentAmountLabel")}</label>
            <input
              type="text" inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("paymentDateLabel")}</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {partial && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t("paymentDueDateLabel")}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
          >
            <Check className="h-4 w-4" />
            {saving ? t("common.loading") : t("confirmPartialPayment")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppointmentDetailClient({
  appointment: initialAppt,
  role,
  canViewSessions = true,
  recurrenceTotal,
  recurrenceFutureCount,
}: Props) {
  const router = useRouter();
  const t = useTranslations("appointments");
  const tCharges = useTranslations("charges");
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
    label: string;
    editAmount: string;
    editDiscount: string;
    editDueDate: string;
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
    const res = await fetchWithCsrf(`/api/v1/appointments/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? t("errorUpdating"));
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
      setError(e instanceof Error ? e.message : t("unknownError"));
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
      const labelKey: Record<string, string> = {
        COMPLETED: "chargePromptCompleted",
        CANCELED: "chargePromptCanceled",
        NO_SHOW: "chargePromptNoShow",
      };
      setChargePrompt({
        pendingStatus: status,
        label: t(labelKey[status] as any),
        editAmount: (effectiveFeeCents / 100).toFixed(2),
        editDiscount: "0,00",
        editDueDate: todayISO(),
      });
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
        const parsedAmount = parseFloat(chargePrompt.editAmount.replace(",", "."));
        const parsedDiscount = parseFloat((chargePrompt.editDiscount || "0").replace(",", "."));
        if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error(t("errorInvalidAmount"));
        if (isNaN(parsedDiscount) || parsedDiscount < 0) throw new Error(t("errorInvalidDiscount"));
        const amountCents = Math.round(parsedAmount * 100);
        const discountCents = Math.round(parsedDiscount * 100);
        if (discountCents > amountCents) throw new Error(t("errorDiscountExceeds"));
        const res = await fetchWithCsrf("/api/v1/charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: appt.patient.id,
            appointmentId: appt.id,
            providerUserId: appt.provider.id,
            amountCents,
            discountCents: discountCents || 0,
            dueDate: chargePrompt.editDueDate || todayISO(),
            description: chargePrompt.label,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setAppt((a) => ({
            ...a,
            charges: [...a.charges, {
              id: data.data?.id ?? crypto.randomUUID(),
              status: "PENDING",
              amountCents,
              discountCents,
              dueDate: chargePrompt.editDueDate || todayISO(),
              description: chargePrompt.label,
              payments: [],
            }],
          }));
        }
      } catch (err) {
        // Charge creation failed — show feedback so user knows to create manually
        setError(err instanceof Error ? err.message : t("errorCreatingCharge"));
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
      setError(e instanceof Error ? e.message : t("unknownError"));
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
      setError(e instanceof Error ? e.message : t("unknownError"));
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
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> {t("backButton")}
        </Button>
        <div className="flex-1" />
        <Badge className={`border text-xs font-medium ${STATUS_COLORS[appt.status]}`}>
          {t(`enums.appointmentStatus.${appt.status}`)}
        </Badge>
      </div>

      {/* ── Title block ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {appt.patient.preferredName ?? appt.patient.fullName}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5 capitalize">{dateLabel}</p>
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
          <CardTitle className="text-base">{t("cardTitle")}</CardTitle>
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Edit2 className="h-3.5 w-3.5" /> {t("editButton")}
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {!editing ? (
            // ── View mode ──────────────────────────────────────────────────
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={<Calendar className="h-4 w-4 text-primary" />} label={t("labelDate")}>
                <span className="capitalize">{dateLabel}</span>
              </InfoRow>
              <InfoRow icon={<Clock className="h-4 w-4 text-primary" />} label={t("labelTime")}>
                {timeLabel} <span className="text-muted-foreground/70">({durationMin} min)</span>
              </InfoRow>
              <InfoRow icon={<User className="h-4 w-4 text-primary" />} label={t("labelPatient")}>
                <a
                  href={`/app/patients/${appt.patient.id}`}
                  className="text-primary hover:underline font-medium"
                >
                  {appt.patient.fullName}
                </a>
                {appt.patient.email && (
                  <span className="block text-xs text-muted-foreground">{appt.patient.email}</span>
                )}
              </InfoRow>
              <InfoRow icon={<Stethoscope className="h-4 w-4 text-primary" />} label={t("labelProvider")}>
                {appt.provider.name}
              </InfoRow>
              <InfoRow icon={<div className="h-3 w-3 rounded-full" style={{ backgroundColor: appt.appointmentType.color }} />} label={t("labelType")}>
                {appt.appointmentType.name}
                <span className="ml-1.5 text-xs text-muted-foreground/70">
                  ({t(`enums.sessionType.${appt.appointmentType.sessionType}`)})
                </span>
              </InfoRow>
              {appt.location && (
                <InfoRow icon={<MapPin className="h-4 w-4 text-primary" />} label={t("labelLocation")}>
                  {appt.location}
                </InfoRow>
              )}
              {appt.videoLink && (
                <InfoRow icon={<Video className="h-4 w-4 text-primary" />} label={t("labelVideoLink")}>
                  <a
                    href={appt.videoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {t("joinRoom")} <ExternalLink className="h-3 w-3" />
                  </a>
                </InfoRow>
              )}
              {appt.recurrence && (
                <InfoRow icon={<Repeat className="h-4 w-4 text-primary" />} label={t("labelRecurrence")}>
                  {formatRRule(appt.recurrence.rrule)}
                  {recurrenceTotal > 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground/70">
                      · {recurrenceTotal} {t("detailedSessionCount")}
                    </span>
                  )}
                </InfoRow>
              )}
              {appt.adminNotes && (
                <div className="sm:col-span-2">
                  <InfoRow icon={<FileText className="h-4 w-4 text-primary" />} label={t("labelNotes")}>
                    <p className="whitespace-pre-wrap text-foreground">{appt.adminNotes}</p>
                  </InfoRow>
                </div>
              )}
            </div>
          ) : (
            // ── Edit mode ──────────────────────────────────────────────────
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("labelDate")}</Label>
                  <Input
                    type="datetime-local"
                    value={editForm.startsAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, startsAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("labelTime")}</Label>
                  <Input
                    type="datetime-local"
                    value={editForm.endsAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, endsAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelLocation")}</Label>
                <Input
                  placeholder={t("placeholderLocation")}
                  value={editForm.location}
                  onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelVideoLink")}</Label>
                <Input
                  placeholder="https://meet.jit.si/..."
                  value={editForm.videoLink}
                  onChange={(e) => setEditForm((f) => ({ ...f, videoLink: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelNotes")}</Label>
                <textarea
                  rows={3}
                  placeholder={t("placeholderNotes")}
                  value={editForm.adminNotes}
                  onChange={(e) => setEditForm((f) => ({ ...f, adminNotes: e.target.value }))}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="gap-1.5 bg-primary hover:bg-primary"
                >
                  <Check className="h-4 w-4" />
                  {saving ? t("loadingMessage") : t("actionSaveEdit")}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                  <X className="h-4 w-4 mr-1" /> {t("actionCancel")}
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
            <CardTitle className="text-base">{t("actionsTitle")}</CardTitle>
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
                <Check className="h-3.5 w-3.5" /> {t("confirmButton")}
              </Button>
            )}
            {canComplete && (
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => handleStatusChange("COMPLETED")}
                className="gap-1.5 border-border text-foreground hover:bg-muted"
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
                className="gap-1.5 border-amber-400 text-amber-800 hover:bg-amber-100 bg-card"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reagendar (voltar para agendada)
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => handleStatusChange("CONFIRMED")}
                className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50 bg-card"
              >
                <Check className="h-3.5 w-3.5" /> Marcar como confirmada
              </Button>
              {appt.status === "NO_SHOW" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => handleStatusChange("COMPLETED")}
                  className="gap-1.5 border-border text-foreground hover:bg-muted bg-card"
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
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Corrigir status</CardTitle>
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
              className="gap-1.5 border-border text-muted-foreground hover:bg-muted"
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
              className={!appt.clinicalSession ? "bg-primary hover:bg-primary" : ""}
            >
              {appt.clinicalSession ? "Ver anotação" : "Criar anotação clínica"}
            </Button>
          </CardHeader>
          {!appt.clinicalSession && (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Nenhuma anotação clínica registrada para esta consulta.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Financial ── */}
      <ChargesCard
        charges={appt.charges}
        totalCharged={totalCharged}
        totalPaid={totalPaid}
        patientId={appt.patient.id}
        providerId={appt.provider.id}
        appointmentId={appt.id}
        onChargesChange={(charges) => setAppt((a) => ({ ...a, charges }))}
        t={t}
      />

      {/* ── Charge prompt modal ── */}
      {chargePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="charge-prompt-title">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                <CreditCard className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 id="charge-prompt-title" className="font-semibold text-foreground">Cobrar esta sessão?</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {chargePrompt.label} — {appt.patient.preferredName ?? appt.patient.fullName}
                </p>
              </div>
            </div>

            {/* Editable charge fields */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Valor (R$)</label>
                  <input
                    type="text" inputMode="decimal"
                    value={chargePrompt.editAmount}
                    onChange={(e) => setChargePrompt((p) => p ? { ...p, editAmount: e.target.value } : p)}
                    className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Desconto (R$)</label>
                  <input
                    type="text" inputMode="decimal"
                    value={chargePrompt.editDiscount}
                    onChange={(e) => setChargePrompt((p) => p ? { ...p, editDiscount: e.target.value } : p)}
                    className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Vencimento</label>
                <input
                  type="date"
                  value={chargePrompt.editDueDate}
                  onChange={(e) => setChargePrompt((p) => p ? { ...p, editDueDate: e.target.value } : p)}
                  className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {(() => {
                const amt = parseFloat(chargePrompt.editAmount.replace(",", ".")) || 0;
                const disc = parseFloat(chargePrompt.editDiscount.replace(",", ".")) || 0;
                const net = Math.max(0, amt - disc);
                return (
                  <div className="rounded-lg bg-muted/50 border px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Valor líquido</span>
                    <span className="font-bold text-foreground">
                      R$ {net.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                );
              })()}
            </div>

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
                {creatingCharge ? "Criando..." : "Criar cobrança"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel dialog (modal-style) ── */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 id="cancel-dialog-title" className="font-semibold text-foreground">Cancelar consulta</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {format(parseISO(appt.startsAt), "d 'de' MMMM · HH:mm", { locale: ptBR })} —{" "}
                  {appt.patient.preferredName ?? appt.patient.fullName}
                </p>
              </div>
            </div>

            {/* Show scope selector only for recurring appointments with future sessions */}
            {appt.recurrenceId && recurrenceFutureCount > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">O que deseja cancelar?</p>
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                  <input
                    type="radio"
                    name="cancelScope"
                    value="THIS"
                    checked={cancelScope === "THIS"}
                    onChange={() => setCancelScope("THIS")}
                    className="mt-0.5 accent-brand-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Somente esta consulta</p>
                    <p className="text-xs text-muted-foreground">
                      As {recurrenceFutureCount} próximas sessões permanecem agendadas.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted transition-colors has-[:checked]:border-red-400 has-[:checked]:bg-red-50">
                  <input
                    type="radio"
                    name="cancelScope"
                    value="THIS_AND_FUTURE"
                    checked={cancelScope === "THIS_AND_FUTURE"}
                    onChange={() => setCancelScope("THIS_AND_FUTURE")}
                    className="mt-0.5 accent-red-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Esta e todas as futuras</p>
                    <p className="text-xs text-muted-foreground">
                      Esta consulta + {recurrenceFutureCount} sessão(ões) seguintes serão canceladas.
                    </p>
                  </div>
                </label>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
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
  patientId,
  providerId,
  appointmentId,
  onChargesChange,
  t,
}: {
  charges: Charge[];
  totalCharged: number;
  totalPaid: number;
  patientId: string;
  providerId: string;
  appointmentId: string;
  onChargesChange: (charges: Charge[]) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [charges, setCharges] = useState(initialCharges);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ amountCents: "", discountCents: "", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Payment modal
  const [payModal, setPayModal] = useState<{ chargeId: string; netAmountCents: number; partial: boolean; chargeDueDate?: string | null } | null>(null);

  // New charge form
  const [showNewCharge, setShowNewCharge] = useState(false);
  const [newChargeForm, setNewChargeForm] = useState({ amountCents: "", discountCents: "0,00", dueDate: todayISO(), description: "" });
  const [creatingNew, setCreatingNew] = useState(false);

  function startEdit(charge: Charge) {
    setEditingId(charge.id);
    setEditForm({
      amountCents: (charge.amountCents / 100).toFixed(2),
      discountCents: ((charge.discountCents ?? 0) / 100).toFixed(2),
      dueDate: charge.dueDate ? new Date(charge.dueDate).toISOString().slice(0, 10) : todayISO(),
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const amount = Math.round(parseFloat(editForm.amountCents.replace(",", ".")) * 100);
      const discount = Math.round(parseFloat((editForm.discountCents || "0").replace(",", ".")) * 100);
      const res = await fetchWithCsrf(`/api/v1/charges/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: amount, discountCents: discount, dueDate: editForm.dueDate }),
      });
      if (!res.ok) throw new Error();
      const updated = charges.map((c) =>
        c.id === id ? { ...c, amountCents: amount, discountCents: discount, dueDate: editForm.dueDate } : c
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
      const res = await fetchWithCsrf(`/api/v1/charges/${id}`, { method: "DELETE" });
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

  async function createNewCharge() {
    setCreatingNew(true);
    try {
      const amount = Math.round(parseFloat(newChargeForm.amountCents.replace(",", ".")) * 100);
      const discount = Math.round(parseFloat((newChargeForm.discountCents || "0").replace(",", ".")) * 100);
      const res = await fetchWithCsrf("/api/v1/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          appointmentId,
          providerUserId: providerId,
          amountCents: amount,
          discountCents: discount,
          dueDate: newChargeForm.dueDate,
          description: newChargeForm.description || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newCharge: Charge = {
        id: data.data?.id ?? crypto.randomUUID(),
        status: "PENDING",
        amountCents: amount,
        discountCents: discount,
        dueDate: newChargeForm.dueDate,
        description: newChargeForm.description || null,
        payments: [],
      };
      const updated = [...charges, newCharge];
      setCharges(updated);
      onChargesChange(updated);
      setShowNewCharge(false);
      setNewChargeForm({ amountCents: "", discountCents: "0,00", dueDate: todayISO(), description: "" });
    } catch {
      // silently fail
    } finally {
      setCreatingNew(false);
    }
  }

  function handlePaid(chargeId: string, payment: Payment, newStatus: string, remainderCharge?: Charge) {
    const updated = charges.map((c) =>
      c.id === chargeId
        ? { ...c, status: newStatus, payments: [...c.payments, payment] }
        : c
    );
    const withRemainder = remainderCharge ? [...updated, remainderCharge] : updated;
    setCharges(withRemainder);
    onChargesChange(withRemainder);
    setPayModal(null);
  }

  // Charge status labels pulled from i18n
  const CHARGE_STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendente", PAID: "Pago", OVERDUE: "Vencido",
    PARTIAL: "Parcial", VOID: "Cancelado",
  };

  const CHARGE_STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
    PAID: "bg-green-50 text-green-700 border-green-200",
    OVERDUE: "bg-red-50 text-red-700 border-red-200",
    PARTIAL: "bg-blue-50 text-blue-700 border-blue-200",
    VOID: "bg-muted/50 text-muted-foreground border-border",
  };

  const computedTotal = charges.reduce((s, c) => s + c.amountCents - (c.discountCents ?? 0), 0);
  const computedPaid  = charges.flatMap((c) => c.payments).reduce((s, p) => s + p.amountCents, 0);

  return (
    <>
      {payModal && (
        <PaymentModal
          chargeId={payModal.chargeId}
          netAmountCents={payModal.netAmountCents}
          partial={payModal.partial}
          chargeDueDate={payModal.chargeDueDate}
          patientId={patientId}
          providerId={providerId}
          appointmentId={appointmentId}
          onClose={() => setPayModal(null)}
          onPaid={(payment, newStatus, remainderCharge) =>
            handlePaid(payModal.chargeId, payment, newStatus, remainderCharge)
          }
          t={t}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{t("financialSection")}</CardTitle>
          <div className="flex items-center gap-2">
            {computedTotal > 0 && (
              <span className={`text-sm font-medium ${computedPaid >= computedTotal ? "text-green-700" : "text-orange-700"}`}>
                {computedPaid >= computedTotal
                  ? t("chargeStatusPaid")
                  : `${t("chargeStatusPending")} · R$ ${((computedTotal - computedPaid) / 100).toFixed(2).replace(".", ",")}`}
              </span>
            )}
            <button
              onClick={() => setShowNewCharge(true)}
              title="Adicionar cobrança"
              className="p-1.5 rounded text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <DollarSign className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {charges.length === 0 && !showNewCharge && (
            <p className="text-sm text-muted-foreground/70 text-center py-2">Nenhuma cobrança registrada.</p>
          )}

          {charges.map((charge) => {
            const net = charge.amountCents - (charge.discountCents ?? 0);
            const paidSoFar = charge.payments.reduce((s, p) => s + p.amountCents, 0);
            const isPaid = charge.status === "PAID";
            const isPartiallyPaid = !isPaid && charge.payments.length > 0 && charge.status !== "VOID";
            const canModify = charge.payments.length === 0;
            const canPay = !isPaid && !isPartiallyPaid && charge.status !== "VOID";

            return (
              <div key={charge.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                {editingId === charge.id ? (
                  // ── Edit mode ──
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Valor (R$)</label>
                        <input
                          type="text" inputMode="decimal"
                          value={editForm.amountCents}
                          onChange={(e) => setEditForm((f) => ({ ...f, amountCents: e.target.value }))}
                          className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Desconto (R$)</label>
                        <input
                          type="text" inputMode="decimal"
                          value={editForm.discountCents}
                          onChange={(e) => setEditForm((f) => ({ ...f, discountCents: e.target.value }))}
                          className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Vencimento</label>
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                        className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    {parseFloat(editForm.discountCents.replace(",", ".")) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Valor final: R$ {Math.max(0,
                          parseFloat(editForm.amountCents.replace(",", ".")) -
                          parseFloat(editForm.discountCents.replace(",", "."))
                        ).toFixed(2).replace(".", ",")}
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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground/70" />
                        <span className="font-medium text-foreground">
                          R$ {(net / 100).toFixed(2).replace(".", ",")}
                        </span>
                        {(charge.discountCents ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground/70 line-through">
                            R$ {(charge.amountCents / 100).toFixed(2).replace(".", ",")}
                          </span>
                        )}
                        {charge.dueDate && (
                          <span className="text-xs text-muted-foreground/70">
                            · venc. {new Date(charge.dueDate).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge className={`text-xs border ${CHARGE_STATUS_COLORS[charge.status] ?? "bg-muted/50 text-muted-foreground"}`}>
                          {CHARGE_STATUS_LABELS[charge.status] ?? charge.status}
                        </Badge>
                        {canModify && (
                          <>
                            <button
                              onClick={() => startEdit(charge)}
                              title="Editar cobrança"
                              className="p-1 rounded text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteCharge(charge.id)}
                              disabled={deletingId === charge.id}
                              title="Excluir cobrança"
                              className="p-1 rounded text-muted-foreground/70 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Payment actions */}
                    {canPay && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setPayModal({ chargeId: charge.id, netAmountCents: net - paidSoFar, partial: false, chargeDueDate: charge.dueDate })}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" /> Marcar como pago
                        </button>
                        <button
                          onClick={() => setPayModal({ chargeId: charge.id, netAmountCents: net - paidSoFar, partial: true, chargeDueDate: charge.dueDate })}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          <Split className="h-3.5 w-3.5" /> Pagamento parcial
                        </button>
                      </div>
                    )}

                    {/* Partially paid badge */}
                    {isPartiallyPaid && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200">
                          <Split className="h-3.5 w-3.5" /> {chargeStatusLabel("PARTIALLY_PAID")} · R$ {(paidSoFar / 100).toFixed(2).replace(".", ",")} de R$ {(net / 100).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    )}

                    {/* Payments list */}
                    {charge.payments.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-border/40">
                        {charge.payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {buildPaymentMethods(t).find((m: any) => m.value === p.method)?.label ?? p.method} ·{" "}
                              {new Date(p.paidAt).toLocaleDateString("pt-BR")}
                            </span>
                            <span className="font-medium text-green-700">
                              + R$ {(p.amountCents / 100).toFixed(2).replace(".", ",")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* New charge inline form */}
          {showNewCharge && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Nova cobrança</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Valor (R$)</label>
                  <input
                    type="text" inputMode="decimal"
                    placeholder="0,00"
                    value={newChargeForm.amountCents}
                    onChange={(e) => setNewChargeForm((f) => ({ ...f, amountCents: e.target.value }))}
                    className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Desconto (R$)</label>
                  <input
                    type="text" inputMode="decimal"
                    value={newChargeForm.discountCents}
                    onChange={(e) => setNewChargeForm((f) => ({ ...f, discountCents: e.target.value }))}
                    className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Vencimento</label>
                <input
                  type="date"
                  value={newChargeForm.dueDate}
                  onChange={(e) => setNewChargeForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Descrição (opcional)</label>
                <input
                  type="text"
                  value={newChargeForm.description}
                  onChange={(e) => setNewChargeForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowNewCharge(false)} disabled={creatingNew}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={createNewCharge} disabled={creatingNew || !newChargeForm.amountCents}>
                  {creatingNew ? "Salvando..." : "Adicionar"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
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
        <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wide">{label}</p>
        <div className="text-sm text-foreground mt-0.5">{children}</div>
      </div>
    </div>
  );
}
