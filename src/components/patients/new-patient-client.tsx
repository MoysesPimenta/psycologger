"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function NewPatientClient() {
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
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/patients", {
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
