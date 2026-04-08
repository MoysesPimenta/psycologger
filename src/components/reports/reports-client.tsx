"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Download, BarChart3, TrendingUp, DollarSign, Clock,
  Users, AlertCircle, Calendar, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyData {
  period: { year: number; month: number };
  summary: {
    totalCharged: number;
    totalReceived_competencia: number;
    totalPending: number;
    totalOverdue: number;
    totalCaixa: number;
    completedAppointments: number;
    chargesCount: number;
    newPatients: number;
  };
  apptStats: {
    total: number;
    completed: number;
    canceled: number;
    noShow: number;
    scheduled: number;
  };
  byProvider: { name: string; received: number; sessions: number; pending: number }[];
  byMethod: Record<string, number>;
}

interface CashflowMonth {
  month: string;
  year: number;
  monthNum: number;
  competencia: number;
  caixa: number;
  sessions: number;
}

interface PrevisibilityData {
  upcoming: { month: string; monthShort: string; expected: number; count: number }[];
  overdue: { total: number; count: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// ─── Helper: simple bar ───────────────────────────────────────────────────────

function MiniBar({ value, max, color = "bg-brand-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color = "text-gray-900", bg = "bg-white",
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color?: string; bg?: string;
}) {
  return (
    <div className={`${bg} rounded-xl border p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "cashflow" | "previsibility" | "export";

// ─── Main component ───────────────────────────────────────────────────────────

export function ReportsClient() {
  const t = useTranslations("reports");
  const tCharges = useTranslations("charges");
  const locale = useLocale();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>("dashboard");

  // Helper to get locale-aware month name
  const getMonthName = (monthNum: number) => {
    return new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(year, monthNum - 1, 1)
    );
  };

  // Helper to get payment method label
  const getPaymentMethodLabel = (method: string): string => {
    const methodMap: Record<string, string> = {
      PIX: tCharges("pix"),
      CASH: tCharges("cash"),
      CARD: tCharges("card"),
      TRANSFER: tCharges("transfer"),
      INSURANCE: tCharges("insurance"),
      OTHER: tCharges("other"),
    };
    return methodMap[method] ?? method;
  };

  const [dashData, setDashData] = useState<MonthlyData | null>(null);
  const [cashflow, setCashflow] = useState<CashflowMonth[]>([]);
  const [previsibility, setPrevisibility] = useState<PrevisibilityData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/reports?type=dashboard&year=${year}&month=${month}`);
      if (res.ok) {
        const json = await res.json();
        setDashData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadCashflow = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/reports?type=cashflow&year=${year}&month=${month}&months=6`);
      if (res.ok) {
        const json = await res.json();
        setCashflow(json.data?.cashflow ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadPrevisibility = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/reports?type=previsibility`);
      if (res.ok) {
        const json = await res.json();
        setPrevisibility(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "dashboard") loadDashboard();
    else if (tab === "cashflow") loadCashflow();
    else if (tab === "previsibility") loadPrevisibility();
  }, [tab, year, month, loadDashboard, loadCashflow, loadPrevisibility]);

  async function exportCsv(type: string) {
    const extra = type === "monthly" ? `&year=${year}&month=${month}` : "";
    const res = await fetch(`/api/v1/reports?type=${type}&export=true${extra}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${type}-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabLabels: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: t("tabDashboard"), icon: BarChart3 },
    { id: "cashflow", label: t("tabCashflow"), icon: TrendingUp },
    { id: "previsibility", label: t("tabPrevisibility"), icon: Clock },
    { id: "export", label: t("tabExport"), icon: Download },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-white border rounded-xl p-3 sm:p-4">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border rounded-md px-3 py-2 text-sm h-10"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{getMonthName(m)}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded-md px-3 py-2 text-sm h-10"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <p className="text-xs sm:text-sm text-gray-500 sm:ml-auto">
          Dados de {getMonthName(month)} {year}
        </p>
      </div>

      {/* Tabs — icons only on mobile */}
      <div className="flex border-b gap-1 overflow-x-auto scrollbar-thin">
        {tabLabels.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-2 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] ${
              tab === id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            title={label}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ── */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-xl border p-4 animate-pulse h-24" />
              ))}
            </div>
          ) : dashData ? (
            <>
              {/* Caixa vs Competência */}
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-brand-600" />
                  {t("financialSectionTitle")} — {getMonthName(month)} {year}
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                  <StatCard
                    label={t("chargedLabel")}
                    value={formatCurrency(dashData.summary.totalCharged)}
                    sub={`${dashData.summary.chargesCount} ${t("chargesCount")}`}
                    icon={DollarSign}
                    color="text-gray-900"
                  />
                  <StatCard
                    label={t("receivedLabel")}
                    value={formatCurrency(dashData.summary.totalCaixa)}
                    sub={t("receivedSub")}
                    icon={ArrowUpRight}
                    color="text-green-600"
                  />
                  <StatCard
                    label={t("pendingLabel")}
                    value={formatCurrency(dashData.summary.totalPending)}
                    sub={t("pendingSub")}
                    icon={Clock}
                    color="text-yellow-600"
                  />
                  {dashData.summary.totalOverdue > 0 && (
                    <StatCard
                      label={t("overdueLabel")}
                      value={formatCurrency(dashData.summary.totalOverdue)}
                      sub={t("overdueSub")}
                      icon={AlertCircle}
                      color="text-red-600"
                      bg="bg-red-50"
                    />
                  )}
                  {dashData.summary.totalOverdue === 0 && (
                    <StatCard
                      label={t("newPatientsLabel")}
                      value={String(dashData.summary.newPatients)}
                      sub={t("newPatientsSub")}
                      icon={Users}
                      color="text-brand-600"
                    />
                  )}
                </div>

                {/* Caixa vs Competência explanation */}
                <div className="mt-3 rounded-lg bg-gray-50 border p-3 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">{t("cashBasisLabel")}</p>
                    <p className="font-bold text-green-700">{formatCurrency(dashData.summary.totalCaixa)}</p>
                    <p className="text-xs text-gray-400">{t("cashBasisDesc")} {getMonthName(month)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">{t("accrualBasisLabel")}</p>
                    <p className="font-bold text-gray-900">{formatCurrency(dashData.summary.totalCharged)}</p>
                    <p className="text-xs text-gray-400">{t("accrualBasisDesc")} {getMonthName(month)}</p>
                  </div>
                </div>
              </div>

              {/* Appointment stats */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-brand-600" />
                  {t("appointmentsSectionTitle")}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label={t("appointmentsTotal")} value={String(dashData.apptStats.total)} icon={Calendar} />
                  <StatCard label={t("appointmentsCompleted")} value={String(dashData.apptStats.completed)} icon={ArrowUpRight} color="text-green-600" />
                  <StatCard label={t("appointmentsCanceled")} value={String(dashData.apptStats.canceled)} icon={ArrowDownRight} color="text-red-500" />
                  <StatCard label={t("appointmentsNoShow")} value={String(dashData.apptStats.noShow)} icon={AlertCircle} color="text-orange-500" />
                </div>
              </div>

              {/* By provider */}
              {dashData.byProvider.length > 0 && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 text-sm">
                    <BarChart3 className="h-4 w-4 text-brand-600" />
                    {t("revenueByProvider")}
                  </h3>
                  <div className="space-y-4">
                    {dashData.byProvider
                      .sort((a, b) => b.received - a.received)
                      .map((p) => {
                        const maxVal = Math.max(...dashData.byProvider.map((x) => x.received + x.pending));
                        return (
                          <div key={p.name} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <div>
                                <p className="font-medium text-gray-900">{p.name}</p>
                                <p className="text-xs text-gray-500">{p.sessions} {t("paidSessions")}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-green-700">{formatCurrency(p.received)}</p>
                                {p.pending > 0 && (
                                  <p className="text-xs text-yellow-600">+ {formatCurrency(p.pending)} {t("pendingAmount")}</p>
                                )}
                              </div>
                            </div>
                            <MiniBar value={p.received} max={maxVal} color="bg-green-500" />
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* By payment method */}
              {Object.keys(dashData.byMethod).length > 0 && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-semibold text-gray-900 mb-4 text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-brand-600" />
                    {t("paymentMethods")}
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(dashData.byMethod)
                      .sort(([, a], [, b]) => b - a)
                      .map(([method, amount]) => {
                        const total = Object.values(dashData.byMethod).reduce((s, v) => s + v, 0);
                        const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
                        return (
                          <div key={method} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-700">{getPaymentMethodLabel(method)}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">{pct}%</span>
                                <span className="font-medium">{formatCurrency(amount)}</span>
                              </div>
                            </div>
                            <MiniBar value={amount} max={total} color="bg-brand-500" />
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ── Cash flow tab ── */}
      {tab === "cashflow" && (
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white rounded-xl border p-5 animate-pulse h-64" />
          ) : cashflow.length > 0 ? (
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand-600" />
                {t("last6Months")}
              </h3>

              {/* Chart-like bar display */}
              <div className="space-y-4">
                {(() => {
                  const maxVal = Math.max(...cashflow.map((m) => Math.max(m.competencia, m.caixa)));
                  return cashflow.map((m) => (
                    <div key={m.month} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="font-medium w-16">{m.month}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-gray-700">{m.sessions} {t("cashflowSessions")}</span>
                          <span className="text-green-700 font-medium">{t("cashflowCash")}: {formatCurrency(m.caixa)}</span>
                          <span className="text-gray-600">{t("cashflowAccrual")}: {formatCurrency(m.competencia)}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-20">{t("cashflowCash")}</span>
                          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: maxVal > 0 ? `${(m.caixa / maxVal) * 100}%` : "0%" }}
                            />
                          </div>
                          <span className="text-xs font-medium w-24 text-right">{formatCurrency(m.caixa)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-20">{t("cashflowAccrual")}</span>
                          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-400 rounded-full"
                              style={{ width: maxVal > 0 ? `${(m.competencia / maxVal) * 100}%` : "0%" }}
                            />
                          </div>
                          <span className="text-xs font-medium w-24 text-right">{formatCurrency(m.competencia)}</span>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 pt-2 border-t text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                  {t("cashflowLegendCash")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-brand-400 inline-block" />
                  {t("cashflowLegendAccrual")}
                </span>
              </div>

              {/* Summary table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="text-left py-2 font-medium">{t("cashflowMonth")}</th>
                      <th className="text-right py-2 font-medium">{t("cashflowSessions")}</th>
                      <th className="text-right py-2 font-medium">{t("cashflowCash")}</th>
                      <th className="text-right py-2 font-medium">{t("cashflowAccrual")}</th>
                      <th className="text-right py-2 font-medium">{t("cashflowDifference")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashflow.map((m) => (
                      <tr key={m.month} className="border-b last:border-0">
                        <td className="py-2 font-medium text-gray-700">{m.month}</td>
                        <td className="py-2 text-right text-gray-600">{m.sessions}</td>
                        <td className="py-2 text-right text-green-700 font-medium">{formatCurrency(m.caixa)}</td>
                        <td className="py-2 text-right text-gray-700">{formatCurrency(m.competencia)}</td>
                        <td className={`py-2 text-right font-medium ${m.caixa >= m.competencia ? "text-green-600" : "text-orange-600"}`}>
                          {m.caixa >= m.competencia ? "+" : ""}{formatCurrency(m.caixa - m.competencia)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-gray-900 border-t-2">
                      <td className="py-2">{t("cashflowTotal")}</td>
                      <td className="py-2 text-right">{cashflow.reduce((s, m) => s + m.sessions, 0)}</td>
                      <td className="py-2 text-right text-green-700">{formatCurrency(cashflow.reduce((s, m) => s + m.caixa, 0))}</td>
                      <td className="py-2 text-right">{formatCurrency(cashflow.reduce((s, m) => s + m.competencia, 0))}</td>
                      <td className="py-2 text-right" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">{t("noData")}</p>
          )}
        </div>
      )}

      {/* ── Previsibility tab ── */}
      {tab === "previsibility" && (
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white rounded-xl border p-5 animate-pulse h-40" />
          ) : previsibility ? (
            <>
              {/* Overdue */}
              {previsibility.overdue.total > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <h3 className="font-semibold text-red-800">{t("overdueCharges")}</h3>
                      <p className="text-sm text-red-700 mt-1">
                        {previsibility.overdue.count} {previsibility.overdue.count === 1 ? t("overdueChargesCount") : t("overdueChargesCountPlural")} {t("overdueChargesNote")} —{" "}
                        <span className="font-bold">{formatCurrency(previsibility.overdue.total)}</span> {t("overdueAmount")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Upcoming months */}
              <div className="bg-white rounded-xl border p-5 space-y-4">
                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-600" />
                  {t("previsibilityTitle")}
                </h3>
                <div className="space-y-4">
                  {previsibility.upcoming.map((m) => {
                    const maxVal = Math.max(...previsibility.upcoming.map((x) => x.expected));
                    return (
                      <div key={m.month} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <p className="font-medium text-gray-900">{m.month}</p>
                            <p className="text-xs text-gray-500">{m.count} {t("previsibilityPending")}</p>
                          </div>
                          <p className="font-bold text-brand-700">{formatCurrency(m.expected)}</p>
                        </div>
                        <MiniBar value={m.expected} max={maxVal} color="bg-brand-500" />
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 pt-2 border-t">
                  {t("previsibilityNote")}
                </p>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-center py-8">{t("noData")}</p>
          )}
        </div>
      )}

      {/* ── Export tab ── */}
      {tab === "export" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 text-sm">{t("exportSectionTitle")}</h3>

            {[
              { label: t("exportMonthlyLabel"), type: "monthly", desc: `${t("exportMonthlyDesc")} ${getMonthName(month)} ${year}` },
              { label: t("exportAllChargesLabel"), type: "charges", desc: t("exportAllChargesDesc") },
              { label: t("exportPatientsLabel"), type: "patients", desc: t("exportPatientsDesc") },
              { label: t("exportAppointmentsLabel"), type: "appointments", desc: t("exportAppointmentsDesc") },
            ].map((item) => (
              <div key={item.type} className="flex items-center justify-between py-3 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportCsv(item.type)} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
