/**
 * /app/billing/reactivate
 * Full-screen reactivation CTA shown when subscription is BLOCKED.
 * Accessible even when billing state is BLOCKED (special exception in layout guard).
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAuthContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/billing/plans";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function ReactivatePage() {
  const t = await getTranslations("billing");
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext();
  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      planTier: true,
      currentPeriodEnd: true,
      graceUntil: true,
    },
  });

  if (!tenant) {
    return <div>Tenant not found</div>;
  }

  const plan = getPlan(tenant.planTier);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t("inactiveSubscription")}
        </h1>

        <p className="text-gray-600 mb-6">
          {t("subscriptionExpired")}
        </p>

        {tenant.graceUntil && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              <strong>{t("graceUntil")}</strong>{" "}
              {new Date(tenant.graceUntil).toLocaleDateString("pt-BR")}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <form action="/api/v1/billing/checkout" method="POST">
            <input type="hidden" name="tier" value="PRO" />
            <input type="hidden" name="currency" value="BRL" />
            <button
              type="submit"
              className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              {t("upgradeProPlan")}
            </button>
          </form>

          <form action="/api/v1/billing/checkout" method="POST">
            <input type="hidden" name="tier" value="CLINIC" />
            <input type="hidden" name="currency" value="BRL" />
            <button
              type="submit"
              className="w-full px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition"
            >
              {t("upgradeClinicPlan")}
            </button>
          </form>

          <Link
            href="/app/billing"
            className="block px-6 py-3 text-gray-700 font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            {t("viewPlans")}
          </Link>
        </div>

        <p className="text-xs text-gray-500 mt-6">
          {t("needHelp")}{" "}
          <a href="mailto:support@psycologger.com" className="text-blue-600 hover:underline">
            {t("contactSupport")}
          </a>
        </p>
      </div>
    </div>
  );
}
