"use client";

import { useState, useEffect, useRef } from "react";
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
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const currentId = ++requestId.current;

    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/portal/charges?tab=${tab}&pageSize=50`, {
          signal: controller.signal,
        });
        if (res.ok && currentId === requestId.current) {
          const json = await res.json();
          setCharges(json.data);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Handle error silently
        }
      } finally {
        if (currentId === requestId.current) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => controller.abort();
  }, [tab]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Pagamentos</h1>

      <div className="flex gap-2 bg-gray-100/50 rounded-xl p-1">
        {(["pending", "paid", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-4 py-2 text-xs font-semibold rounded-lg transition-all active:scale-95",
              tab === t
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900",
            )}
          >
            {t === "pending" ? "Pendentes" : t === "paid" ? "Pagos" : "Todos"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : charges.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/50 p-8 text-center">
          <CreditCard className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Nenhum pagamento encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {charges.map((charge) => {
            const net = charge.amountCents - charge.discountCents;
            return (
              <div key={charge.id} className="bg-white rounded-2xl border border-gray-200/50 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {charge.description ?? "Consulta"}
                    </p>
                    <p className="text-lg font-bold text-gray-800 mt-1">
                      {formatCurrency(net)}
                    </p>
                    {charge.discountCents > 0 && (
                      <p className="text-xs text-gray-400 line-through">
                        {formatCurrency(charge.amountCents)}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Vence {format(new Date(charge.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0", STATUS_COLORS[charge.status] ?? "bg-gray-100 text-gray-500")}>
                    {STATUS_LABELS[charge.status] ?? charge.status}
                  </span>
                </div>

                {charge.payments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                    {charge.payments.map((p) => (
                      <p key={p.id} className="text-xs text-gray-500">
                        Pago {format(new Date(p.paidAt), "dd/MM/yyyy", { locale: ptBR })} · {METHOD_LABELS[p.method] ?? p.method} · {formatCurrency(p.amountCents)}
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
