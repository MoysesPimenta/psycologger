"use client";

/**
 * Active filter chips for /sa/support. Shows the current non-empty
 * searchParams as removable pills so the SA can see at a glance what's
 * filtering the inbox and clear individual filters with one click.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

const LABELS: Record<string, string> = {
  status: "Status",
  tenantId: "Tenant",
  clinicQ: "Clínica",
  userQ: "Usuário",
  fromEmail: "Email",
  since: "Desde",
  until: "Até",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abertos",
  PENDING: "Aguardando",
  CLOSED: "Fechados",
  ALL: "Todos",
};

export function SupportActiveChips() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const entries = Array.from(sp.entries()).filter(
    ([k, v]) => v && k !== "page" && LABELS[k]
  );
  if (entries.length === 0) return null;

  const remove = (key: string) => {
    const params = new URLSearchParams(sp.toString());
    params.delete(key);
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const clearAll = () => router.replace(pathname, { scroll: false });

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-500">Filtros ativos:</span>
      {entries.map(([k, v]) => {
        const display = k === "status" ? STATUS_LABELS[v] ?? v : v;
        return (
          <button
            key={k}
            type="button"
            onClick={() => remove(k)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand-900/40 border border-brand-700 text-brand-200 hover:bg-brand-900/70"
            title={`Remover filtro ${LABELS[k]}`}
          >
            <span className="font-medium">{LABELS[k]}:</span>
            <span className="truncate max-w-[140px]">{display}</span>
            <X className="h-3 w-3" />
          </button>
        );
      })}
      <button
        type="button"
        onClick={clearAll}
        className="px-2 py-1 rounded border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
      >
        Limpar tudo
      </button>
    </div>
  );
}
