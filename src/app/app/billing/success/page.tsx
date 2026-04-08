/**
 * /app/billing/success
 * Shown after successful Stripe checkout.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function BillingSuccessPage() {
  const t = await getTranslations("billing");
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="text-5xl mb-4">✅</div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t("congratulations")}
        </h1>

        <p className="text-gray-600 mb-6">
          {t("paymentSuccess")}
        </p>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-green-800">
            {t("readyToUse")}
          </p>
        </div>

        <Link
          href="/app/billing"
          className="block px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition"
        >
          {t("backToPlans")}
        </Link>

        <Link
          href="/app/patients"
          className="block px-6 py-3 text-gray-700 font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 transition mt-3"
        >
          {t("backToPatients")}
        </Link>
      </div>
    </div>
  );
}
