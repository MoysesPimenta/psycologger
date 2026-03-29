"use client";

import { useState } from "react";
import Link from "next/link";
import {
  User, Calendar, FileText, DollarSign, Phone, Mail,
  Tag, Edit, Plus, Lock, Clock, ChevronLeft, Trash2,
  ToggleLeft, ToggleRight, RotateCcw, AlertTriangle, Check, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatCurrency, chargeStatusLabel, initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AppointmentTypeSummary {
  id: string;
  name: string;
  defaultPriceCents: number;
}

type Tab = "timeline" | "sessions" | "files" | "financial" | "profile";

function daysUntilHardDelete(deletedAt: string): number {
  const hardDeleteAt = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((hardDeleteAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

/* ─── Reusable confirm modal ─────────────────────────────────────────────── */
function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirmar",
  confirmVariant = "destructive",
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: "destructive" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant={confirmVariant}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function PatientDetailClient({
  patient: initialPatient,
  canViewClinical,
  role,
  userId,
  appointmentTypes = [],
}: {
  patient: Record<string, any>;
  canViewClinical: boolean;
  role: string;
  userId: string;
  appointmentTypes?: AppointmentTypeSummary[];
}) {
  const [tab, setTab] = useState<Tab>("timeline");
  const [patient, setPatient] = useState(initialPatient);
  const [togglingActive, setTogglingActive] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "timeline", label: "Timeline", icon: Clock },
    { id: "sessions", label: "Sessões", icon: FileText },
    { id: "files", label: "Arquivos", icon: FileText },
    { id: "financial", label: "Financeiro", icon: DollarSign },
    { id: "profile", label: "Perfil", icon: User },
  ];

  const displayName = patient.preferredName ?? patient.fullName;

  async function handleToggleActive() {
    if (patient.isActive) {
      // Confirm before deactivating
      setShowDeactivateModal(true);
      return;
    }
    await doToggle(true);
  }

  async function doToggle(newValue: boolean) {
    setTogglingActive(true);
    try {
      const res = await fetch(`/api/v1/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newValue }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar status");
      setPatient((p: Record<string, any>) => ({ ...p, isActive: newValue }));
    } catch {
      // silently fail — user can retry
    } finally {
      setTogglingActive(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Deactivate confirmation */}
      {showDeactivateModal && (
        <ConfirmModal
          title="Inativar paciente?"
          description="O paciente será marcado como inativo e não aparecerá nas listagens padrão. Você pode reativá-lo a qualquer momento."
          confirmLabel="Inativar"
          confirmVariant="destructive"
          onConfirm={async () => {
            setShowDeactivateModal(false);
            await doToggle(false);
          }}
          onCancel={() => setShowDeactivateModal(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/app/patients">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="w-12 h-12 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-lg font-bold">
            {initials(patient.fullName)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
              {!patient.isActive && (
                <Badge variant="secondary" className="text-xs">Inativo</Badge>
              )}
            </div>
            {patient.preferredName && (
              <p className="text-sm text-gray-500">{patient.fullName}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* Active / Inactive toggle */}
          <button
            onClick={handleToggleActive}
            disabled={togglingActive}
            title={patient.isActive ? "Clique para inativar" : "Clique para reativar"}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              patient.isActive
                ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100",
              togglingActive && "opacity-50 cursor-not-allowed"
            )}
          >
            {patient.isActive
              ? <><ToggleRight className="h-4 w-4" /> Ativo</>
              : <><ToggleLeft className="h-4 w-4" /> Inativo</>
            }
          </button>

          <Button asChild variant="outline" size="sm">
            <Link href={`/app/sessions/new?patientId=${patient.id}`}>
              <Plus className="h-4 w-4" />
              Nova sessão
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/app/patients/${patient.id}/edit`}>
              <Edit className="h-4 w-4" />
              Editar
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick info */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        {patient.email && (
          <span className="flex items-center gap-1">
            <Mail className="h-4 w-4 text-gray-400" /> {patient.email}
          </span>
        )}
        {patient.phone && (
          <span className="flex items-center gap-1">
            <Phone className="h-4 w-4 text-gray-400" /> {patient.phone}
          </span>
        )}
        {patient.dob && (
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4 text-gray-400" />
            {formatDate(patient.dob)}
          </span>
        )}
        {patient.tags?.map((tag: string) => (
          <span key={tag} className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full text-xs">
            <Tag className="h-3 w-3" /> {tag}
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-1 overflow-x-auto scrollbar-thin">
          {tabs.map((t) => {
            if ((t.id === "sessions") && !canViewClinical) return null;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  tab === t.id
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {tab === "timeline" && (
          <TimelineTab appointments={patient.appointments} canViewClinical={canViewClinical} />
        )}
        {tab === "sessions" && canViewClinical && (
          <SessionsTab sessions={patient.clinicalSessions} patientId={patient.id} />
        )}
        {tab === "sessions" && !canViewClinical && (
          <div className="text-center py-12 text-gray-500">
            <Lock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p>Você não tem permissão para visualizar notas clínicas.</p>
          </div>
        )}
        {tab === "files" && (
          <FilesTab files={patient.files} patientId={patient.id} canViewClinical={canViewClinical} />
        )}
        {tab === "financial" && (
          <FinancialTab charges={patient.charges} patientId={patient.id} />
        )}
        {tab === "profile" && (
          <ProfileTab patient={patient} appointmentTypes={appointmentTypes} onPatientUpdate={(updates) => setPatient((p: any) => ({ ...p, ...updates }))} />
        )}
      </div>
    </div>
  );
}

/* ─── Timeline tab ───────────────────────────────────────────────────────── */
function TimelineTab({ appointments, canViewClinical }: { appointments: any[]; canViewClinical: boolean }) {
  if (!appointments.length) {
    return <p className="text-gray-500 text-center py-8">Nenhuma consulta agendada.</p>;
  }
  return (
    <div className="space-y-3">
      {appointments.map((appt: any) => (
        <div key={appt.id} className="flex gap-4 bg-white rounded-xl border p-4">
          <div className="w-1 rounded-full" style={{ backgroundColor: appt.appointmentType.color }} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{formatDateTime(appt.startsAt)}</span>
              <Badge variant="secondary" className="text-xs">{appt.status}</Badge>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{appt.appointmentType.name} · {appt.provider.name}</p>
            {appt.clinicalSession && canViewClinical && (
              <Button variant="ghost" size="sm" asChild className="mt-1 h-7 text-xs">
                <Link href={`/app/sessions/${appt.clinicalSession.id}`}>Ver nota clínica</Link>
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Sessions tab ───────────────────────────────────────────────────────── */
function SessionsTab({ sessions: initialSessions, patientId }: { sessions: any[]; patientId: string }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const active = sessions.filter((s: any) => !s.deletedAt);
  const deleted = sessions.filter((s: any) => s.deletedAt);

  async function handleDeleteSession(id: string) {
    setActioningId(id);
    try {
      const res = await fetch(`/api/v1/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSessions((prev: any[]) => prev.map((s) => s.id === id ? { ...s, deletedAt: new Date().toISOString() } : s));
    } catch {
      // silently fail
    } finally {
      setActioningId(null);
      setConfirmDelete(null);
    }
  }

  async function handleRestoreSession(id: string) {
    setActioningId(id);
    try {
      const res = await fetch(`/api/v1/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) throw new Error();
      setSessions((prev: any[]) => prev.map((s) => s.id === id ? { ...s, deletedAt: null } : s));
    } catch {
      // silently fail
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="space-y-3">
      {confirmDelete && (
        <ConfirmModal
          title="Excluir sessão clínica?"
          description="A sessão será removida imediatamente e excluída permanentemente após 30 dias. Esta ação não pode ser desfeita."
          confirmLabel="Excluir sessão"
          confirmVariant="destructive"
          onConfirm={() => handleDeleteSession(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="flex justify-end">
        <Button size="sm" asChild>
          <Link href={`/app/sessions/new?patientId=${patientId}`}>
            <Plus className="h-3 w-3" /> Nova sessão
          </Link>
        </Button>
      </div>

      {active.length === 0 && deleted.length === 0 && (
        <p className="text-gray-500 text-center py-8">Nenhuma sessão registrada.</p>
      )}

      {active.map((s: any) => (
        <div key={s.id} className="flex items-center gap-4 bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
          <Link href={`/app/sessions/${s.id}`} className="flex items-center gap-4 flex-1 min-w-0">
            <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">{formatDate(s.sessionDate)}</p>
              <p className="text-sm text-gray-500">{s.templateKey} · {s.provider.name}</p>
            </div>
          </Link>
          <button
            onClick={() => setConfirmDelete(s.id)}
            disabled={actioningId === s.id}
            title="Excluir sessão"
            className={cn(
              "p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors",
              actioningId === s.id && "opacity-50 cursor-not-allowed"
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {deleted.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Aguardando exclusão permanente</p>
          {deleted.map((s: any) => {
            const days = daysUntilHardDelete(s.deletedAt);
            return (
              <div key={s.id} className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-4 opacity-75">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-500 line-through text-sm">{formatDate(s.sessionDate)}</p>
                  <p className="text-xs text-red-500 mt-0.5">
                    Excluído permanentemente em {days} dia{days !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleRestoreSession(s.id)}
                  disabled={actioningId === s.id}
                  title="Cancelar exclusão"
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-600 bg-white border border-brand-200 hover:bg-brand-50 transition-colors",
                    actioningId === s.id && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Cancelar exclusão
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Files tab ──────────────────────────────────────────────────────────── */
function FilesTab({ files: initialFiles, patientId, canViewClinical }: { files: any[]; patientId: string; canViewClinical: boolean }) {
  const [files, setFiles] = useState(
    initialFiles.filter((f: any) => !f.isClinical || canViewClinical)
  );
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const active = files.filter((f: any) => !f.deletedAt);
  const deleted = files.filter((f: any) => f.deletedAt);

  async function handleDeleteFile(id: string) {
    setActioningId(id);
    try {
      const res = await fetch(`/api/v1/patients/${patientId}/files/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setFiles((prev: any[]) => prev.map((f) => f.id === id ? { ...f, deletedAt: new Date().toISOString() } : f));
    } catch {
      // silently fail
    } finally {
      setActioningId(null);
      setConfirmDelete(null);
    }
  }

  async function handleRestoreFile(id: string) {
    setActioningId(id);
    try {
      const res = await fetch(`/api/v1/patients/${patientId}/files/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      setFiles((prev: any[]) => prev.map((f) => f.id === id ? { ...f, deletedAt: null } : f));
    } catch {
      // silently fail
    } finally {
      setActioningId(null);
    }
  }

  const confirmFile = files.find((f: any) => f.id === confirmDelete);

  return (
    <div className="space-y-3">
      {confirmDelete && confirmFile && (
        <ConfirmModal
          title="Excluir arquivo?"
          description={`"${confirmFile.fileName}" será removido imediatamente e excluído permanentemente após 30 dias.`}
          confirmLabel="Excluir arquivo"
          confirmVariant="destructive"
          onConfirm={() => handleDeleteFile(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {active.length === 0 && deleted.length === 0 && (
        <p className="text-gray-500 text-center py-8">Nenhum arquivo anexado.</p>
      )}

      {active.map((f: any) => (
        <div key={f.id} className="flex items-center gap-3 bg-white rounded-xl border p-3">
          <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{f.fileName}</p>
            <p className="text-xs text-gray-500">{formatDateTime(f.createdAt)} · {(f.sizeBytes / 1024).toFixed(1)} KB</p>
          </div>
          <Button size="sm" variant="ghost" className="flex-shrink-0">Download</Button>
          <button
            onClick={() => setConfirmDelete(f.id)}
            disabled={actioningId === f.id}
            title="Excluir arquivo"
            className={cn(
              "p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors",
              actioningId === f.id && "opacity-50 cursor-not-allowed"
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {deleted.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Aguardando exclusão permanente</p>
          {deleted.map((f: any) => {
            const days = daysUntilHardDelete(f.deletedAt);
            return (
              <div key={f.id} className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-3 opacity-75">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-400 line-through truncate">{f.fileName}</p>
                  <p className="text-xs text-red-500 mt-0.5">
                    Excluído permanentemente em {days} dia{days !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleRestoreFile(f.id)}
                  disabled={actioningId === f.id}
                  title="Cancelar exclusão"
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-600 bg-white border border-brand-200 hover:bg-brand-50 transition-colors flex-shrink-0",
                    actioningId === f.id && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Cancelar exclusão
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Payment modal (reusable for financial tab) ──────────────────────────── */
const PAYMENT_METHODS_FIN = [
  { value: "PIX", label: "PIX" },
  { value: "CASH", label: "Dinheiro" },
  { value: "CARD", label: "Cartão" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "INSURANCE", label: "Plano de saúde" },
  { value: "OTHER", label: "Outro" },
];

function FinancialPaymentModal({
  charge,
  patientId,
  partial,
  onClose,
  onPaid,
}: {
  charge: any;
  patientId: string;
  partial: boolean;
  onClose: () => void;
  onPaid: (chargeId: string, payment: any, newStatus: string, remainderCharge?: any) => void;
}) {
  const net = charge.amountCents - charge.discountCents;
  const paidSoFar = charge.payments.reduce((s: number, p: any) => s + p.amountCents, 0);
  const remaining = net - paidSoFar;

  const [method, setMethod] = useState("PIX");
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(
    charge.dueDate ? charge.dueDate.slice(0, 10) : new Date().toISOString().split("T")[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const amountCents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
      if (!amountCents || amountCents <= 0) {
        setError("Informe um valor válido.");
        setSaving(false);
        return;
      }
      if (amountCents > remaining) {
        setError(`Valor não pode exceder o saldo restante de R$ ${(remaining / 100).toFixed(2).replace(".", ",")}.`);
        setSaving(false);
        return;
      }
      const res = await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeId: charge.id,
          amountCents,
          method,
          paidAt: new Date(paidAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Erro ao registrar pagamento.");
      const payData = await res.json();

      let remainderCharge: any;
      if (partial && amountCents < remaining) {
        const remainderCents = remaining - amountCents;
        const chargeRes = await fetch("/api/v1/charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            appointmentId: charge.appointmentId,
            providerUserId: charge.providerUserId,
            amountCents: remainderCents,
            discountCents: 0,
            dueDate,
            description: "Saldo restante",
          }),
        });
        if (chargeRes.ok) {
          const cj = await chargeRes.json();
          remainderCharge = { ...(cj.data ?? {}), payments: [] };
          // Remainder charge created — mark the original charge as PAID.
          // The remaining obligation has been transferred to the new charge.
          await fetch(`/api/v1/charges/${charge.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "PAID" }),
          });
        } else {
          // Payment already succeeded — warn but don't block
          setError("Pagamento registrado, mas a cobrança de saldo restante não pôde ser criada. Crie-a manualmente.");
          setSaving(false);
          onPaid(charge.id, { id: payData.data?.id ?? crypto.randomUUID(), amountCents, method, paidAt: new Date(paidAt).toISOString() }, amountCents >= remaining ? "PAID" : "PENDING", undefined);
          return;
        }
      }

      const newPayment = {
        id: payData.data?.id ?? crypto.randomUUID(),
        amountCents,
        method,
        paidAt: new Date(paidAt).toISOString(),
      };
      // If a remainder charge was created, the original is fully accounted for → PAID
      const newStatus = remainderCharge ? "PAID" : (amountCents >= remaining ? "PAID" : "PENDING");
      onPaid(charge.id, newPayment, newStatus, remainderCharge);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao registrar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
            <Check className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">
              {partial ? "Pagamento parcial" : "Registrar pagamento"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Total: {formatCurrency(net)} · Pendente: {formatCurrency(remaining)}
            </p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Forma de pagamento</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {PAYMENT_METHODS_FIN.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Valor recebido (R$)</label>
            <input
              type="text" inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Data de recebimento</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {partial && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Vencimento do saldo restante</label>
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
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
            <Check className="h-4 w-4" />
            {saving ? "Salvando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Financial tab ──────────────────────────────────────────────────────── */
function FinancialTab({ charges: initialCharges, patientId }: { charges: any[]; patientId: string }) {
  const [charges, setCharges] = useState(initialCharges);
  const [payModal, setPayModal] = useState<{ charge: any; partial: boolean } | null>(null);

  const totalCharged = charges.reduce((s: number, c: any) => s + c.amountCents - c.discountCents, 0);
  const totalPaid = charges.reduce((s: number, c: any) =>
    s + c.payments.reduce((ps: number, p: any) => ps + p.amountCents, 0), 0);
  const totalPending = totalCharged - totalPaid;

  const CHARGE_STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendente", PAID: "Pago", OVERDUE: "Vencido",
    PARTIAL: "Parcial", VOID: "Cancelado",
  };
  const CHARGE_STATUS_COLORS: Record<string, string> = {
    PENDING: "text-yellow-700 bg-yellow-50 border-yellow-200",
    PAID: "text-green-700 bg-green-50 border-green-200",
    OVERDUE: "text-red-700 bg-red-50 border-red-200",
    PARTIAL: "text-blue-700 bg-blue-50 border-blue-200",
    VOID: "text-gray-500 bg-gray-50 border-gray-200",
  };

  function handlePaid(chargeId: string, payment: any, newStatus: string, remainderCharge?: any) {
    const updated = charges.map((c: any) =>
      c.id === chargeId
        ? { ...c, status: newStatus, payments: [...c.payments, payment] }
        : c
    );
    const withRemainder = remainderCharge ? [remainderCharge, ...updated] : updated;
    setCharges(withRemainder);
    setPayModal(null);
  }

  return (
    <div className="space-y-4">
      {payModal && (
        <FinancialPaymentModal
          charge={payModal.charge}
          patientId={patientId}
          partial={payModal.partial}
          onClose={() => setPayModal(null)}
          onPaid={handlePaid}
        />
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Total cobrado</p>
          <p className="text-xl font-bold">{formatCurrency(totalCharged)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Recebido</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Pendente</p>
          <p className="text-xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {charges.length === 0 && (
          <p className="text-gray-500 text-center py-8">Nenhuma cobrança registrada.</p>
        )}
        {charges.map((c: any) => {
          const net = c.amountCents - c.discountCents;
          const paidAmount = c.payments.reduce((s: number, p: any) => s + p.amountCents, 0);
          const isPaid = c.status === "PAID";
          const isPartiallyPaid = !isPaid && c.payments.length > 0 && c.status !== "VOID";
          const canPay = !isPaid && !isPartiallyPaid && c.status !== "VOID";

          return (
            <div key={c.id} className="bg-white rounded-xl border p-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{formatCurrency(net)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.dueDate ? `Venc. ${formatDate(c.dueDate)}` : "Sem vencimento"}
                    {c.description && ` · ${c.description}`}
                  </p>
                </div>
                <Badge className={`text-xs border ${CHARGE_STATUS_COLORS[c.status] ?? "text-gray-500 bg-gray-50 border-gray-200"}`}>
                  {CHARGE_STATUS_LABELS[c.status] ?? c.status}
                </Badge>
              </div>

              {/* Payments list */}
              {c.payments.length > 0 && (
                <div className="space-y-1 border-t pt-1">
                  {c.payments.map((p: any, i: number) => (
                    <div key={p.id ?? i} className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {PAYMENT_METHODS_FIN.find((m) => m.value === p.method)?.label ?? p.method} ·{" "}
                        {formatDate(p.paidAt)}
                      </span>
                      <span className="font-medium text-green-700">+ {formatCurrency(p.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment actions */}
              {canPay && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setPayModal({ charge: c, partial: false })}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" /> Marcar como pago
                  </button>
                  <button
                    onClick={() => setPayModal({ charge: c, partial: true })}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    <span className="font-bold">½</span> Pagamento parcial
                  </button>
                </div>
              )}

              {/* Partially paid badge */}
              {isPartiallyPaid && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200">
                    <span className="font-bold">½</span> Pago parcialmente · {formatCurrency(paidAmount)} de {formatCurrency(net)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="outline" size="sm" asChild>
        <Link href={`/app/financial/charges/new?patientId=${patientId}`}>
          <Plus className="h-3 w-3" /> Nova cobrança
        </Link>
      </Button>
    </div>
  );
}

/* ─── Profile tab ────────────────────────────────────────────────────────── */
function ProfileTab({
  patient,
  appointmentTypes,
  onPatientUpdate,
}: {
  patient: any;
  appointmentTypes: AppointmentTypeSummary[];
  onPatientUpdate: (updates: Record<string, any>) => void;
}) {
  const [editingBilling, setEditingBilling] = useState(false);
  const [billingForm, setBillingForm] = useState({
    defaultAppointmentTypeId: patient.defaultAppointmentTypeId ?? "",
    defaultFeeOverrideCents: patient.defaultFeeOverrideCents != null
      ? (patient.defaultFeeOverrideCents / 100).toFixed(2)
      : "",
  });
  const [savingBilling, setSavingBilling] = useState(false);

  const selectedType = appointmentTypes.find((t) => t.id === billingForm.defaultAppointmentTypeId);
  const effectiveFee = patient.defaultFeeOverrideCents != null
    ? patient.defaultFeeOverrideCents
    : patient.defaultAppointmentType?.defaultPriceCents ?? null;

  async function saveBilling() {
    setSavingBilling(true);
    try {
      const feeVal = billingForm.defaultFeeOverrideCents.trim();
      const feeCents = feeVal ? Math.round(parseFloat(feeVal.replace(",", ".")) * 100) : null;
      const res = await fetch(`/api/v1/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultAppointmentTypeId: billingForm.defaultAppointmentTypeId || null,
          defaultFeeOverrideCents: feeCents,
        }),
      });
      if (!res.ok) throw new Error();
      const type = appointmentTypes.find((t) => t.id === billingForm.defaultAppointmentTypeId);
      onPatientUpdate({
        defaultAppointmentTypeId: billingForm.defaultAppointmentTypeId || null,
        defaultFeeOverrideCents: feeCents,
        defaultAppointmentType: type ?? null,
      });
      setEditingBilling(false);
    } catch {
      // silently fail
    } finally {
      setSavingBilling(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* General info */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        {[
          { label: "Nome completo", value: patient.fullName },
          { label: "Nome preferido", value: patient.preferredName },
          { label: "Email", value: patient.email },
          { label: "Telefone", value: patient.phone },
          { label: "Data de nascimento", value: patient.dob ? formatDate(patient.dob) : null },
          { label: "Psicólogo responsável", value: patient.assignedUser?.name },
          { label: "Observações", value: patient.notes },
          { label: "Consentimento", value: patient.consentGiven ? `Dado em ${formatDate(patient.consentGivenAt)}` : "Não registrado" },
        ].map((field) => field.value ? (
          <div key={field.label}>
            <p className="text-xs text-gray-500 font-medium">{field.label}</p>
            <p className="text-sm text-gray-900 mt-0.5">{field.value}</p>
          </div>
        ) : null)}
      </div>

      {/* Billing defaults */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-gray-400" />
            Cobrança padrão
          </h3>
          {!editingBilling && (
            <button
              onClick={() => setEditingBilling(true)}
              className="text-xs text-brand-600 hover:underline"
            >
              Editar
            </button>
          )}
        </div>

        {!editingBilling ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 font-medium">Tipo de consulta padrão</p>
              <p className="text-sm text-gray-900 mt-0.5">
                {patient.defaultAppointmentType?.name ?? (
                  <span className="text-gray-400 italic">Não definido</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Valor por sessão</p>
              <p className="text-sm text-gray-900 mt-0.5">
                {effectiveFee != null ? (
                  <>
                    {formatCurrency(effectiveFee)}
                    {patient.defaultFeeOverrideCents != null && (
                      <span className="ml-1.5 text-xs text-gray-400">(valor personalizado)</span>
                    )}
                    {patient.defaultFeeOverrideCents == null && patient.defaultAppointmentType && (
                      <span className="ml-1.5 text-xs text-gray-400">(do tipo de consulta)</span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400 italic">Não definido</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Tipo de consulta padrão</label>
              <select
                value={billingForm.defaultAppointmentTypeId}
                onChange={(e) => {
                  const typeId = e.target.value;
                  const type = appointmentTypes.find((t) => t.id === typeId);
                  setBillingForm((f) => ({
                    ...f,
                    defaultAppointmentTypeId: typeId,
                    // Pre-fill fee from type if no custom fee yet
                    defaultFeeOverrideCents: f.defaultFeeOverrideCents || (type ? (type.defaultPriceCents / 100).toFixed(2) : ""),
                  }));
                }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">— Nenhum —</option>
                {appointmentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {formatCurrency(t.defaultPriceCents)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">
                Valor personalizado (R$) <span className="text-gray-400 font-normal">— deixe vazio para usar o valor do tipo</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder={selectedType ? (selectedType.defaultPriceCents / 100).toFixed(2) : "0,00"}
                value={billingForm.defaultFeeOverrideCents}
                onChange={(e) => setBillingForm((f) => ({ ...f, defaultFeeOverrideCents: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setEditingBilling(false)}
                disabled={savingBilling}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
              <button
                onClick={saveBilling}
                disabled={savingBilling}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-brand-600 text-white hover:bg-brand-700 transition-colors"
              >
                <Check className="h-3.5 w-3.5" /> Salvar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
