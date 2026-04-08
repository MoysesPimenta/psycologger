"use client";

/**
 * SupportBulkActions — client-side selection + bulk action toolbar for
 * /sa/support. Provides row checkboxes (wired via DOM ids so the server
 * component can keep rendering the table) and a floating bar with:
 *  - Set status: OPEN / PENDING / CLOSED
 *  - Delete
 *  - Block senders (adds fromEmail to the EMAIL blocklist)
 *
 * CSRF: reads psycologger-csrf cookie and forwards it as x-csrf-token,
 * matching the middleware double-submit contract.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/psycologger-csrf=([^;]+)/);
  return m?.[1] ?? "";
}

export function SupportBulkActions({ ticketIds }: { ticketIds: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    // Re-sync with DOM checkboxes (server re-renders the table on nav).
    const next = new Set<string>();
    document
      .querySelectorAll<HTMLInputElement>('input[data-support-ticket-cb="1"]:checked')
      .forEach((cb) => next.add(cb.value));
    setSelected(next);
  }, []);

  useEffect(() => {
    const handler = () => refresh();
    document.addEventListener("change", handler);
    return () => document.removeEventListener("change", handler);
  }, [refresh]);

  const clearAll = () => {
    document
      .querySelectorAll<HTMLInputElement>('input[data-support-ticket-cb="1"]')
      .forEach((cb) => (cb.checked = false));
    const master = document.querySelector<HTMLInputElement>(
      'input[data-support-ticket-master="1"]'
    );
    if (master) master.checked = false;
    setSelected(new Set());
  };

  const runAction = async (body: Record<string, unknown>, confirmMsg?: string) => {
    if (selected.size === 0) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/sa/support/tickets/bulk", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ ...body, ticketIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message || `HTTP ${res.status}`);
      }
      clearAll();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Unused — silence lint for the prop we accept but only need at mount.
  void ticketIds;

  if (selected.size === 0) {
    return (
      <div className="text-xs text-gray-500">
        Selecione tickets para aplicar ações em massa.
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-white">
        {selected.size} selecionado{selected.size > 1 ? "s" : ""}
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction({ action: "SET_STATUS", status: "OPEN" })}
          className="px-3 py-1.5 text-xs rounded border border-red-800 bg-red-900/40 hover:bg-red-900/60 text-red-200 disabled:opacity-50"
        >
          Marcar Aberto
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction({ action: "SET_STATUS", status: "PENDING" })}
          className="px-3 py-1.5 text-xs rounded border border-yellow-800 bg-yellow-900/40 hover:bg-yellow-900/60 text-yellow-200 disabled:opacity-50"
        >
          Aguardando
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction({ action: "SET_STATUS", status: "CLOSED" })}
          className="px-3 py-1.5 text-xs rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50"
        >
          Fechar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            runAction(
              { action: "BLOCK_SENDERS" },
              `Bloquear o email dos remetentes dos ${selected.size} ticket(s)?`
            )
          }
          className="px-3 py-1.5 text-xs rounded border border-orange-800 bg-orange-900/40 hover:bg-orange-900/60 text-orange-200 disabled:opacity-50"
        >
          Bloquear remetentes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            runAction(
              { action: "DELETE" },
              `Excluir permanentemente ${selected.size} ticket(s) e todas as mensagens? Esta ação não pode ser desfeita.`
            )
          }
          className="px-3 py-1.5 text-xs rounded border border-red-900 bg-red-950 hover:bg-red-900 text-red-300 disabled:opacity-50"
        >
          Excluir
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={clearAll}
          className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-400 hover:text-white"
        >
          Limpar
        </button>
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function SupportMasterCheckbox() {
  return (
    <input
      type="checkbox"
      data-support-ticket-master="1"
      aria-label="Selecionar todos"
      className="accent-brand-500"
      onChange={(e) => {
        const checked = e.currentTarget.checked;
        document
          .querySelectorAll<HTMLInputElement>('input[data-support-ticket-cb="1"]')
          .forEach((cb) => {
            cb.checked = checked;
            cb.dispatchEvent(new Event("change", { bubbles: true }));
          });
      }}
    />
  );
}
