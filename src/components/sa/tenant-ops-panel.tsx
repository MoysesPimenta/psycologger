"use client";

/**
 * SA ops panel — suspend, reactivate, override plan, append internal note.
 * Client component; all actions are audited server-side.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@prisma/client";

async function post(url: string, body: unknown = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const msg =
      payload?.error?.message ||
      payload?.message ||
      (typeof payload?.error === "string" ? payload.error : null) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export function TenantOpsPanel({
  tenantId,
  currentPlanTier,
  hasActiveMembers,
}: {
  tenantId: string;
  currentPlanTier: PlanTier;
  hasActiveMembers: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [planChoice, setPlanChoice] = useState<PlanTier>(currentPlanTier);
  const [planReason, setPlanReason] = useState("");

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
      <h2 className="font-semibold text-lg">Operações internas</h2>
      {error && (
        <div className="bg-red-950/40 border border-red-900 text-red-300 text-sm rounded p-2">
          {error}
        </div>
      )}

      {/* Suspend / reactivate */}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={isPending || !hasActiveMembers}
          onClick={() => {
            if (!confirm("Suspender todos os membros ativos desta clínica?")) return;
            run(() => post(`/api/v1/sa/tenants/${tenantId}/suspend`, { reason: prompt("Motivo (opcional):") ?? "" }));
          }}
          className="px-3 py-2 text-xs bg-yellow-900/40 border border-yellow-700 text-yellow-200 hover:bg-yellow-900/60 rounded disabled:opacity-50"
        >
          Suspender clínica
        </button>
        <button
          disabled={isPending}
          onClick={() => run(() => post(`/api/v1/sa/tenants/${tenantId}/reactivate`))}
          className="px-3 py-2 text-xs bg-green-900/40 border border-green-700 text-green-200 hover:bg-green-900/60 rounded disabled:opacity-50"
        >
          Reativar clínica
        </button>
      </div>

      {/* Plan override */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400">Override de plano (não mexe no Stripe)</label>
        <div className="flex flex-wrap gap-2">
          <select
            value={planChoice}
            onChange={(e) => setPlanChoice(e.target.value as PlanTier)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="FREE">FREE</option>
            <option value="PRO">PRO</option>
            <option value="CLINIC">CLINIC</option>
          </select>
          <input
            type="text"
            placeholder="Motivo (obrigatório)"
            value={planReason}
            onChange={(e) => setPlanReason(e.target.value)}
            className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          />
          <button
            disabled={isPending || planReason.length < 3 || planChoice === currentPlanTier}
            onClick={() =>
              run(() =>
                post(`/api/v1/sa/tenants/${tenantId}/plan-override`, {
                  planTier: planChoice,
                  reason: planReason,
                }),
              )
            }
            className="px-3 py-1 text-xs bg-brand-700 hover:bg-brand-600 rounded disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Internal note */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400">Nota interna (append-only, auditada)</label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm min-h-[70px]"
          placeholder="Ex: contatado em 08/04, aguardando pagamento pendente de R$99"
        />
        <button
          disabled={isPending || noteText.trim().length === 0}
          onClick={() =>
            run(async () => {
              await post(`/api/v1/sa/tenants/${tenantId}/notes`, { body: noteText });
              setNoteText("");
            })
          }
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
        >
          Adicionar nota
        </button>
      </div>
    </div>
  );
}
