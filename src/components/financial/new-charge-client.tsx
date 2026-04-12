"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface Patient {
  id: string;
  fullName: string;
  preferredName: string | null;
}

export function NewChargeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("newCharge");
  const prefillPatientId = searchParams.get("patientId") ?? "";

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    patientId: prefillPatientId,
    amountBRL: "",
    discountBRL: "0",
    dueDate: format(new Date(), "yyyy-MM-dd"),
    description: "",
    notes: "",
  });

  useEffect(() => {
    fetch("/api/v1/patients?pageSize=200")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => json && setPatients(json.data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patientId || !form.amountBRL) return;

    const amountCents = Math.round(parseFloat(form.amountBRL.replace(",", ".")) * 100);
    const discountCents = Math.round(parseFloat(form.discountBRL.replace(",", ".") || "0") * 100);

    if (isNaN(amountCents) || amountCents <= 0) {
      setError(t("invalidAmount"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetchWithCsrf("/api/v1/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.patientId,
          amountCents,
          discountCents: isNaN(discountCents) ? 0 : discountCents,
          dueDate: form.dueDate,
          description: form.description || undefined,
          notes: form.notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? t("creationError"));
        return;
      }

      router.push("/app/financial/charges");
      router.refresh();
    } catch {
      setError(t("networkError"));
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
            <Label htmlFor="patientId">{t("patient")}</Label>
            <select
              id="patientId"
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.patientId}
              onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
              required
            >
              <option value="">{t("selectPatient")}</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName ? `${p.preferredName} (${p.fullName})` : p.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amountBRL">Valor (R$) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
                <Input
                  id="amountBRL"
                  className="pl-9"
                  placeholder="0,00"
                  value={form.amountBRL}
                  onChange={(e) => setForm((f) => ({ ...f, amountBRL: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discountBRL">Desconto (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
                <Input
                  id="discountBRL"
                  className="pl-9"
                  placeholder="0,00"
                  value={form.discountBRL}
                  onChange={(e) => setForm((f) => ({ ...f, discountBRL: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Due date */}
          <div className="space-y-2">
            <Label htmlFor="dueDate">Data de vencimento *</Label>
            <Input
              id="dueDate"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Input
              id="description"
              placeholder="Ex: Consulta de avaliação, sessão nº 10..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={200}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações internas (opcional)</Label>
            <textarea
              id="notes"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Notas visíveis apenas para a equipe..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={loading || !form.patientId || !form.amountBRL}>
          {loading ? t("saving") : t("createCharge")}
        </Button>
      </div>
    </form>
  );
}
