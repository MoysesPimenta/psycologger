"use client";

import { useState } from "react";
import Link from "next/link";
import {
  User, Calendar, FileText, DollarSign, Phone, Mail,
  Tag, Edit, Plus, Lock, Clock, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatCurrency, chargeStatusLabel, initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Tab = "timeline" | "sessions" | "files" | "financial" | "profile";

export function PatientDetailClient({
  patient,
  canViewClinical,
  role,
  userId,
}: {
  patient: Record<string, any>;
  canViewClinical: boolean;
  role: string;
  userId: string;
}) {
  const [tab, setTab] = useState<Tab>("timeline");

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "timeline", label: "Timeline", icon: Clock },
    { id: "sessions", label: "Sessões", icon: FileText },
    { id: "files", label: "Arquivos", icon: FileText },
    { id: "financial", label: "Financeiro", icon: DollarSign },
    { id: "profile", label: "Perfil", icon: User },
  ];

  const displayName = patient.preferredName ?? patient.fullName;

  return (
    <div className="space-y-6">
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
            <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
            {patient.preferredName && (
              <p className="text-sm text-gray-500">{patient.fullName}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
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
          <ProfileTab patient={patient} />
        )}
      </div>
    </div>
  );
}

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

function SessionsTab({ sessions, patientId }: { sessions: any[]; patientId: string }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" asChild>
          <Link href={`/app/sessions/new?patientId=${patientId}`}>
            <Plus className="h-3 w-3" /> Nova sessão
          </Link>
        </Button>
      </div>
      {sessions.map((s: any) => (
        <Link key={s.id} href={`/app/sessions/${s.id}`}
          className="flex items-center gap-4 bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
          <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{formatDate(s.sessionDate)}</p>
            <p className="text-sm text-gray-500">{s.templateKey} · {s.provider.name}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function FilesTab({ files, patientId, canViewClinical }: { files: any[]; patientId: string; canViewClinical: boolean }) {
  return (
    <div className="space-y-3">
      {files.filter((f: any) => !f.isClinical || canViewClinical).map((f: any) => (
        <div key={f.id} className="flex items-center gap-3 bg-white rounded-xl border p-3">
          <FileText className="h-5 w-5 text-gray-400" />
          <div className="flex-1">
            <p className="text-sm font-medium">{f.fileName}</p>
            <p className="text-xs text-gray-500">{formatDateTime(f.createdAt)} · {(f.sizeBytes / 1024).toFixed(1)} KB</p>
          </div>
          <Button size="sm" variant="ghost">Download</Button>
        </div>
      ))}
      {files.length === 0 && <p className="text-gray-500 text-center py-8">Nenhum arquivo anexado.</p>}
    </div>
  );
}

function FinancialTab({ charges, patientId }: { charges: any[]; patientId: string }) {
  const totalCharged = charges.reduce((s: number, c: any) => s + c.amountCents - c.discountCents, 0);
  const totalPaid = charges
    .filter((c: any) => c.status === "PAID")
    .reduce((s: number, c: any) => s + c.payments.reduce((ps: number, p: any) => ps + p.amountCents, 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Total cobrado</p>
          <p className="text-xl font-bold">{formatCurrency(totalCharged)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Total recebido</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
        </div>
      </div>
      <div className="space-y-2">
        {charges.map((c: any) => {
          const paidAmount = c.payments.reduce((s: number, p: any) => s + p.amountCents, 0);
          return (
            <div key={c.id} className="flex items-center gap-3 bg-white rounded-xl border p-3">
              <div className="flex-1">
                <p className="text-sm font-medium">{formatDate(c.dueDate)}</p>
                <p className="text-xs text-gray-500">{chargeStatusLabel(c.status)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{formatCurrency(c.amountCents - c.discountCents)}</p>
                {c.status === "PAID" && (
                  <p className="text-xs text-green-600">Pago: {formatCurrency(paidAmount)}</p>
                )}
              </div>
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

function ProfileTab({ patient }: { patient: any }) {
  return (
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
  );
}
