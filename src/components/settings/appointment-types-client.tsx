"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

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
    if (!form.name.trim()) { setError("Nome é obrigatório."); return; }
    setSaving(true);
    setError("");

    try {
      const url = editingId
        ? `/api/v1/appointment-types/${editingId}`
        : "/api/v1/appointment-types";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
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
        setError(data?.error?.message ?? "Erro ao salvar.");
        return;
      }

      await load();
      cancelForm();
    } catch {
      setError("Erro de rede.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Desativar o tipo "${name}"? As consultas existentes não serão afetadas.`)) return;
    setActionError("");
    const res = await fetch(`/api/v1/appointment-types/${id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setActionError(data?.error?.message ?? "Erro ao desativar tipo de consulta.");
    }
  }

  async function handleToggle(type: AppointmentType) {
    setActionError("");
    const res = await fetch(`/api/v1/appointment-types/${type.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !type.isActive }),
    });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setActionError(data?.error?.message ?? "Erro ao atualizar tipo de consulta.");
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
            <p className="text-sm">Nenhum tipo de consulta cadastrado.</p>
            <p className="text-sm mt-1">Crie um para poder agendar consultas.</p>
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
                    {!type.isActive && " · Inativo"}
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
                    onClick={() => handleDelete(type.id, type.name)}
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
            <p className="text-sm font-medium text-gray-700 mb-4">Novo tipo de consulta</p>
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
          <Plus className="h-4 w-4 mr-2" /> Adicionar tipo
        </Button>
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label>Nome *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Consulta individual, Avaliação..."
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label>Modalidade</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
          />
        </div>
        <div className="space-y-2">
          <Label>Cor</Label>
          <div className="flex gap-2 flex-wrap">
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  form.color === c ? "border-gray-900 scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
              />
            ))}
            <input
              type="color"
              className="w-7 h-7 rounded-full cursor-pointer border border-gray-300"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              title="Cor personalizada"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving} size="sm">
          <Check className="h-3.5 w-3.5 mr-1" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="outline" onClick={onCancel} size="sm">
          <X className="h-3.5 w-3.5 mr-1" /> Cancelar
        </Button>
      </div>
    </div>
  );
}
