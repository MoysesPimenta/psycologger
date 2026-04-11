"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface AppointmentType {
  id: string;
  name: string;
  sessionType: string;
  defaultDurationMin: number;
  defaultPriceCents: number;
  color: string;
  isActive: boolean;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  IN_PERSON: "Presencial",
  ONLINE: "Online",
  EVALUATION: "Avaliação",
  GROUP: "Grupo",
};

const DEFAULT_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

interface FormState {
  name: string;
  sessionType: string;
  defaultDurationMin: number;
  defaultPriceCents: number;
  color: string;
}

const emptyForm: FormState = {
  name: "",
  sessionType: "IN_PERSON",
  defaultDurationMin: 50,
  defaultPriceCents: 0,
  color: "#3b82f6",
};

export function AppointmentTypesClient() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const te = useTranslations("errors");

  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; name: string } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/v1/appointment-types");
    if (res.ok) {
      const json = await res.json();
      setTypes(json.data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function startEdit(type: AppointmentType) {
    setEditingId(type.id);
    setForm({
      name: type.name,
      sessionType: type.sessionType,
      defaultDurationMin: type.defaultDurationMin,
      defaultPriceCents: type.defaultPriceCents,
      color: type.color,
    });
    setShowForm(false);
    setError("");
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setError("");
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(t("requiredName")); return; }
    setSaving(true);
    setError("");

    try {
      const url = editingId
        ? `/api/v1/appointment-types/${editingId}`
        : "/api/v1/appointment-types";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetchWithCsrf(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          sessionType: form.sessionType,
          defaultDurationMin: form.defaultDurationMin,
          defaultPriceCents: Math.round((form.defaultPriceCents || 0)),
          color: form.color,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? te("saveFailed"));
        return;
      }

      await load();
      cancelForm();
    } catch {
      setError(te("connectionError"));
    } finally {
      setSaving(false);
    }
  }

  async function executeDelete(id: string) {
    setConfirmDeactivate(null);
    setActionError("");
    const res = await fetchWithCsrf(`/api/v1/appointment-types/${id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setActionError(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? t("appointmentTypeDeactivateError"));
    }
  }

  async function handleToggle(type: AppointmentType) {
    setActionError("");
    const res = await fetchWithCsrf(`/api/v1/appointment-types/${type.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !type.isActive }),
    });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setActionError(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? t("appointmentTypeUpdateError"));
    }
  }

  if (loading) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {/* List */}
      {types.length === 0 && !showForm && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p className="text-sm">{t("noAppointmentTypes")}</p>
            <p className="text-sm mt-1">{t("createAppointmentTypeHint")}</p>
          </CardContent>
        </Card>
      )}

      {types.map((type) => (
        <Card key={type.id} className={!type.isActive ? "opacity-60" : ""}>
          <CardContent className="p-4">
            {editingId === type.id ? (
              <TypeForm
                form={form}
                setForm={setForm}
                onSave={handleSave}
                onCancel={cancelForm}
                saving={saving}
                error={error}
              />
            ) : (
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: type.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{type.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {SESSION_TYPE_LABELS[type.sessionType]} · {type.defaultDurationMin} min
                    {type.defaultPriceCents > 0 && ` · R$ ${(type.defaultPriceCents / 100).toFixed(2)}`}
                    {!type.isActive && ` · ${t("inactive")}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(type)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setConfirmDeactivate({ id: type.id, name: type.name })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Create form */}
      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-gray-700 mb-4">{t("newAppointmentType")}</p>
            <TypeForm
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onCancel={cancelForm}
              saving={saving}
              error={error}
            />
          </CardContent>
        </Card>
      )}

      {!showForm && editingId === null && (
        <Button variant="outline" onClick={startCreate} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> {t("addType")}
        </Button>
      )}

      {/* Deactivate confirmation modal */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-labelledby="deactivate-type-title"
          onClick={() => setConfirmDeactivate(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <h2 id="deactivate-type-title" className="text-base font-semibold text-gray-900">{t("deactivateConfirmTitle")}</h2>
            <p className="text-sm text-gray-600">
              {t("deactivateConfirmMessage", { name: confirmDeactivate.name })}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeactivate(null)}>{tc("cancel")}</Button>
              <Button variant="destructive" size="sm" onClick={() => executeDelete(confirmDeactivate.id)}>
                <Trash2 className="h-4 w-4 mr-1" /> {t("deactivate")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  error,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 space-y-2">
          <Label>Nome *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Consulta individual, Avaliação..."
            autoFocus
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>Modalidade</Label>
          <select
            className="w-full h-11 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.sessionType}
            onChange={(e) => setForm((f) => ({ ...f, sessionType: e.target.value }))}
          >
            <option value="IN_PERSON">Presencial</option>
            <option value="ONLINE">Online</option>
            <option value="EVALUATION">Avaliação</option>
            <option value="GROUP">Grupo</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Duração (min)</Label>
          <Input
            type="number"
            min={5}
            max={480}
            step={5}
            value={form.defaultDurationMin}
            onChange={(e) => setForm((f) => ({ ...f, defaultDurationMin: parseInt(e.target.value) || 50 }))}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>Preço padrão (R$)</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="0,00"
            value={form.defaultPriceCents ? (form.defaultPriceCents / 100).toFixed(2) : ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, defaultPriceCents: Math.round(parseFloat(e.target.value || "0") * 100) }))
            }
            className="h-11"
          />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label>Cor</Label>
          <div className="flex gap-2 flex-wrap items-center">
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`w-8 h-8 rounded-full border-2 transition-all flex-shrink-0 ${
                  form.color === c ? "border-gray-900 scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
              />
            ))}
            <input
              type="color"
              className="w-8 h-8 rounded-full cursor-pointer border border-gray-300 flex-shrink-0"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              title="Cor personalizada"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row gap-2">
        <Button variant="outline" onClick={onCancel} size="sm" className="h-11 sm:h-auto w-full sm:w-auto">
          <X className="h-3.5 w-3.5 mr-1" /> {tc("cancel")}
        </Button>
        <Button onClick={onSave} disabled={saving} size="sm" className="h-11 sm:h-auto w-full sm:w-auto">
          <Check className="h-3.5 w-3.5 mr-1" />
          {saving ? tc("saving") : tc("save")}
        </Button>
      </div>
    </div>
  );
}
