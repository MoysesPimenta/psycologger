"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface AppointmentTypeSummary {
  id: string;
  name: string;
  defaultPriceCents: number;
}

export function NewPatientClient({ appointmentTypes = [] }: { appointmentTypes?: AppointmentTypeSummary[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    preferredName: "",
    email: "",
    phone: "",
    dob: "",
    notes: "",
    tags: "",
    defaultAppointmentTypeId: "",
    defaultFeeOverrideCents: "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const selectedType = appointmentTypes.find((t) => t.id === form.defaultAppointmentTypeId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const feeVal = form.defaultFeeOverrideCents.trim();
      const feeCents = feeVal ? Math.round(parseFloat(feeVal.replace(",", ".")) * 100) : null;

      const res = await fetchWithCsrf("/api/v1/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          preferredName: form.preferredName || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          dob: form.dob || undefined,
          notes: form.notes || undefined,
          tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          defaultAppointmentTypeId: form.defaultAppointmentTypeId || undefined,
          defaultFeeOverrideCents: feeCents ?? undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast({ title: "Paciente criado!", variant: "success" });
      router.push(`/app/patients/${data.data.id}`);
    } catch {
      toast({ title: "Erro ao criar paciente", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo *</Label>
              <Input id="fullName" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required placeholder="João Silva" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredName">Nome preferido (apelido)</Label>
              <Input id="preferredName" value={form.preferredName} onChange={(e) => set("preferredName", e.target.value)} placeholder="João" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="joao@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="11 99999-0000" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dob">Data de nascimento</Label>
            <Input id="dob" type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
            <Input id="tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="ansiedade, depressão, adulto" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (não clínicas)</Label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Preferências de horário, forma de contato, etc."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* ── Billing defaults ── */}
          {appointmentTypes.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Cobrança padrão</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="defaultAppointmentTypeId" className="text-xs text-gray-600">Tipo de consulta padrão</Label>
                  <select
                    id="defaultAppointmentTypeId"
                    value={form.defaultAppointmentTypeId}
                    onChange={(e) => {
                      const typeId = e.target.value;
                      const type = appointmentTypes.find((t) => t.id === typeId);
                      set("defaultAppointmentTypeId", typeId);
                      // Pre-fill fee from type if no custom fee
                      if (type && !form.defaultFeeOverrideCents) {
                        set("defaultFeeOverrideCents", (type.defaultPriceCents / 100).toFixed(2));
                      }
                    }}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Nenhum —</option>
                    {appointmentTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · R$ {(t.defaultPriceCents / 100).toFixed(2).replace(".", ",")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="defaultFeeOverrideCents" className="text-xs text-gray-600">
                    Valor por sessão (R$)
                    {selectedType && !form.defaultFeeOverrideCents && (
                      <span className="ml-1 font-normal text-gray-400">padrão: R$ {(selectedType.defaultPriceCents / 100).toFixed(2).replace(".", ",")}</span>
                    )}
                  </Label>
                  <Input
                    id="defaultFeeOverrideCents"
                    type="text"
                    inputMode="decimal"
                    placeholder={selectedType ? (selectedType.defaultPriceCents / 100).toFixed(2) : "0,00"}
                    value={form.defaultFeeOverrideCents}
                    onChange={(e) => set("defaultFeeOverrideCents", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              {loading ? "Salvando..." : "Criar paciente"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
