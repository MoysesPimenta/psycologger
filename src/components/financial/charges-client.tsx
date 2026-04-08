"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { formatDate, formatCurrency, chargeStatusLabel, paymentMethodLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle2, SplitSquareHorizontal, X } from "lucide-react";

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
  const t = useTranslations("charges");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [filter, setFilter] = useState("");
  const { toast } = useToast();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethodMap, setPayMethodMap] = useState<Record<string, string>>({});
  // Track which charge has the partial payment form open + custom amount
  const [partialFormId, setPartialFormId] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");

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

  // ── Summary totals for the current view ───────────────────────────────────
  const summary = useMemo(() => {
    let totalNet = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    for (const c of charges) {
      const net = c.amountCents - c.discountCents;
      // Exclude "Saldo restante" from totalNet — they are accounting splits
      // of original charges, not additional billed services
      if (c.description !== "Saldo restante") {
        totalNet += net;
      }
      totalPaid += c.paidAmountCents;
      if (c.status !== "PAID" && c.status !== "VOID" && c.status !== "REFUNDED") {
        totalRemaining += net - c.paidAmountCents;
      }
    }
    return { totalNet, totalPaid, totalRemaining, count: charges.length };
  }, [charges]);

  async function markPaid(chargeId: string, amountCents: number) {
    setPayingId(chargeId);
    const method = payMethodMap[chargeId] ?? "PIX";
    try {
      const res = await fetchWithCsrf("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId, amountCents, method }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? "Erro ao registrar pagamento.");
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

  // ── Summary label varies by active tab ────────────────────────────────────
  function summaryLabel() {
    if (filter === "PAID") return "Total recebido";
    if (filter === "OVERDUE") return "Total vencido";
    if (filter === "PENDING") return "Total pendente";
    return "Total cobrado";
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

      {/* Summary bar — stacked on mobile */}
      {!loading && charges.length > 0 && (
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 sm:gap-4 bg-white rounded-xl border px-3 sm:px-4 py-3 flex-wrap">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="text-xs text-gray-500 font-medium">{summaryLabel()}</span>
            <span className="text-sm font-bold text-gray-900">
              {filter === "PAID"
                ? formatCurrency(summary.totalPaid)
                : filter === "OVERDUE" || filter === "PENDING"
                ? formatCurrency(summary.totalRemaining)
                : formatCurrency(summary.totalNet)}
            </span>
          </div>
          {filter === "" && summary.totalPaid > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="text-xs text-gray-500 font-medium">Recebido</span>
              <span className="text-sm font-bold text-green-700">{formatCurrency(summary.totalPaid)}</span>
            </div>
          )}
          {filter === "" && summary.totalRemaining > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="text-xs text-gray-500 font-medium">A receber</span>
              <span className="text-sm font-bold text-yellow-700">{formatCurrency(summary.totalRemaining)}</span>
            </div>
          )}
          <span className="text-xs text-gray-400 sm:ml-auto col-span-2 sm:col-span-auto">{summary.count} cobrança{summary.count !== 1 ? "s" : ""}</span>
        </div>
      )}

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse h-16" />
        ))
      ) : charges.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
          Nenhuma cobrança encontrada.
        </div>
      ) : (
        <div className="space-y-2 pb-4">
          {charges.map((charge) => {
            const netAmount = charge.amountCents - charge.discountCents;
            const isPaid = charge.status === "PAID";
            const isVoid = charge.status === "VOID" || charge.status === "REFUNDED";
            const isPartiallyPaid = !isPaid && charge.payments.length > 0 && !isVoid;
            const isPending = !isPaid && !isPartiallyPaid && !isVoid && (charge.status === "PENDING" || charge.status === "OVERDUE");
            const remaining = netAmount - charge.paidAmountCents;
            // PAID charges where less was paid than the net (partial payment → saldo restante flow)
            const wasPaidPartially = isPaid && charge.paidAmountCents > 0 && charge.paidAmountCents < netAmount;
            // For overdue display: treat PENDING past-due as overdue
            const isOverdue = charge.status === "OVERDUE" || (charge.status === "PENDING" && new Date(charge.dueDate) < new Date(new Date().toDateString()));
            const displayStatus = isOverdue && charge.status === "PENDING" ? "OVERDUE" : charge.status;
            const showPartialForm = partialFormId === charge.id;
            return (
              <div key={charge.id} className="bg-white rounded-xl border p-3 sm:p-4 min-h-[80px]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{charge.patient.fullName}</span>
                      <Badge variant={statusVariant[displayStatus] ?? "secondary"} className="text-xs">
                        {chargeStatusLabel(displayStatus)}
                      </Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-500 mt-1">
                      Vencimento: {formatDate(charge.dueDate)}
                      {charge.description && <span className="hidden sm:inline"> · {charge.description}</span>}
                    </div>
                    {charge.payments.length > 0 && (
                      <div className="text-xs text-green-600 mt-0.5">
                        Recebido: {formatCurrency(charge.paidAmountCents)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 flex-shrink-0">
                    {/* Amount display */}
                    {isPartiallyPaid || wasPaidPartially ? (
                      <div className="text-right">
                        <span className="font-bold text-green-700 text-sm">{formatCurrency(charge.paidAmountCents)}</span>
                        <span className="text-xs text-gray-400 block">
                          de {formatCurrency(netAmount)}
                        </span>
                      </div>
                    ) : (
                      <span className="font-bold text-gray-900 text-sm">{formatCurrency(netAmount)}</span>
                    )}
                    {/* Actions for pending charges (no payments yet) — collapsed on mobile */}
                    {isPending && !showPartialForm && (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        <select
                          className="text-xs border rounded-md px-2 py-2 h-9 sm:h-8 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                          value={payMethodMap[charge.id] ?? "PIX"}
                          onChange={(e) => setPayMethodMap((m) => ({ ...m, [charge.id]: e.target.value }))}
                          disabled={payingId === charge.id}
                          title="Forma de pagamento"
                        >
                          <option value="PIX">PIX</option>
                          <option value="CASH">Dinheiro</option>
                          <option value="CARD">Cartão</option>
                          <option value="TRANSFER">Transferência</option>
                          <option value="INSURANCE">Convênio</option>
                          <option value="OTHER">Outro</option>
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-700 border-green-300 text-xs sm:text-sm w-full sm:w-auto"
                          loading={payingId === charge.id}
                          onClick={() => markPaid(charge.id, netAmount - charge.paidAmountCents)}
                        >
                          <CreditCard className="h-3 w-3" />
                          <span className="hidden sm:inline">Marcar pago</span>
                          <span className="sm:hidden">Pago</span>
                        </Button>
                      </div>
                    )}
                    {/* Actions for partially paid charges */}
                    {isPartiallyPaid && !showPartialForm && (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        <select
                          className="text-xs border rounded-md px-2 py-2 h-9 sm:h-8 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                          value={payMethodMap[charge.id] ?? "PIX"}
                          onChange={(e) => setPayMethodMap((m) => ({ ...m, [charge.id]: e.target.value }))}
                          disabled={payingId === charge.id}
                          title="Forma de pagamento"
                        >
                          <option value="PIX">PIX</option>
                          <option value="CASH">Dinheiro</option>
                          <option value="CARD">Cartão</option>
                          <option value="TRANSFER">Transferência</option>
                          <option value="INSURANCE">Convênio</option>
                          <option value="OTHER">Outro</option>
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-orange-700 border-orange-300 text-xs sm:text-sm w-full sm:w-auto"
                          loading={payingId === charge.id}
                          onClick={() => markPaid(charge.id, remaining)}
                        >
                          <CreditCard className="h-3 w-3" />
                          <span className="hidden sm:inline">Pagar resto</span>
                          <span className="sm:hidden">Pagar</span>
                        </Button>
                      </div>
                    )}
                    {isPaid && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </div>
                {/* Inline partial payment form */}
                {showPartialForm && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <select
                      className="text-xs border rounded-md px-2 py-1 h-8 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={payMethodMap[charge.id] ?? "PIX"}
                      onChange={(e) => setPayMethodMap((m) => ({ ...m, [charge.id]: e.target.value }))}
                      disabled={payingId === charge.id}
                    >
                      <option value="PIX">PIX</option>
                      <option value="CASH">Dinheiro</option>
                      <option value="CARD">Cartão</option>
                      <option value="TRANSFER">Transferência</option>
                      <option value="INSURANCE">Convênio</option>
                      <option value="OTHER">Outro</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={(remaining / 100).toFixed(2).replace(".", ",")}
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                        className="w-24 border rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-700 border-blue-300"
                      loading={payingId === charge.id}
                      onClick={() => {
                        const cents = Math.round(parseFloat((partialAmount || "0").replace(",", ".")) * 100);
                        if (cents <= 0 || cents > remaining) {
                          toast({ title: `Valor deve ser entre R$ 0,01 e ${formatCurrency(remaining)}`, variant: "destructive" });
                          return;
                        }
                        markPaid(charge.id, cents);
                        setPartialFormId(null);
                      }}
                    >
                      <CreditCard className="h-3 w-3" />
                      Confirmar
                    </Button>
                    <button
                      onClick={() => setPartialFormId(null)}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <span className="text-xs text-gray-500 ml-auto">
                      Pendente: {formatCurrency(remaining)}
                    </span>
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
