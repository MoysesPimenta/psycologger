"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

interface Charge {
  id: string;
  amountCents: number;
  discountCents: number;
  currency: string;
  dueDate: string;
  status: string;
  description: string | null;
  createdAt: string;
  payments: Array<{
    id: string;
    amountCents: number;
    method: string;
    paidAt: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  OVERDUE: "Vencido",
  PAID: "Pago",
  VOID: "Cancelado",
  REFUNDED: "Estornado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-red-100 text-red-700",
  PAID: "bg-green-100 text-green-700",
  VOID: "bg-gray-100 text-gray-500",
  REFUNDED: "bg-purple-100 text-purple-700",
};

const METHOD_LABELS: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CARD: "Cartão",
  TRANSFER: "Transferência",
  INSURANCE: "Convênio",
  OTHER: "Outro",
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function PortalPaymentsClient() {
  const [tab, setTab] = useState<"pending" | "paid" | "all">("pending");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestCounter, setRequestCounter] = useState(0);

  const fetchData = useCallback(async (signal: AbortSignal, counter: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/portal/charges?tab=${tab}&pageSize=50`, { signal });
      if (res.ok) {
        const json = await res.json();
        // Only update if this is the latest request
        if (counter === requestCounter) {
          setCharges(json.data);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        // Handle error silently
      }
    }
    setLoading(false);
  }, [tab, requestCounter]);

  useEffect(() => {
    const controller = new AbortController();
    const newCounter = requestCounter + 1;
    setRequestCounter(newCounter);
    fetchData(controller.signal, newCounter);
    return () => controller.abort();
  }, [tab, fetchData]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Pagamentos</h1>

      <div className="flex gap-2">
        {(["pending", "paid", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === t ? "bg-brand-600 text-white" : "bg-white text-gray-600 border hover:bg-gray-50",
            )}
          >
            {t === "pending" ? "Pendentes" : t === "paid" ? "Pagos" : "Todos"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
        </div>
      ) : charges.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">
          <CreditCard className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          Nenhum pagamento encontrado
        </div>
      ) : (
        <div className="space-y-2">
          {charges.map((charge) => {
            const net = charge.amountCents - charge.discountCents;
            return (
              <div key={charge.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {charge.description ?? "Consulta"} — {formatCurrency(net)}
                    </p>
                    {charge.discountCents > 0 && (
                      <p className="text-xs text-gray-400 line-through">
                        {formatCurrency(charge.amountCents)}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-0.5">
                      Vence {format(new Date(charge.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[charge.status] ?? "bg-gray-100 text-gray-500")}>
                    {STATUS_LABELS[charge.status] ?? charge.status}
                  </span>
                </div>

                {charge.payments.length > 0 && (
                  <div className="mt-3 pt-3 border-t space-y-1">
                    {charge.payments.map((p) => (
                      <p key={p.id} className="text-xs text-gray-500">
                        Pago em {format(new Date(p.paidAt), "dd/MM/yyyy")} ·{" "}
                        {METHOD_LABELS[p.method] ?? p.method} ·{" "}
                        {formatCurrency(p.amountCents)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
