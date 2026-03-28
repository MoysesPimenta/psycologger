"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addMinutes, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface Patient {
  id: string;
  fullName: string;
  preferredName: string | null;
}

interface AppointmentType {
  id: string;
  name: string;
  defaultDurationMin: number;
  defaultPriceCents: number;
  color: string;
}

interface Provider {
  id: string;
  name: string | null;
}

interface Props {
  userId: string;
  role: string;
}

export function NewAppointmentClient({ userId, role }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillPatientId = searchParams.get("patientId") ?? "";
  const prefillDate = searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");
  const prefillTime = searchParams.get("time") ?? "09:00";

  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    patientId: prefillPatientId,
    appointmentTypeId: "",
    providerUserId: userId,
    date: prefillDate,
    time: prefillTime,
    durationMin: 50,
    location: "",
    videoLink: "",
    adminNotes: "",
  });

  useEffect(() => {
    async function load() {
      const [pRes, tRes] = await Promise.all([
        fetch("/api/v1/patients?pageSize=200"),
        fetch("/api/v1/appointment-types"),
      ]);
      if (pRes.ok) {
        const json = await pRes.json();
        setPatients(json.data ?? []);
      }
      if (tRes.ok) {
        const json = await tRes.json();
        const types = (json.data ?? []).filter((t: AppointmentType & { isActive: boolean }) => t.isActive);
        setAppointmentTypes(types);
        if (types.length > 0 && !form.appointmentTypeId) {
          setForm((f) => ({
            ...f,
            appointmentTypeId: types[0].id,
            durationMin: types[0].defaultDurationMin,
          }));
        }
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load providers for admins (API returns memberships, map to {id, name})
  useEffect(() => {
    if (role === "TENANT_ADMIN" || role === "ASSISTANT") {
      fetch("/api/v1/users")
        .then((r) => r.ok ? r.json() : null)
        .then((json) => {
          if (!json) return;
          const providerRoles = ["PSYCHOLOGIST", "TENANT_ADMIN"];
          const mapped = (json.data ?? [])
            .filter((m: any) => providerRoles.includes(m.role) && m.status === "ACTIVE")
            .map((m: any) => ({ id: m.userId, name: m.user?.name ?? null }));
          setProviders(mapped);
          // Pre-select first provider if none selected
          if (mapped.length > 0) {
            setForm((f) => ({ ...f, providerUserId: f.providerUserId || mapped[0].id }));
          }
        });
    }
  }, [role]);

  function handleTypeChange(typeId: string) {
    const type = appointmentTypes.find((t) => t.id === typeId);
    setForm((f) => ({
      ...f,
      appointmentTypeId: typeId,
      durationMin: type?.defaultDurationMin ?? f.durationMin,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patientId || !form.appointmentTypeId) return;

    setLoading(true);
    setError("");

    try {
      const startsAt = new Date(`${form.date}T${form.time}:00`);
      const endsAt = addMinutes(startsAt, form.durationMin);

      const res = await fetch("/api/v1/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.patientId,
          appointmentTypeId: form.appointmentTypeId,
          providerUserId: form.providerUserId || userId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          location: form.location || undefined,
          videoLink: form.videoLink || undefined,
          adminNotes: form.adminNotes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "Erro ao criar consulta.");
        return;
      }

      router.push("/app/calendar");
      router.refresh();
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Patient */}
          <div className="space-y-2">
            <Label htmlFor="patientId">Paciente *</Label>
            <select
              id="patientId"
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.patientId}
              onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
              required
            >
              <option value="">Selecione um paciente...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName ? `${p.preferredName} (${p.fullName})` : p.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Appointment type */}
          <div className="space-y-2">
            <Label htmlFor="appointmentTypeId">Tipo de consulta *</Label>
            {appointmentTypes.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                Nenhum tipo de consulta configurado.{" "}
                <a href="/app/settings/appointment-types" className="underline font-medium">
                  Crie um tipo primeiro.
                </a>
              </p>
            ) : (
              <select
                id="appointmentTypeId"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.appointmentTypeId}
                onChange={(e) => handleTypeChange(e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {appointmentTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Provider (admins only) */}
          {(role === "TENANT_ADMIN" || role === "ASSISTANT") && providers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="providerUserId">Profissional</Label>
              <select
                id="providerUserId"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.providerUserId}
                onChange={(e) => setForm((f) => ({ ...f, providerUserId: e.target.value }))}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            {/* Time */}
            <div className="space-y-2">
              <Label htmlFor="time">Horário *</Label>
              <Input
                id="time"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="durationMin">Duração (minutos)</Label>
            <Input
              id="durationMin"
              type="number"
              min={5}
              max={480}
              step={5}
              value={form.durationMin}
              onChange={(e) => setForm((f) => ({ ...f, durationMin: parseInt(e.target.value) || 50 }))}
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Local (opcional)</Label>
            <Input
              id="location"
              placeholder="Ex: Sala 1, consultório principal..."
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              maxLength={200}
            />
          </div>

          {/* Video link */}
          <div className="space-y-2">
            <Label htmlFor="videoLink">Link de videochamada (opcional)</Label>
            <Input
              id="videoLink"
              type="url"
              placeholder="https://meet.google.com/..."
              value={form.videoLink}
              onChange={(e) => setForm((f) => ({ ...f, videoLink: e.target.value }))}
            />
          </div>

          {/* Admin notes */}
          <div className="space-y-2">
            <Label htmlFor="adminNotes">Observações internas (opcional)</Label>
            <textarea
              id="adminNotes"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Notas visíveis apenas para a equipe administrativa..."
              value={form.adminNotes}
              onChange={(e) => setForm((f) => ({ ...f, adminNotes: e.target.value }))}
              maxLength={1000}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading || !form.patientId || !form.appointmentTypeId}
        >
          {loading ? "Salvando..." : "Criar consulta"}
        </Button>
      </div>
    </form>
  );
}
