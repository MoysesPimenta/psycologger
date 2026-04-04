"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchWithCsrf } from "@/lib/csrf-client";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Noronha",
];

const WORKING_DAYS_OPTIONS = [
  { label: "Seg", value: "1" },
  { label: "Ter", value: "2" },
  { label: "Qua", value: "3" },
  { label: "Qui", value: "4" },
  { label: "Sex", value: "5" },
  { label: "Sáb", value: "6" },
  { label: "Dom", value: "0" },
];

export function ClinicSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    website: "",
    addressLine: "",
    addressCity: "",
    addressState: "",
    addressZip: "",
    timezone: "America/Sao_Paulo",
    workingHoursStart: "08:00",
    workingHoursEnd: "18:00",
    workingDays: "1,2,3,4,5",
    defaultAppointmentDurationMin: 50,
    calendarShowPatient: "NONE" as "NONE" | "FIRST_NAME" | "FULL_NAME",
    adminCanViewClinical: true,
  });

  useEffect(() => {
    fetch("/api/v1/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.data) {
          const d = json.data;
          setForm({
            name: d.name ?? "",
            phone: d.phone ?? "",
            website: d.website ?? "",
            addressLine: d.addressLine ?? "",
            addressCity: d.addressCity ?? "",
            addressState: d.addressState ?? "",
            addressZip: d.addressZip ?? "",
            timezone: d.timezone ?? "America/Sao_Paulo",
            workingHoursStart: d.workingHoursStart ?? "08:00",
            workingHoursEnd: d.workingHoursEnd ?? "18:00",
            workingDays: d.workingDays ?? "1,2,3,4,5",
            defaultAppointmentDurationMin: d.defaultAppointmentDurationMin ?? 50,
            calendarShowPatient: d.calendarShowPatient ?? "NONE",
            adminCanViewClinical: d.adminCanViewClinical ?? true,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleWorkingDay(day: string) {
    const days = form.workingDays ? form.workingDays.split(",").filter(Boolean) : [];
    const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setForm((f) => ({ ...f, workingDays: newDays.sort().join(",") }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetchWithCsrf("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || undefined,
          phone: form.phone || null,
          website: form.website || null,
          addressLine: form.addressLine || null,
          addressCity: form.addressCity || null,
          addressState: form.addressState || null,
          addressZip: form.addressZip || null,
          timezone: form.timezone,
          workingHoursStart: form.workingHoursStart,
          workingHoursEnd: form.workingHoursEnd,
          workingDays: form.workingDays,
          defaultAppointmentDurationMin: form.defaultAppointmentDurationMin,
          calendarShowPatient: form.calendarShowPatient,
          adminCanViewClinical: form.adminCanViewClinical,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? "Erro ao salvar.");
        return;
      }

      setSuccess(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  // Cleanup timeout on unmount
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações básicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da clínica *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              minLength={2}
              maxLength={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Site</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://..."
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="addressLine">Rua / logradouro</Label>
            <Input
              id="addressLine"
              placeholder="Rua das Flores, 123, Sala 4"
              value={form.addressLine}
              onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))}
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="addressCity">Cidade</Label>
              <Input
                id="addressCity"
                value={form.addressCity}
                onChange={(e) => setForm((f) => ({ ...f, addressCity: e.target.value }))}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressState">UF</Label>
              <Input
                id="addressState"
                placeholder="SP"
                value={form.addressState}
                onChange={(e) => setForm((f) => ({ ...f, addressState: e.target.value.toUpperCase().slice(0, 2) }))}
                maxLength={2}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressZip">CEP</Label>
            <Input
              id="addressZip"
              placeholder="00000-000"
              value={form.addressZip}
              onChange={(e) => setForm((f) => ({ ...f, addressZip: e.target.value }))}
              maxLength={10}
            />
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agenda e horários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Fuso horário</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Dias de atendimento</Label>
            <div className="flex gap-2 flex-wrap">
              {WORKING_DAYS_OPTIONS.map(({ label, value }) => {
                const active = form.workingDays?.split(",").includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleWorkingDay(value)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      active
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workingHoursStart">Início do expediente</Label>
              <Input
                id="workingHoursStart"
                type="time"
                value={form.workingHoursStart}
                onChange={(e) => setForm((f) => ({ ...f, workingHoursStart: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workingHoursEnd">Fim do expediente</Label>
              <Input
                id="workingHoursEnd"
                type="time"
                value={form.workingHoursEnd}
                onChange={(e) => setForm((f) => ({ ...f, workingHoursEnd: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultDuration">Duração padrão de consulta (min)</Label>
            <Input
              id="defaultDuration"
              type="number"
              min={5}
              max={480}
              step={5}
              value={form.defaultAppointmentDurationMin}
              onChange={(e) =>
                setForm((f) => ({ ...f, defaultAppointmentDurationMin: parseInt(e.target.value) || 50 }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Exibir nome do paciente na agenda</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.calendarShowPatient}
              onChange={(e) =>
                setForm((f) => ({ ...f, calendarShowPatient: e.target.value as "NONE" | "FIRST_NAME" | "FULL_NAME" }))
              }
            >
              <option value="NONE">Não exibir (máxima privacidade)</option>
              <option value="FIRST_NAME">Apenas o primeiro nome</option>
              <option value="FULL_NAME">Nome completo</option>
            </select>
            <p className="text-xs text-gray-500">
              Controla o que é visível para usuários com permissão de visualizar a agenda.
            </p>
          </div>

          <div className="flex items-start gap-3 pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={form.adminCanViewClinical}
              onClick={() => setForm((f) => ({ ...f, adminCanViewClinical: !f.adminCanViewClinical }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                form.adminCanViewClinical ? "bg-brand-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  form.adminCanViewClinical ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <div>
              <Label className="cursor-pointer" onClick={() => setForm((f) => ({ ...f, adminCanViewClinical: !f.adminCanViewClinical }))}>
                Administrador pode ver prontuários clínicos
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Quando ativado, usuários com papel de Administrador têm acesso às anotações clínicas e sessões.
                Desative em clínicas onde o admin não é o terapeuta.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Configurações salvas com sucesso.</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
