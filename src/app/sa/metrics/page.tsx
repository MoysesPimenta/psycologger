import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { computeSaasMetrics, getRecentBillingEvents, computeHistoricalMrr, computeHistoricalActiveSubscribers } from "@/lib/sa-metrics";

export const metadata = { title: "Métricas — SuperAdmin" };
export const dynamic = "force-dynamic";

export default async function SAMetricsPage() {
  await requireSuperAdmin();

  const [metrics, recentBilling, mrrHistory, subscriberHistory] = await Promise.all([
    computeSaasMetrics(),
    getRecentBillingEvents(20),
    computeHistoricalMrr(),
    computeHistoricalActiveSubscribers(),
  ]);

  const formatCurrency = (cents: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Métricas SaaS</h1>
            <p className="text-gray-400 text-sm mt-1">Performance e receita da plataforma</p>
          </div>
        </div>

        {/* Key metrics cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* MRR */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">MRR</p>
            <p className="text-3xl font-bold mt-2">{formatCurrency(metrics.mrrBrl * 100)}</p>
            <p className="text-xs text-gray-500 mt-1">≈ ${formatCurrency(metrics.mrrUsd * 100)}</p>
          </div>

          {/* ARR */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">ARR</p>
            <p className="text-3xl font-bold mt-2">{formatCurrency(metrics.arr * 100)}</p>
            <p className="text-xs text-gray-500 mt-1">12 meses</p>
          </div>

          {/* Active subscribers */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Assinantes ativos</p>
            <p className="text-3xl font-bold mt-2">{metrics.activeSubscribers}</p>
            <p className="text-xs text-gray-500 mt-1">ACTIVE + TRIALING</p>
          </div>

          {/* ARPA */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">ARPA</p>
            <p className="text-3xl font-bold mt-2">{formatCurrency(metrics.arpa * 100)}</p>
            <p className="text-xs text-gray-500 mt-1">por conta</p>
          </div>
        </div>

        {/* Secondary metrics grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Plan distribution */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Clínicas FREE</p>
            <p className="text-2xl font-bold mt-2">{metrics.freeCount}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Clínicas PRO</p>
            <p className="text-2xl font-bold mt-2">{metrics.proCount}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Clínicas CLINIC</p>
            <p className="text-2xl font-bold mt-2">{metrics.clinicCount}</p>
          </div>

          <div className={`bg-gray-900 border ${metrics.pastDueCount > 0 ? "border-yellow-600" : "border-gray-800"} rounded-xl p-6`}>
            <p className="text-gray-400 text-sm">Past-due / Grace</p>
            <p className={`text-2xl font-bold mt-2 ${metrics.pastDueCount > 0 ? "text-yellow-400" : ""}`}>
              {metrics.pastDueCount} / {metrics.graceCount}
            </p>
          </div>
        </div>

        {/* Churn & LTV */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Churn (30 dias)</p>
            <p className="text-3xl font-bold mt-2">
              {metrics.churnRate !== null ? `${metrics.churnRate.toFixed(1)}%` : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {metrics.churnRate === null ? "Dados insuficientes" : "Canceladas neste mês"}
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">LTV</p>
            <p className="text-3xl font-bold mt-2">
              {metrics.ltv !== null ? formatCurrency(metrics.ltv * 100) : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {metrics.ltv === null ? "Churn insuficiente" : "Valor da vida útil"}
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Novo pago este mês</p>
            <p className="text-3xl font-bold mt-2">{metrics.netNewPaidThisMonth}</p>
            <p className="text-xs text-gray-500 mt-1">PRO + CLINIC líquido</p>
          </div>
        </div>

        {/* Recent billing activity */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-800">
            <h2 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-brand-400" />
              Atividade de billing (últimos 20)
            </h2>
          </div>
          <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
            {recentBilling.length > 0 ? (
              recentBilling.map((event) => (
                <div key={event.id} className="p-4 hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{event.action.replace("BILLING_", "")}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(event.createdAt).toLocaleString("pt-BR")}
                      </p>
                      {event.user && (
                        <p className="text-xs text-gray-500 mt-1">{event.user.email}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {event.summaryJson && (
                        <details className="text-xs text-gray-500 cursor-pointer group">
                          <summary className="group-open:hidden">Detalhes</summary>
                          <pre className="text-xs bg-gray-950 p-2 rounded mt-2 overflow-auto max-w-md">
                            {JSON.stringify(event.summaryJson, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="p-6 text-center text-gray-500 text-sm">Nenhuma atividade de billing</p>
            )}
          </div>
        </div>

        {/* TODO: Chart placeholders */}
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-6">
          <p className="text-blue-400 text-sm">
            <span className="font-semibold">TODO:</span> Gráficos de MRR e assinantes ativos (últimos 12 meses).
            Implementar usando dados históricos do audit log (BILLING_STATE_CHANGED).
          </p>
        </div>
      </div>
    </div>
  );
}
