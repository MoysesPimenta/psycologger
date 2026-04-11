/**
 * Billing banner — shown when subscription is in GRACE period or over quota
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export interface BillingBannerProps {
  state: "GRACE" | "OVER_QUOTA" | null;
  graceDaysLeft?: number;
  quotaInfo?: {
    patients: { current: number; limit: number; overQuota: boolean };
    therapists: { current: number; limit: number; overQuota: boolean };
    planTier: string;
  };
}

export function BillingBanner({ state, graceDaysLeft, quotaInfo }: BillingBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const t = useTranslations("billingBanner");

  if (!state || dismissed) return null;

  if (state === "GRACE") {
    return (
      <div className="fixed top-0 left-0 right-0 ltr:md:left-64 rtl:md:right-64 z-40 bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="text-yellow-600 dark:text-yellow-400 text-xl">⚠️</div>
            <div>
              <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                {t("gracePeriodActive")}
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                {t("graceMessage", { days: graceDaysLeft || 3 })}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href="/app/billing"
              className="px-3 py-1 bg-yellow-600 dark:bg-yellow-700 text-white text-sm rounded hover:bg-yellow-700 dark:hover:bg-yellow-600 transition"
            >
              {t("updatePayment")}
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1 text-sm text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900 rounded transition"
            >
              {t("dismiss")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === "OVER_QUOTA" && quotaInfo) {
    const overQuotaMessages: string[] = [];
    if (quotaInfo.patients.overQuota) {
      overQuotaMessages.push(
        t("patients", {
          current: quotaInfo.patients.current,
          limit: quotaInfo.patients.limit,
        })
      );
    }
    if (quotaInfo.therapists.overQuota) {
      overQuotaMessages.push(
        t("therapists", {
          current: quotaInfo.therapists.current,
          limit: quotaInfo.therapists.limit,
        })
      );
    }

    return (
      <div className="fixed top-0 left-0 right-0 ltr:md:left-64 rtl:md:right-64 z-40 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="text-red-600 dark:text-red-400 text-xl">🚫</div>
            <div>
              <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                {t("planLimitExceeded")}
              </p>
              <p className="text-xs text-red-800 dark:text-red-200">
                {overQuotaMessages.join(". ")}. {t("overQuotaMessage")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href="/app/billing"
              className="px-3 py-1 bg-red-600 dark:bg-red-700 text-white text-sm rounded hover:bg-red-700 dark:hover:bg-red-600 transition"
            >
              {t("upgrade")}
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1 text-sm text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 rounded transition"
            >
              {t("dismiss")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
