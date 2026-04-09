import { requireSuperAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import {
  ArrowLeft, Users, Calendar, CreditCard, FileText, Clock, ShieldAlert,
} from "lucide-react";
import { TenantOpsPanel } from "@/components/sa/tenant-ops-panel";
import { getTenantQuotaUsage } from "@/lib/billing/limits";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const t = await getTranslations("sa");
  const tenant = await db.tenant.findUnique({ where: { id: params.id }, select: { name: true } });
  return { title: tenant ? `${tenant.name} — SuperAdmin` : t("tenantDetail.metaTitle") };
}

const fmt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR") : "—";

export default async function SATenantDetailPage({ params }: { params: { id: string } }) {
  await requireSuperAdmin();
  const t = await getTranslations("sa");

  const tenant = await db.tenant.findUnique({
    where: { id: params.id },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { patients: true, appointments: true, charges: true, clinicalSessions: true } },
    },
  });

  if (!tenant) notFound();

  const [quota, notes, activity] = await Promise.all([
    getTenantQuotaUsage(tenant.id),
    db.auditLog.findMany({
      where: { tenantId: tenant.id, action: "SA_INTERNAL_NOTE" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { email: true, name: true } } },
    }),
    db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        action: {
          in: [
            "SA_TENANT_SUSPEND",
            "SA_TENANT_REACTIVATE",
            "SA_PLAN_OVERRIDE",
            "IMPERSONATION_START",
            "IMPERSONATION_STOP",
            "BILLING_SUBSCRIPTION_CREATED",
            "BILLING_SUBSCRIPTION_CANCELED",
            "BILLING_SUBSCRIPTION_REACTIVATED",
            "BILLING_WEBHOOK_FAILED",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  const activeMembers = tenant.memberships.filter((m) => m.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sa/tenants" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {tenant.slug} · {t("tenantDetail.plan")} <span className="text-gray-900 dark:text-white font-medium">{tenant.planTier}</span>{" "}
            · {t("tenantDetail.status")}{" "}
            <span className={tenant.subscriptionStatus === "past_due" ? "text-yellow-400" : "text-gray-500 dark:text-gray-300"}>
              {tenant.subscriptionStatus ?? "—"}
            </span>{" "}
            · {t("tenantDetail.timezone")}: {tenant.timezone}
          </p>
        </div>
      </div>

      {/* Quota usage */}
      {(quota.patients.overQuota || quota.therapists.overQuota) && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-500 dark:text-red-400 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-700 dark:text-red-300">{t("tenantDetail.overLimit")}</p>
            <p className="text-red-600 dark:text-red-200/80 mt-1">
              {t("tenantDetail.patients")}: {quota.patients.current}/{String(quota.patients.limit)}
              {quota.patients.overQuota ? ` ${t("tenantDetail.exceeded")}` : ""} · {t("tenantDetail.therapists")}: {quota.therapists.current}/
              {String(quota.therapists.limit)}
              {quota.therapists.overQuota ? ` ${t("tenantDetail.exceeded")}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: t("tenantDetail.activePatients"), value: `${quota.patients.current}/${String(quota.patients.limit)}` },
          { icon: Calendar, label: t("tenantDetail.appointments"), value: tenant._count.appointments },
          { icon: CreditCard, label: t("tenantDetail.charges"), value: tenant._count.charges },
          { icon: FileText, label: t("tenantDetail.clinicalSessions"), value: tenant._count.clinicalSessions },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs mb-1">
              <Icon className="h-4 w-4" />
              {label}
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Two-column: info + ops panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Clinic info */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-2">
            <h2 className="font-semibold text-lg mb-3">{t("tenantDetail.clinicData")}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                [t("tenantDetail.cnpj"), tenant.cnpj],
                [t("tenantDetail.cpf"), tenant.cpf],
                [t("tenantDetail.phone"), tenant.phone],
                [t("tenantDetail.website"), tenant.website],
                [
                  t("tenantDetail.address"),
                  [tenant.addressLine, tenant.addressCity, tenant.addressState, tenant.addressZip]
                    .filter(Boolean)
                    .join(", "),
                ],
                [t("tenantDetail.createdAt"), new Date(tenant.createdAt).toLocaleDateString("pt-BR")],
                [t("tenantDetail.sharedPatients"), tenant.sharedPatientPool ? t("tenantDetail.yes") : t("tenantDetail.no")],
                [t("tenantDetail.adminViewsClinical"), tenant.adminCanViewClinical ? t("tenantDetail.yes") : t("tenantDetail.no")],
                [t("tenantDetail.stripeCustomer"), tenant.stripeCustomerId ?? "—"],
                [t("tenantDetail.stripeSubscription"), tenant.stripeSubscriptionId ?? "—"],
                [t("tenantDetail.periodEnd"), fmt(tenant.currentPeriodEnd)],
                [t("tenantDetail.graceUntil"), fmt(tenant.graceUntil)],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-gray-600 dark:text-gray-500 text-xs">{label}</p>
                  <p className="text-gray-900 dark:text-gray-200 break-all">{(value as string) || "—"}</p>
                </div>
              ))}
            </div>
            <div className="pt-2">
              <Link
                href={`/sa/tenants/${tenant.id}/billing`}
                className="text-xs text-brand-400 hover:text-brand-300"
              >
                {t("tenantDetail.viewBillingHistory")}
              </Link>
            </div>
          </div>

          {/* Members */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold">
                {t("tenantDetail.members", { count: tenant.memberships.length, active: activeMembers })}
              </h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {tenant.memberships.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{m.user.name ?? m.user.email}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{m.user.email}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-300 text-xs">{m.role}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        m.status === "ACTIVE"
                          ? "bg-emerald-100 dark:bg-green-900/50 text-emerald-700 dark:text-green-400"
                          : m.status === "SUSPENDED"
                          ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
                          : "bg-amber-100 dark:bg-yellow-900/50 text-amber-700 dark:text-yellow-400"
                      }`}
                    >
                      {m.status}
                    </span>
                    {m.user.lastLoginAt && (
                      <span className="text-xs text-gray-600 dark:text-gray-500">
                        {t("tenantDetail.lastLogin")} {new Date(m.user.lastLoginAt).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity timeline */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-400" />
              <h2 className="font-semibold">{t("tenantDetail.saActivity")}</h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800 max-h-96 overflow-y-auto">
              {activity.length === 0 ? (
                <p className="p-5 text-sm text-gray-500 text-center">{t("tenantDetail.noEvents")}</p>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className="p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-200">{a.action}</span>
                      <span className="text-gray-600 dark:text-gray-500">
                        {new Date(a.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {a.user?.email && <p className="text-gray-600 dark:text-gray-500 mt-0.5">{a.user.email}</p>}
                    {a.summaryJson ? (
                      <pre className="mt-1 bg-gray-100 dark:bg-gray-950 p-2 rounded overflow-auto text-[10px] text-gray-600 dark:text-gray-400">
                        {JSON.stringify(a.summaryJson, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <TenantOpsPanel
            tenantId={tenant.id}
            currentPlanTier={tenant.planTier}
            hasActiveMembers={activeMembers > 0}
          />

          {/* Internal notes */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="font-semibold text-sm">{t("tenantDetail.internalNotes", { count: notes.length })}</h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800 max-h-[400px] overflow-y-auto">
              {notes.length === 0 ? (
                <p className="p-4 text-xs text-gray-500 text-center">{t("tenantDetail.noNotes")}</p>
              ) : (
                notes.map((n) => {
                  const body = (n.summaryJson as { body?: string } | null)?.body ?? "";
                  return (
                    <div key={n.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-gray-600 dark:text-gray-500">
                        <span>{n.user?.email ?? t("tenantDetail.saBadge")}</span>
                        <span>{new Date(n.createdAt).toLocaleString("pt-BR")}</span>
                      </div>
                      <p className="text-gray-900 dark:text-gray-200 whitespace-pre-wrap">{body}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
