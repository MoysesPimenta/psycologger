/**
 * /app/billing
 * Billing dashboard showing current plan, status, and upgrade options.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAuthContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/billing/plans";
import { getBillingState } from "@/lib/billing/subscription-status";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { ManageSubscriptionButton, UpgradeButton } from "@/components/billing/billing-actions";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const t = await getTranslations("billing");
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext();
  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      planTier: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      graceUntil: true,
      stripeSubscriptionId: true,
    },
  });

  if (!tenant) {
    return <div>Tenant not found</div>;
  }

  const plan = getPlan(tenant.planTier);
  const state = getBillingState({
    planTier: tenant.planTier,
    graceUntil: tenant.graceUntil,
    subscriptionStatus: tenant.subscriptionStatus,
  } as any);

  const stateBadgeColor = {
    FREE: "bg-blue-100 text-blue-800",
    ACTIVE: "bg-green-100 text-green-800",
    GRACE: "bg-yellow-100 text-yellow-800",
    BLOCKED: "bg-red-100 text-red-800",
  }[state];

  const stateLabel = {
    FREE: t("freePlan"),
    ACTIVE: t("active"),
    GRACE: t("gracePeriod"),
    BLOCKED: t("blocked"),
  }[state];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-gray-600 mt-2">
          {t("subtitle")}
        </p>
      </div>

      {/* Current Plan Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">{plan.name}</h2>
            <p className="text-gray-600 mt-1">{plan.description}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${stateBadgeColor}`}>
            {stateLabel}
          </span>
        </div>

        {/* Plan Details */}
        <div className="space-y-4 mb-6 pb-6 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">{t("activePatients")}</p>
              <p className="text-lg font-semibold">
                {plan.maxActivePatients === Infinity ? t("unlimited") : plan.maxActivePatients}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">{t("therapists")}</p>
              <p className="text-lg font-semibold">
                {plan.maxTherapistSeats === Infinity ? t("unlimited") : plan.maxTherapistSeats}
              </p>
            </div>
          </div>

          {tenant.currentPeriodEnd && (
            <div>
              <p className="text-sm text-gray-600">{t("billingPeriod")}</p>
              <p className="text-sm">
                {t("nextRenewal")} {new Date(tenant.currentPeriodEnd).toLocaleDateString("pt-BR")}
              </p>
            </div>
          )}

          {state === "GRACE" && tenant.graceUntil && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                {t("graceExpires")}{" "}
                <strong>
                  {formatDistanceToNow(new Date(tenant.graceUntil), { locale: ptBR })}
                </strong>
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {tenant.stripeSubscriptionId ? (
            <div className="flex-1">
              <ManageSubscriptionButton />
            </div>
          ) : (
            <div className="flex gap-3 w-full">
              {tenant.planTier !== "PRO" && (
                <div className="flex-1">
                  <UpgradeButton tier="PRO" label="Upgrade para Pro" color="blue" />
                </div>
              )}
              {tenant.planTier !== "CLINIC" && (
                <div className="flex-1">
                  <UpgradeButton tier="CLINIC" label="Upgrade para Clínica" color="emerald" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pricing Comparison */}
      <div>
        <h3 className="text-lg font-semibold mb-4">{t("comparePlans")}</h3>
        <div className="grid grid-cols-3 gap-4">
          {["FREE", "PRO", "CLINIC"].map((tier) => {
            const p = getPlan(tier as any);
            const isCurrent = tenant.planTier === tier;
            return (
              <div
                key={tier}
                className={`rounded-2xl border-2 p-4 transition ${
                  isCurrent
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <h4 className="font-semibold mb-2">{p.name}</h4>
                <p className="text-xs text-gray-600 mb-3">{p.description}</p>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">{t("patients")} </span>
                    <span className="font-semibold">
                      {p.maxActivePatients === Infinity ? "∞" : p.maxActivePatients}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">{t("therapists")} </span>
                    <span className="font-semibold">
                      {p.maxTherapistSeats === Infinity ? "∞" : p.maxTherapistSeats}
                    </span>
                  </div>
                </div>
                {isCurrent && (
                  <p className="text-xs text-blue-600 font-semibold mt-3">{t("currentPlan")}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
