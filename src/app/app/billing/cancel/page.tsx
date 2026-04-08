/**
 * /app/billing/cancel
 * Shown when user cancels Stripe checkout.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function BillingCancelPage() {
  const t = await getTranslations("billing");
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="text-5xl mb-4">⏸️</div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t("checkoutCancelled")}
        </h1>

        <p className="text-gray-600 mb-6">
          {t("checkoutCancelledMsg")}
        </p>

        <Link
          href="/app/billing"
          className="block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
        >
          {t("backToPlans")}
        </Link>

        <Link
          href="/app"
          className="block px-6 py-3 text-gray-700 font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 transition mt-3"
        >
          {t("backToHome")}
        </Link>
      </div>
    </div>
  );
}
