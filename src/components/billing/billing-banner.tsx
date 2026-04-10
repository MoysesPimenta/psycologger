/**
 * Billing banner — shown when subscription is in GRACE period or over quota
 */

"use client";

import { useState } from "react";
import Link from "next/link";

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

  if (!state || dismissed) return null;

  if (state === "GRACE") {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="text-yellow-600 dark:text-yellow-400 text-xl">⚠️</div>
            <div>
              <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                Período de graça ativo
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                Seu pagamento não foi processado. Você tem{" "}
                <strong>{graceDaysLeft || 3} dias</strong> para atualizar seu método de
                pagamento.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href="/app/billing"
              className="px-3 py-1 bg-yellow-600 dark:bg-yellow-700 text-white text-sm rounded hover:bg-yellow-700 dark:hover:bg-yellow-600 transition"
            >
              Atualizar Pagamento
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1 text-sm text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900 rounded transition"
            >
              Descartar
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
        `Pacientes: ${quotaInfo.patients.current}/${quotaInfo.patients.limit}`
      );
    }
    if (quotaInfo.therapists.overQuota) {
      overQuotaMessages.push(
        `Terapeutas: ${quotaInfo.therapists.current}/${quotaInfo.therapists.limit}`
      );
    }

    return (
      <div className="bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="text-red-600 dark:text-red-400 text-xl">🚫</div>
            <div>
              <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                Limite do plano excedido
              </p>
              <p className="text-xs text-red-800 dark:text-red-200">
                {overQuotaMessages.join(", ")}. Faça upgrade para continuar adicionando
                recursos.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href="/app/billing"
              className="px-3 py-1 bg-red-600 dark:bg-red-700 text-white text-sm rounded hover:bg-red-700 dark:hover:bg-red-600 transition"
            >
              Fazer Upgrade
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1 text-sm text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 rounded transition"
            >
              Descartar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
