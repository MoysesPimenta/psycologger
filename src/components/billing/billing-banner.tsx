/**
 * Billing banner — shown when subscription is in GRACE period
 */

"use client";

import { useState } from "react";
import Link from "next/link";

export interface BillingBannerProps {
  state: "GRACE" | null;
  graceDaysLeft?: number;
}

export function BillingBanner({ state, graceDaysLeft }: BillingBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!state || dismissed) return null;

  if (state === "GRACE") {
    return (
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="text-yellow-600 text-xl">⚠️</div>
            <div>
              <p className="text-sm font-semibold text-yellow-900">
                Período de graça ativo
              </p>
              <p className="text-xs text-yellow-800">
                Seu pagamento não foi processado. Você tem{" "}
                <strong>{graceDaysLeft || 3} dias</strong> para atualizar seu método de
                pagamento.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href="/app/billing"
              className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 transition"
            >
              Atualizar Pagamento
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1 text-sm text-yellow-700 hover:bg-yellow-100 rounded transition"
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
