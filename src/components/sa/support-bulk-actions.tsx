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
import { useTranslations } from "next-intl";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/psycologger-csrf=([^;]+)/);
  return m?.[1] ?? "";
}

export function SupportBulkActions({ ticketIds }: { ticketIds: string[] }) {
  const router = useRouter();
  const t = useTranslations("sa");
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
      <div className="text-xs text-gray-600 dark:text-gray-500">
        {t("support.selectTickets")}
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-900 dark:text-white">
        {t(selected.size > 1 ? "support.selectedPlural" : "support.selected", {
          count: selected.size,
        })}
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction({ action: "SET_STATUS", status: "OPEN" })}
          className="px-3 py-1.5 text-xs rounded border border-red-300 dark:border-red-800 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-200 disabled:opacity-50"
        >
          {t("support.markOpen")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction({ action: "SET_STATUS", status: "PENDING" })}
          className="px-3 py-1.5 text-xs rounded border border-amber-300 dark:border-yellow-800 bg-amber-100 dark:bg-yellow-900/40 hover:bg-amber-200 dark:hover:bg-yellow-900/60 text-amber-700 dark:text-yellow-200 disabled:opacity-50"
        >
          {t("support.pending")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction({ action: "SET_STATUS", status: "CLOSED" })}
          className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
        >
          {t("support.close")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            runAction(
              { action: "BLOCK_SENDERS" },
              t("support.blockConfirm", { count: selected.size })
            )
          }
          className="px-3 py-1.5 text-xs rounded border border-orange-300 dark:border-orange-800 bg-orange-100 dark:bg-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-900/60 text-orange-700 dark:text-orange-200 disabled:opacity-50"
        >
          {t("support.blockSenders")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            runAction(
              { action: "DELETE" },
              t("support.deleteConfirm", { count: selected.size })
            )
          }
          className="px-3 py-1.5 text-xs rounded border border-red-600 dark:border-red-900 bg-red-200 dark:bg-red-950 hover:bg-red-300 dark:hover:bg-red-900 text-red-800 dark:text-red-300 disabled:opacity-50"
        >
          {t("support.delete")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={clearAll}
          className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          {t("support.clear")}
        </button>
      </div>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

export function SupportMasterCheckbox() {
  const t = useTranslations("sa");
  return (
    <input
      type="checkbox"
      data-support-ticket-master="1"
      aria-label={t("support.selectTickets")}
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
