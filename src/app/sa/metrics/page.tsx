import { requireSuperAdmin } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { TrendingUp, AlertTriangle } from "lucide-react";
import {
  computeSaasMetrics,
  getRecentBillingEvents,
  computeHistoricalSeries,
  listDelinquentTenants,
} from "@/lib/sa-metrics";

export const metadata = { title: "Métricas — SuperAdmin" };
export const dynamic = "force-dynamic";

const fmtBrlCents = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const fmtUsdCents = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

export default async function SAMetricsPage() {
  await requireSuperAdmin();
  const t = await getTranslations("sa");

  // Call each metric query in isolation so one failure surfaces with a
  // pinpoint log entry instead of bubbling a generic server-components error.
  async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[sa_metrics] ${label} failed:`, err);
      return fallback;
    }
  }

  const emptyMetrics = {
    tenantCount: 0, userCount: 0, patientCount: 0,
    freeCount: 0, proCount: 0, clinicCount: 0,
    activeSubscribers: 0, paidSubscribers: 0, trialingCount: 0,
    pastDueCount: 0, graceCount: 0, canceledAtPeriodEndCount: 0,
    mrrCents: 0, arrCents: 0, mrrUsdCents: 0, arpaCents: 0,
    newPaidThisMonth: 0, canceledPaidThisMonth: 0,
    reactivationsThisMonth: 0, trialToPaidThisMonth: 0, netNewPaidThisMonth: 0,
    monthlyChurnRate: null as number | null, monthlyGrossChurnCents: 0,
    ltvCents: null as number | null, cac: null as number | null,
    webhookErrors24h: 0, overQuotaTenantCount: 0,
    emailBounces24h: 0, emailComplaints24h: 0, emailBounces7d: 0, emailComplaints7d: 0,
  };

  const [metrics, recentBilling, series, delinquent] = await Promise.all([
    safe("computeSaasMetrics", computeSaasMetrics, emptyMetrics),
    safe("getRecentBillingEvents", () => getRecentBillingEvents(20), [] as Awaited<ReturnType<typeof getRecentBillingEvents>>),
    safe("computeHistoricalSeries", () => computeHistoricalSeries(12), [] as Awaited<ReturnType<typeof computeHistoricalSeries>>),
    safe("listDelinquentTenants", () => listDelinquentTenants(25), [] as Awaited<ReturnType<typeof listDelinquentTenants>>),
  ]);

  // Simple sparkline: pick MRR series scaled to 100px height.
  const maxMrr = Math.max(1, ...series.map((p) => p.mrrCents));
  const sparkPoints = series
    .map((p, i) => {
      const x = (i / Math.max(1, series.length - 1)) * 600;
      const y = 100 - (p.mrrCents / maxMrr) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("metrics.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
          {t("metrics.description")}
        </p>
      </div>

      {/* Top KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label={t("metrics.mrr")} value={fmtBrlCents(metrics.mrrCents)} footer={`≈ ${fmtUsdCents(metrics.mrrUsdCents)}`} />
        <Kpi label={t("metrics.arr")} value={fmtBrlCents(metrics.arrCents)} footer="12 meses" />
        <Kpi label={t("metrics.paidSubscribers")} value={String(metrics.paidSubscribers)} footer={`${metrics.activeSubscribers} ${t("metrics.inclTrials")}`} />
        <Kpi label={t("metrics.arpa")} value={fmtBrlCents(metrics.arpaCents)} footer="por conta paga" />
      </div>

      {/* Plan mix row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label={t("metrics.free")} value={String(metrics.freeCount)} />
        <Kpi label={t("metrics.pro")} value={String(metrics.proCount)} />
        <Kpi label={t("metrics.clinic")} value={String(metrics.clinicCount)} />
        <Kpi label={t("metrics.trialing")} value={String(metrics.trialingCount)} />
        <Kpi
          label={t("metrics.pastDueGrace")}
          value={`${metrics.pastDueCount} / ${metrics.graceCount}`}
          tone={metrics.pastDueCount > 0 ? "warn" : "default"}
        />
      </div>

      {/* Email delivery health row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label={t("metrics.emailBounces")}
          value={`${metrics.emailBounces24h} / ${metrics.emailBounces7d}`}
          footer="24h / 7d"
          tone={metrics.emailBounces24h > 0 ? "warn" : "default"}
        />
        <Kpi
          label={t("metrics.emailComplaints")}
          value={`${metrics.emailComplaints24h} / ${metrics.emailComplaints7d}`}
          footer="24h / 7d"
          tone={metrics.emailComplaints24h > 0 ? "danger" : "default"}
        />
      </div>

      {/* Retention row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Kpi
          label={t("metrics.monthlyChurn")}
          value={metrics.monthlyChurnRate !== null ? `${metrics.monthlyChurnRate.toFixed(1)}%` : "—"}
          footer={metrics.monthlyChurnRate === null ? t("metrics.noBase") : `${metrics.canceledPaidThisMonth} ${t("metrics.canceled")}`}
        />
        <Kpi
          label={t("metrics.grossLoss")}
          value={fmtBrlCents(metrics.monthlyGrossChurnCents)}
          footer={t("metrics.grossLossFormula")}
        />
        <Kpi
          label={t("metrics.ltv")}
          value={metrics.ltvCents !== null ? fmtBrlCents(metrics.ltvCents) : "—"}
          footer={t("metrics.ltvFormula")}
        />
        <Kpi
          label={t("metrics.newMonth")}
          value={String(metrics.newPaidThisMonth + metrics.reactivationsThisMonth + metrics.trialToPaidThisMonth)}
          footer={`${metrics.newPaidThisMonth} ${t("metrics.new")} + ${metrics.reactivationsThisMonth} ${t("metrics.reactivated")} + ${metrics.trialToPaidThisMonth} ${t("metrics.trialToPaid")}`}
        />
        <Kpi
          label={t("metrics.netNewPaid")}
          value={String(metrics.netNewPaidThisMonth)}
          footer={t("metrics.thisMonth")}
          tone={metrics.netNewPaidThisMonth < 0 ? "warn" : "default"}
        />
      </div>

      {/* MRR sparkline */}
      <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand-400" />
            {t("metrics.mrrLast12")}
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">{t("metrics.reconstructed")}</span>
        </div>
        <svg viewBox="0 0 600 110" className="w-full h-32">
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-brand-400"
            points={sparkPoints}
          />
        </svg>
        <div className="mt-4 grid grid-cols-12 gap-1 text-[10px] text-gray-500 dark:text-gray-400">
          {series.map((p) => (
            <div key={p.month} className="text-center">
              <div>{p.label}</div>
              <div className="text-gray-500 dark:text-gray-500">{fmtBrlCents(p.mrrCents)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Delinquent */}
      <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            {t("metrics.delinquent", { count: delinquent.length })}
          </h2>
        </div>
        {delinquent.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("metrics.noDelinquent")} 🎉</p>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {delinquent.map((dt) => (
              <Link
                key={dt.id}
                href={`/sa/tenants/${dt.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-800/50 text-sm"
              >
                <div>
                  <p className="font-medium">{dt.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-500">
                    {dt.slug} · {dt.planTier} · {dt.subscriptionStatus}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-600 dark:text-gray-500">
                  {dt.graceUntil && <div>{t("metrics.graceUntil", { date: new Date(dt.graceUntil).toLocaleDateString("pt-BR") })}</div>}
                  <div>
                    {dt._count.memberships} {t("metrics.members")} · {dt._count.patients} {t("metrics.patients")}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent billing events */}
      <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold">{t("metrics.billingActivity")}</h2>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
          {recentBilling.length === 0 ? (
            <p className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">{t("metrics.noRecentEvents")}</p>
          ) : (
            recentBilling.map((event) => (
              <div key={event.id} className="p-4 text-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{event.action.replace("BILLING_", "")}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-500 mt-0.5">
                      {new Date(event.createdAt).toLocaleString("pt-BR")}
                      {event.user?.email ? ` · ${event.user.email}` : ""}
                    </p>
                  </div>
                  {event.summaryJson ? (
                    <details className="text-xs text-gray-500 dark:text-gray-400">
                      <summary className="cursor-pointer">json</summary>
                      <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded mt-1 overflow-auto max-w-md">
                        {JSON.stringify(event.summaryJson, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  footer,
  tone = "default",
}: {
  label: string;
  value: string;
  footer?: string;
  tone?: "default" | "warn" | "danger";
}) {
  const borderClass =
    tone === "danger"
      ? "border-red-600"
      : tone === "warn"
        ? "border-yellow-600"
        : "border-gray-200 dark:border-gray-700";
  const valueClass =
    tone === "danger"
      ? "text-red-400"
      : tone === "warn"
        ? "text-yellow-400"
        : "";
  return (
    <div className={`bg-gray-50 dark:bg-gray-950 border ${borderClass} rounded-xl p-5`}>
      <p className="text-gray-600 dark:text-gray-500 text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${valueClass}`}>{value}</p>
      {footer && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{footer}</p>}
    </div>
  );
}
