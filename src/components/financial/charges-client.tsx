"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate, formatCurrency, chargeStatusLabel, paymentMethodLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle2, SplitSquareHorizontal } from "lucide-react";

interface Charge {
  id: string;
  amountCents: number;
  discountCents: number;
  dueDate: string;
  status: string;
  description: string | null;
  patient: { id: string; fullName: string };
  provider: { id: string; name: string | null };
  payments: { id: string; amountCents: number; method: string; paidAt: string }[];
  paidAmountCents: number;
}

const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary" | "info"> = {
  PAID: "success",
  PENDING: "info",
  OVERDUE: "warning",
  VOID: "secondary",
  REFUNDED: "secondary",
};

export function ChargesClient() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [filter, setFilter] = useState("");
  const { toast } = useToast();
  const [payingId, setPayingId] = useState<string | null>(null);

  const fetchCharges = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const params = new URLSearchParams({ pageSize: "50", ...(filter && { status: filter }) });
      const res = await fetch(`/api/v1/charges?${params}`);
      if (res.ok) {
        const json = await res.json();
        setCharges(json.data);
      } else {
        setFetchError("Erro ao carregar cobranças. Tente novamente.");
      }
    } catch {
      setFetchError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchCharges(); }, [fetchCharges]);

  async function markPaid(chargeId: string, amountCents: number) {
    setPayingId(chargeId);
    try {
      const res = await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId, amountCents, method: "PIX" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Erro ao registrar pagamento.");
      }
      toast({ title: "Pagamento registrado!", variant: "success" });
      fetchCharges();
    } catch (e: unknown) {
      toast({
        title: "Erro ao registrar pagamento",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {fetchError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={() => fetchCharges()} className="text-red-600 underline text-xs ml-4">Tentar novamente</button>
        </div>
      )}
      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {[
          { value: "", label: "Todas" },
          { value: "PENDING", label: "Pendentes" },
          { value: "OVERDUE", label: "Vencidas" },
          { value: "PAID", label: "Pagas" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filter === f.value
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse h-16" />
        ))
      ) : charges.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
          Nenhuma cobrança encontrada.
        </div>
      ) : (
        <div className="space-y-2">
          {charges.map((charge) => {
            const netAmount = charge.amountCents - charge.discountCents;
            const isPaid = charge.status === "PAID";
            const isPartiallyPaid = !isPaid && charge.payments.length > 0 && charge.status !== "VOID";
            const isPending = !isPaid && !isPartiallyPaid && (charge.status === "PENDING" || charge.status === "OVERDUE");
            return (
              <div key={charge.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{charge.patient.fullName}</span>
                      <Badge variant={statusVariant[charge.status] ?? "secondary"} className="text-xs">
                        {chargeStatusLabel(charge.status)}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      Vencimento: {formatDate(charge.dueDate)}
                      {charge.description && ` · ${charge.description}`}
                    </div>
                    {charge.payments.length > 0 && (
                      <div className="text-xs text-green-600 mt-0.5">
                        Recebido: {formatCurrency(charge.paidAmountCents)} via{" "}
                        {charge.payments.map((p) => paymentMethodLabel(p.method)).join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-bold text-gray-900">{formatCurrency(netAmount)}</span>
                    {isPending && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-700 border-green-300"
                        loading={payingId === charge.id}
                        onClick={() => markPaid(charge.id, netAmount - charge.paidAmountCents)}
                      >
                        <CreditCard className="h-3 w-3" />
                        Marcar pago
                      </Button>
                    )}
                    {isPartiallyPaid && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 whitespace-nowrap">
                        <SplitSquareHorizontal className="h-3.5 w-3.5" />
                        Pago parcialmente · {formatCurrency(charge.paidAmountCents)}
                      </span>
                    )}
                    {isPaid && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
