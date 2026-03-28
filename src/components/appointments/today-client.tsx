"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Play, CheckCircle2, XCircle, UserX, DollarSign,
  CreditCard, ChevronRight, Clock, MapPin, Video
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime, appointmentStatusLabel, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Patient { id: string; fullName: string; preferredName: string | null; phone: string | null; }
interface AppointmentType { id: string; name: string; color: string; }
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

const statusColors: Record<string, string> = {
  SCHEDULED: "info",
  CONFIRMED: "success",
  COMPLETED: "success",
  CANCELED: "secondary",
  NO_SHOW: "warning",
};

export function TodayClient({ appointments, userId, role }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [localAppts, setLocalAppts] = useState(appointments);

  async function updateStatus(id: string, status: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/v1/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setLocalAppts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
      toast({ title: "Status atualizado", variant: "success" });
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
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
                      <Badge variant={statusColors[appt.status] as never ?? "secondary"} className="text-xs">
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
                    href={`/app/patients/${appt.patient.id}`}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
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

                  {isCompleted && hasSession && !hasCharge && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/app/financial/charges/new?appointmentId=${appt.id}&patientId=${appt.patient.id}`)}
                    >
                      <DollarSign className="h-3 w-3" />
                      Criar cobrança
                    </Button>
                  )}

                  {hasCharge && !hasPaidCharge && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => router.push(`/app/financial/charges?patientId=${appt.patient.id}`)}
                    >
                      <CreditCard className="h-3 w-3" />
                      Marcar pago
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
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
