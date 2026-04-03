"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LogOut, Shield, Phone, Bell, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfileData {
  patient: {
    id: string;
    fullName: string;
    preferredName: string | null;
    email: string | null;
    phone: string | null;
    dob: string | null;
  };
  preferences: {
    notifySessionReminder: boolean;
    notifyPaymentReminder: boolean;
    notifyPreSessionPrompt: boolean;
    reminderHoursBefore: number;
    defaultJournalVisibility: string;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelation: string | null;
  } | null;
}

export function PortalProfileClient() {
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({
    notifySessionReminder: true,
    notifyPaymentReminder: true,
    notifyPreSessionPrompt: true,
    reminderHoursBefore: 24,
    defaultJournalVisibility: "PRIVATE",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/portal/profile", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setData(json.data);
          if (json.data.preferences) {
            setPrefs({
              notifySessionReminder: json.data.preferences.notifySessionReminder,
              notifyPaymentReminder: json.data.preferences.notifyPaymentReminder,
              notifyPreSessionPrompt: json.data.preferences.notifyPreSessionPrompt,
              reminderHoursBefore: json.data.preferences.reminderHoursBefore,
              defaultJournalVisibility: json.data.preferences.defaultJournalVisibility,
              emergencyContactName: json.data.preferences.emergencyContactName ?? "",
              emergencyContactPhone: json.data.preferences.emergencyContactPhone ?? "",
              emergencyContactRelation: json.data.preferences.emergencyContactRelation ?? "",
            });
          }
        }
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          // Handle error silently
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...prefs,
          emergencyContactName: prefs.emergencyContactName || null,
          emergencyContactPhone: prefs.emergencyContactPhone || null,
          emergencyContactRelation: prefs.emergencyContactRelation || null,
        }),
      });
      if (!res.ok) {
        setError("Erro ao salvar preferências.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      const res = await fetch("/api/v1/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!res.ok) {
        setError("Erro ao fazer logout.");
        return;
      }
      router.push("/portal/login");
      router.refresh();
    } catch {
      setError("Erro de conexão.");
    }
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 w-32 bg-gray-200 rounded" />
      <div className="h-40 bg-gray-200 rounded-xl" />
    </div>;
  }

  if (!data) return <p className="text-gray-500">Erro ao carregar perfil.</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Perfil</h1>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg" role="alert">
          {error}
        </div>
      )}

      {/* Patient info (read-only) */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <p className="font-semibold text-gray-900">{data.patient.fullName}</p>
        {data.patient.preferredName && (
          <p className="text-sm text-gray-500">Nome preferido: {data.patient.preferredName}</p>
        )}
        {data.patient.email && <p className="text-sm text-gray-500">{data.patient.email}</p>}
        {data.patient.phone && <p className="text-sm text-gray-500">{data.patient.phone}</p>}
        {data.patient.dob && (
          <p className="text-sm text-gray-500">
            Nascimento: {format(new Date(data.patient.dob), "dd/MM/yyyy", { locale: ptBR })}
          </p>
        )}
      </div>

      {/* Notification preferences */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4 text-gray-400" />
          <p className="font-medium text-gray-900 text-sm">Notificações</p>
        </div>
        {[
          { key: "notifySessionReminder" as const, label: "Lembrete de sessão" },
          { key: "notifyPaymentReminder" as const, label: "Lembrete de pagamento" },
          { key: "notifyPreSessionPrompt" as const, label: "Convite para escrever antes da sessão" },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-700">{label}</span>
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
              className="accent-brand-600 h-4 w-4"
            />
          </label>
        ))}
      </div>

      {/* Journal default */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-4 w-4 text-gray-400" />
          <p className="font-medium text-gray-900 text-sm">Diário</p>
        </div>
        <label className="block text-sm text-gray-700">
          Visibilidade padrão
          <select
            value={prefs.defaultJournalVisibility}
            onChange={(e) => setPrefs((p) => ({ ...p, defaultJournalVisibility: e.target.value }))}
            className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
          >
            <option value="PRIVATE">Privado</option>
            <option value="SHARED">Compartilhado</option>
            <option value="DRAFT">Rascunho</option>
          </select>
        </label>
      </div>

      {/* Emergency contact */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Phone className="h-4 w-4 text-gray-400" />
          <p className="font-medium text-gray-900 text-sm">Contato de emergência</p>
        </div>
        <input
          placeholder="Nome"
          value={prefs.emergencyContactName}
          onChange={(e) => setPrefs((p) => ({ ...p, emergencyContactName: e.target.value }))}
          className="w-full px-3 py-2 text-sm border rounded-lg"
        />
        <input
          placeholder="Telefone"
          value={prefs.emergencyContactPhone}
          onChange={(e) => setPrefs((p) => ({ ...p, emergencyContactPhone: e.target.value }))}
          className="w-full px-3 py-2 text-sm border rounded-lg"
        />
        <input
          placeholder="Relação (ex: mãe, cônjuge)"
          value={prefs.emergencyContactRelation}
          onChange={(e) => setPrefs((p) => ({ ...p, emergencyContactRelation: e.target.value }))}
          className="w-full px-3 py-2 text-sm border rounded-lg"
        />
      </div>

      <Button onClick={handleSave} className="w-full" disabled={saving}>
        {saving ? "Salvando..." : "Salvar preferências"}
      </Button>

      {/* Links */}
      <div className="space-y-2">
        <Link
          href="/portal/privacy"
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 py-2"
        >
          <Shield className="h-4 w-4" /> Privacidade e consentimentos
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 py-2"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </div>
  );
}
