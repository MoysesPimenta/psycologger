"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
      const res = await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId, amountCents, method }),
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

      {/* Summary bar */}
      {!loading && charges.length > 0 && (
        <div className="flex items-center gap-4 bg-white rounded-xl border px-4 py-3 flex-wrap">
          <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Recebido</span>
              <span className="text-sm font-bold text-green-700">{formatCurrency(summary.totalPaid)}</span>
            </div>
          )}
          {filter === "" && summary.totalRemaining > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">A receber</span>
              <span className="text-sm font-bold text-yellow-700">{formatCurrency(summary.totalRemaining)}</span>
            </div>
          )}
          <span className="text-xs text-gray-400 ml-auto">{summary.count} cobrança{summary.count !== 1 ? "s" : ""}</span>
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
        <div className="space-y-2">
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
              <div key={charge.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{charge.patient.fullName}</span>
                      <Badge variant={statusVariant[displayStatus] ?? "secondary"} className="text-xs">
                        {chargeStatusLabel(displayStatus)}
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
                    {/* Amount display */}
                    {isPartiallyPaid || wasPaidPartially ? (
                      <div className="text-right">
                        <span className="font-bold text-green-700">{formatCurrency(charge.paidAmountCents)}</span>
                        <span className="text-xs text-gray-400 block">
                          de {formatCurrency(netAmount)}
                          {remaining > 0 && ` · resta ${formatCurrency(remaining)}`}
                        </span>
                      </div>
                    ) : (
                      <span className="font-bold text-gray-900">{formatCurrency(netAmount)}</span>
                    )}
                    {/* Actions for pending charges (no payments yet) */}
                    {isPending && !showPartialForm && (
                      <div className="flex items-center gap-1.5">
                        <select
                          className="text-xs border rounded-md px-2 py-1 h-8 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
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
                          className="text-green-700 border-green-300"
                          loading={payingId === charge.id}
                          onClick={() => markPaid(charge.id, netAmount - charge.paidAmountCents)}
                        >
                          <CreditCard className="h-3 w-3" />
                          Marcar pago
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-700 border-blue-300"
                          onClick={() => {
                            setPartialFormId(charge.id);
                            setPartialAmount("");
                          }}
                        >
                          <SplitSquareHorizontal className="h-3 w-3" />
                          Pagamento parcial
                        </Button>
                      </div>
                    )}
                    {/* Actions for partially paid charges */}
                    {isPartiallyPaid && !showPartialForm && (
                      <div className="flex items-center gap-1.5">
                        <select
                          className="text-xs border rounded-md px-2 py-1 h-8 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
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
                          className="text-orange-700 border-orange-300"
                          loading={payingId === charge.id}
                          onClick={() => markPaid(charge.id, remaining)}
                        >
                          <CreditCard className="h-3 w-3" />
                          Pagar resto
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-700 border-blue-300"
                          onClick={() => {
                            setPartialFormId(charge.id);
                            setPartialAmount("");
                          }}
                        >
                          <SplitSquareHorizontal className="h-3 w-3" />
                          Pagamento parcial
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
