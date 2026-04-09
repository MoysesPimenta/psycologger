import { requireSuperAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Building2, Users, ArrowRight, BarChart3, FileText, Activity } from "lucide-react";
import { computeSaasMetrics } from "@/lib/sa-metrics";

export const metadata = { title: "SuperAdmin" };

export default async function SADashboardPage() {
  const t = await getTranslations("sa");
  await requireSuperAdmin();

  const [tenantCount, userCount, recentTenants, metrics, patientCount, webhookErrors] = await Promise.all([
    db.tenant.count(),
    db.user.count(),
    db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { _count: { select: { memberships: true, patients: true } } },
    }),
    computeSaasMetrics(),
    db.patient.count(),
    db.auditLog.count({
      where: {
        action: "BILLING_WEBHOOK_FAILED",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">{t("dashboard.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t("dashboard.subtitle")}</p>
        </div>

        {/* Health widget */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-brand-400 dark:text-brand-400" />
            {t("dashboard.systemHealth")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600 dark:text-gray-400">{t("dashboard.clinics")}</p>
              <p className="text-2xl font-bold mt-1">{tenantCount}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">{t("dashboard.users")}</p>
              <p className="text-2xl font-bold mt-1">{userCount}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">{t("dashboard.patients")}</p>
              <p className="text-2xl font-bold mt-1">{patientCount}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">{t("dashboard.mrr")}</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(metrics.mrrCents)}</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">{t("dashboard.activeSubscribers")}</p>
              <p className="text-2xl font-bold mt-1">{metrics.activeSubscribers}</p>
            </div>
            <div className={webhookErrors > 0 ? "text-red-600 dark:text-red-400" : ""}>
              <p className={webhookErrors > 0 ? "text-red-600 dark:text-red-300" : "text-gray-600 dark:text-gray-400"}>
                {t("dashboard.webhookErrors")}
              </p>
              <p className="text-2xl font-bold mt-1">{webhookErrors}</p>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <p className="text-gray-600 dark:text-gray-400 text-xs">{t("dashboard.clinics")}</p>
            <p className="text-4xl font-bold mt-1">{tenantCount}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <p className="text-gray-600 dark:text-gray-400 text-xs">{t("dashboard.users")}</p>
            <p className="text-4xl font-bold mt-1">{userCount}</p>
          </div>
        </div>

        {/* Recent tenants */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
            <h2 className="font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand-400 dark:text-brand-400" />
              {t("dashboard.recentClinics")}
            </h2>
            <Link href="/sa/tenants" className="text-sm text-brand-400 dark:text-brand-400 hover:text-brand-300 dark:hover:text-brand-300">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {recentTenants.map((tenant) => (
              <Link
                key={tenant.id}
                href={`/sa/tenants/${tenant.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors group"
              >
                <div>
                  <p className="font-medium">{tenant.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {tenant._count.memberships} {t("dashboard.members")} · {tenant._count.patients} {t("dashboard.patients")}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-500 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-300" />
              </Link>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">{t("dashboard.shortcuts")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Link
              href="/sa/metrics"
              className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors text-sm"
            >
              <BarChart3 className="h-4 w-4 text-brand-400 dark:text-brand-400" />
              {t("dashboard.metricsLink")}
            </Link>
            <Link
              href="/sa/tenants"
              className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors text-sm"
            >
              <Building2 className="h-4 w-4 text-brand-400 dark:text-brand-400" />
              {t("dashboard.clinics")}
            </Link>
            <Link
              href="/sa/users"
              className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors text-sm"
            >
              <Users className="h-4 w-4 text-brand-400 dark:text-brand-400" />
              {t("dashboard.users")}
            </Link>
            <Link
              href="/sa/audit"
              className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors text-sm"
            >
              <FileText className="h-4 w-4 text-brand-400 dark:text-brand-400" />
              {t("dashboard.audit")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
