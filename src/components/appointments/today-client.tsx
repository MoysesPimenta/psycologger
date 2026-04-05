"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/csrf-client";
import Link from "next/link";
import {
  Play, CheckCircle2, XCircle, UserX, DollarSign,
  CreditCard, ChevronRight, Clock, MapPin, Video, Check, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime, appointmentStatusLabel, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Patient {
  id: string;
  fullName: string;
  preferredName: string | null;
  phone: string | null;
  defaultFeeOverrideCents?: number | null;
  defaultAppointmentType?: { defaultPriceCents: number } | null;
}
interface AppointmentType { id: string; name: string; color: string; defaultPriceCents: number; }
interface ClinicalSession { id: string; }
interface Charge { id: string; status: string; amountCents: number; }
interface Provider { id: string; name: string | null; }

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  location: string | null;
  videoLink: string | null;
  patient: Patient;
  provider: Provider;
  appointmentType: AppointmentType;
  clinicalSession: ClinicalSession | null;
  charges: Charge[];
}

interface Props {
  appointments: Appointment[];
  userId: string;
  role: string;
}

const PAYMENT_METHODS = [
  { value: "PIX", label: "PIX" },
  { value: "CASH", label: "Dinheiro" },
  { value: "CARD", label: "Cartão" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "INSURANCE", label: "Plano de saúde" },
  { value: "OTHER", label: "Outro" },
];

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

const statusColors: Record<string, BadgeVariant> = {
  SCHEDULED: "info",
  CONFIRMED: "success",
  COMPLETED: "success",
  CANCELED: "secondary",
  NO_SHOW: "warning",
};

// ─── Charge prompt for "today" view ──────────────────────────────────────────

