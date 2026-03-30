"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ReminderTemplate {
  id: string;
  type: string;
  subject: string;
  body: string;
  isActive: boolean;
}

const TEMPLATE_META: Record<string, { label: string; description: string; defaultSubject: string; defaultBody: string; category: "appointment" | "payment" }> = {
  CONFIRMATION: {
    label: "Confirmação de agendamento",
    description: "Enviado quando a consulta é agendada.",
    defaultSubject: "Sua consulta foi confirmada — {{clinic_name}}",
    defaultBody:
      "Olá, {{patient_name}}!\n\nSua consulta está confirmada para {{date}} às {{time}}.\n\nSe precisar remarcar, entre em contato conosco.\n\nAtenciosamente,\n{{clinic_name}}",
    category: "appointment",
  },
  REMINDER_24H: {
    label: "Lembrete 24 horas antes",
    description: "Enviado 24 horas antes da consulta.",
    defaultSubject: "Lembrete: sua consulta é amanhã — {{clinic_name}}",
    defaultBody:
      "Olá, {{patient_name}}!\n\nEste é um lembrete de que sua consulta é amanhã, {{date}} às {{time}}.\n\nAté lá!\n{{clinic_name}}",
    category: "appointment",
  },
  REMINDER_1H: {
    label: "Lembrete 1 hora antes",
    description: "Enviado 1 hora antes da consulta.",
    defaultSubject: "Sua consulta começa em 1 hora — {{clinic_name}}",
    defaultBody:
      "Olá, {{patient_name}}!\n\nSua consulta começa em 1 hora ({{time}}).\n\nAté logo!\n{{clinic_name}}",
    category: "appointment",
  },
  PAYMENT_CREATED: {
    label: "Cobrança criada",
    description: "Enviado ao paciente quando uma nova cobrança é registrada.",
    defaultSubject: "Nova cobrança — {{clinic_name}}",
    defaultBody:
      "Olá, {{patient_name}}!\n\nUma nova cobrança foi registrada:\n\nValor: {{amount}}\nVencimento: {{due_date}}\n\nEm caso de dúvidas, entre em contato conosco.\n\nAtenciosamente,\n{{clinic_name}}",
    category: "payment",
  },
  PAYMENT_DUE_24H: {
    label: "Lembrete 24h antes do vencimento",
    description: "Enviado 24 horas antes do vencimento da cobrança.",
    defaultSubject: "Lembrete: cobrança vence amanhã — {{clinic_name}}",
    defaultBody:
      "Olá, {{patient_name}}!\n\nLembramos que você tem uma cobrança com vencimento amanhã:\n\nValor: {{amount}}\nVencimento: {{due_date}}\n\nAtenciosamente,\n{{clinic_name}}",
    category: "payment",
  },
  PAYMENT_OVERDUE: {
    label: "Cobrança em atraso",
    description: "Enviado quando a cobrança passa do vencimento.",
    defaultSubject: "Cobrança em atraso — {{clinic_name}}",
    defaultBody:
      "Olá, {{patient_name}}!\n\nIdentificamos uma cobrança em atraso:\n\nValor: {{amount}}\nVencimento: {{due_date}}\n\nPor favor, entre em contato para regularizar.\n\nAtenciosamente,\n{{clinic_name}}",
    category: "payment",
  },
};

const APPOINTMENT_TYPES = ["CONFIRMATION", "REMINDER_24H", "REMINDER_1H"] as const;
const PAYMENT_TYPES = ["PAYMENT_CREATED", "PAYMENT_DUE_24H", "PAYMENT_OVERDUE"] as const;

const APPOINTMENT_VARIABLES = [
  { tag: "{{patient_name}}", desc: "Nome do paciente" },
  { tag: "{{clinic_name}}", desc: "Nome da clínica" },
  { tag: "{{date}}", desc: "Data da consulta" },
  { tag: "{{time}}", desc: "Horário da consulta" },
];

const PAYMENT_VARIABLES = [
  { tag: "{{patient_name}}", desc: "Nome do paciente" },
  { tag: "{{clinic_name}}", desc: "Nome da clínica" },
  { tag: "{{amount}}", desc: "Valor da cobrança" },
  { tag: "{{due_date}}", desc: "Data de vencimento" },
];

export function RemindersClient() {
  const [templates, setTemplates] = useState<Record<string, ReminderTemplate | null>>({
    CONFIRMATION: null,
    REMINDER_24H: null,
    REMINDER_1H: null,
    PAYMENT_CREATED: null,
    PAYMENT_DUE_24H: null,
    PAYMENT_OVERDUE: null,
  });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", body: "", isActive: true });
  const [saving, setSaving] = useState(false);
  const [savedType, setSavedType] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/reminder-templates")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.data) {
          const map: Record<string, ReminderTemplate> = {};
          for (const t of json.data) map[t.type] = t;
          setTemplates((prev) => ({ ...prev, ...map }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function startEdit(type: string) {
    const existing = templates[type];
    const meta = TEMPLATE_META[type];
    setEditing(type);
    setForm({
      subject: existing?.subject ?? meta.defaultSubject,
      body: existing?.body ?? meta.defaultBody,
      isActive: existing?.isActive ?? true,
    });
  }

  async function handleSave(type: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/reminder-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...form }),
      });
      if (res.ok) {
        const json = await res.json();
        setTemplates((prev) => ({ ...prev, [type]: json.data }));
        setEditing(null);
        setSavedType(type);
        setTimeout(() => setSavedType(null), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;

  function renderTemplateCard(type: string) {
    const meta = TEMPLATE_META[type];
    const existing = templates[type];
    const isEditingThis = editing === type;

    return (
      <Card key={type}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{meta.description}</CardDescription>
            </div>
            {!isEditingThis && (
              <Button size="sm" variant="outline" onClick={() => startEdit(type)}>
                {existing ? "Editar" : "Configurar"}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isEditingThis ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Assunto do email</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label>Corpo do email</Label>
                <textarea
                  className="w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  maxLength={5000}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`active-${type}`}
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor={`active-${type}`} className="font-normal cursor-pointer">
                  Ativo (enviar este email)
                </Label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSave(type)} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {existing ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-0.5">Assunto</p>
                    <p className="text-sm text-gray-800">{existing.subject}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-0.5">Corpo</p>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans line-clamp-3">
                      {existing.body}
                    </pre>
                  </div>
                  {savedType === type && (
                    <p className="text-xs text-green-600">Salvo com sucesso.</p>
                  )}
                  {!existing.isActive && (
                    <p className="text-xs text-amber-600">Este email está desativado.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  Não configurado — usando modelo padrão.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderVariablesHelp(variables: { tag: string; desc: string }[]) {
    return (
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4 pb-3">
          <p className="text-sm font-medium text-blue-900 mb-2">Variáveis disponíveis</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {variables.map(({ tag, desc }) => (
              <span key={tag} className="text-xs text-blue-800">
                <code className="font-mono bg-blue-100 px-1 rounded">{tag}</code> — {desc}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Appointment Reminders */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Lembretes de consulta</h3>
        <div className="space-y-4">
          {renderVariablesHelp(APPOINTMENT_VARIABLES)}
          {APPOINTMENT_TYPES.map(renderTemplateCard)}
        </div>
      </div>

      {/* Payment Reminders */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Lembretes de pagamento</h3>
        <div className="space-y-4">
          {renderVariablesHelp(PAYMENT_VARIABLES)}
          {PAYMENT_TYPES.map(renderTemplateCard)}
        </div>
      </div>
    </div>
  );
}