function TodayChargePrompt({
  apptId,
  patient,
  provider,
  appointmentType,
  onDone,
  onSkip,
}: {
  apptId: string;
  patient: Patient;
  provider: Provider;
  appointmentType: AppointmentType;
  onDone: (chargeId: string) => void;
  onSkip: () => void;
}) {
  // Effective fee: patient override > patient default type > appointment type default
  const effectiveFee =
    patient.defaultFeeOverrideCents != null
      ? patient.defaultFeeOverrideCents
      : patient.defaultAppointmentType?.defaultPriceCents != null
        ? patient.defaultAppointmentType.defaultPriceCents
        : appointmentType.defaultPriceCents > 0
          ? appointmentType.defaultPriceCents
          : 0;

  const [amount, setAmount] = useState((effectiveFee / 100).toFixed(2));
  const [discount, setDiscount] = useState("0,00");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCharge() {
    setSaving(true);
    setError("");
    try {
      const amountCents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
      const discountCents = Math.round(parseFloat((discount || "0").replace(",", ".")) * 100);
      const res = await fetchWithCsrf("/api/v1/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          appointmentId: apptId,
          providerUserId: provider.id,
          amountCents,
          discountCents,
          dueDate,
          description: "Consulta",
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onDone(data.data?.id ?? "");
    } catch {
      setError("Erro ao criar cobrança.");
    } finally {
      setSaving(false);
    }
  }

  const net = Math.max(0,
    (parseFloat(amount.replace(",", ".")) || 0) -
    (parseFloat(discount.replace(",", ".")) || 0)
  );

  return (
    <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium text-green-800">Cobrar esta sessão?</span>
      </div>
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Valor (R$)</label>
          <input
            type="text" inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Desconto (R$)</label>
          <input
            type="text" inputMode="decimal"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Vencimento</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
      </div>
      {net > 0 && (
        <p className="text-xs text-green-700 font-medium">
          Valor líquido: R$ {net.toFixed(2).replace(".", ",")}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleCharge}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? "Criando..." : "Criar cobrança"}
        </button>
        <button
          onClick={onSkip}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-white border hover:bg-gray-50 transition-colors"
        >
          Não cobrar agora
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TodayClient({ appointments, userId, role }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [localAppts, setLocalAppts] = useState(appointments);
  // Track which appt is showing the charge prompt
  const [chargePromptId, setChargePromptId] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    setLoadingId(id);
    try {
      const res = await fetchWithCsrf(`/api/v1/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setLocalAppts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
      // Show charge prompt after completing / no-show / cancel if no charge yet
      const appt = localAppts.find((a) => a.id === id);
      if (
        ["COMPLETED", "NO_SHOW", "CANCELED"].includes(status) &&
        appt &&
        appt.charges.length === 0
      ) {
        const effectiveFee =
          appt.patient.defaultFeeOverrideCents != null
            ? appt.patient.defaultFeeOverrideCents
            : appt.patient.defaultAppointmentType?.defaultPriceCents != null
              ? appt.patient.defaultAppointmentType.defaultPriceCents
              : appt.appointmentType.defaultPriceCents;
        if (effectiveFee > 0) {
          setChargePromptId(id);
        }
      }
      toast({ title: "Status atualizado", variant: "success" });
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  }

  function handleChargeDone(apptId: string, chargeId: string) {
    setLocalAppts((prev) =>
      prev.map((a) =>
        a.id === apptId
          ? { ...a, charges: [...a.charges, { id: chargeId, status: "PENDING", amountCents: 0 }] }
          : a
      )
    );
    setChargePromptId(null);
    toast({ title: "Cobrança criada!", variant: "success" });
  }

  if (localAppts.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
        <h2 className="font-semibold text-gray-900 text-lg">Nenhuma consulta hoje</h2>
        <p className="text-gray-500 mt-1 mb-6">Aproveite para organizar seus registros.</p>
        <Button asChild variant="outline">
          <Link href="/app/calendar">Ver agenda</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {localAppts.map((appt) => {
        const displayName = appt.patient.preferredName ?? appt.patient.fullName;
        const isPending = ["SCHEDULED", "CONFIRMED"].includes(appt.status);
        const isCompleted = appt.status === "COMPLETED";
        const hasSession = !!appt.clinicalSession;
        const hasPaidCharge = appt.charges.some((c) => c.status === "PAID");
        const hasCharge = appt.charges.length > 0;
        const isLoading = loadingId === appt.id;
        const showChargePrompt = chargePromptId === appt.id;

        return (
          <div
            key={appt.id}
            className={cn(
              "bg-white rounded-xl border p-4 transition-all",
              isCompleted && "opacity-75",
            )}
          >
            <div className="flex items-start gap-4">
              {/* Time + color bar */}
              <div className="flex flex-col items-center">
                <div
                  className="w-1 h-full rounded-full min-h-[3rem]"
                  style={{ backgroundColor: appt.appointmentType.color }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{displayName}</span>
                      <Badge variant={statusColors[appt.status] ?? "secondary"} className="text-xs">
                        {appointmentStatusLabel(appt.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(appt.startsAt)} – {formatTime(appt.endsAt)}
                      </span>
                      <span>{appt.appointmentType.name}</span>
                      {appt.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {appt.location}
                        </span>
                      )}
                      {appt.videoLink && (
                        <a href={appt.videoLink} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-brand-600 hover:underline">
                          <Video className="h-3 w-3" /> Online
                        </a>
                      )}
                    </div>
                    {role !== "PSYCHOLOGIST" && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Profissional: {appt.provider.name}
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/app/appointments/${appt.id}`}
                    className="text-gray-400 hover:text-brand-600 flex-shrink-0"
                    title="Ver / editar consulta"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                </div>

                {/* Quick actions */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {isPending && (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => router.push(`/app/sessions/new?appointmentId=${appt.id}&patientId=${appt.patient.id}`)}
                        disabled={isLoading}
                      >
                        <Play className="h-3 w-3" />
                        Iniciar sessão
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(appt.id, "CONFIRMED")}
                        disabled={isLoading || appt.status === "CONFIRMED"}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(appt.id, "COMPLETED")}
                        disabled={isLoading}
                        className="border-gray-300 text-gray-700"
                      >
                        <Check className="h-3 w-3" />
                        Realizada
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(appt.id, "NO_SHOW")}
                        disabled={isLoading}
                      >
                        <UserX className="h-3 w-3" />
                        Faltou
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(appt.id, "CANCELED")}
                        disabled={isLoading}
                      >
                        <XCircle className="h-3 w-3" />
                        Cancelar
                      </Button>
                    </>
                  )}

                  {isCompleted && !hasSession && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/app/sessions/new?appointmentId=${appt.id}&patientId=${appt.patient.id}`)}
                    >
                      <Play className="h-3 w-3" />
                      Registrar nota
                    </Button>
                  )}

                  {hasCharge && !hasPaidCharge && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => router.push(`/app/patients/${appt.patient.id}?tab=financial`)}
                    >
                      <CreditCard className="h-3 w-3" />
                      Ver cobrança
                    </Button>
                  )}

                  {hasPaidCharge && (
                    <Badge variant="success" className="text-xs px-3 py-1">
                      ✓ Pago
                    </Badge>
                  )}

                  {hasSession && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/app/sessions/${appt.clinicalSession!.id}`}>
                        Ver nota
                      </Link>
                    </Button>
                  )}
                </div>

                {/* Inline charge prompt */}
                {showChargePrompt && (
                  <TodayChargePrompt
                    apptId={appt.id}
                    patient={appt.patient}
                    provider={appt.provider}
                    appointmentType={appt.appointmentType}
                    onDone={(chargeId) => handleChargeDone(appt.id, chargeId)}
                    onSkip={() => setChargePromptId(null)}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
