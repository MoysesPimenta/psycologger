"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { Trash2, Plus } from "lucide-react";

export interface BlocklistEntry {
  id: string;
  kind: "EMAIL" | "DOMAIN";
  pattern: string;
  reason: string | null;
  createdAt: string;
}

export function BlocklistManager({ entries }: { entries: BlocklistEntry[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"EMAIL" | "DOMAIN">("EMAIL");
  const [pattern, setPattern] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithCsrf("/api/v1/sa/support/blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, pattern: pattern.trim(), reason: reason.trim() || undefined }),
      });
      if (res.ok) {
        setPattern("");
        setReason("");
        router.refresh();
      } else {
        const p = await res.json().catch(() => ({}));
        setError(p?.error?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta entrada do blocklist?")) return;
    setError(null);
    try {
      const res = await fetchWithCsrf(`/api/v1/sa/support/blocklist?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
      else {
        const p = await res.json().catch(() => ({}));
        setError(p?.error?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={add}
        className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
      >
        <p className="text-sm font-medium text-gray-200">Adicionar entrada</p>
        <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_1fr_auto] gap-3">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "EMAIL" | "DOMAIN")}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          >
            <option value="EMAIL">Email</option>
            <option value="DOMAIN">Domínio</option>
          </select>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={kind === "EMAIL" ? "spam@exemplo.com" : "exemplo.com"}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional)"
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={busy || !pattern.trim()}
            className="inline-flex items-center gap-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Bloquear
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-400">
              <th className="p-3">Tipo</th>
              <th className="p-3">Padrão</th>
              <th className="p-3">Motivo</th>
              <th className="p-3">Criado</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  Nenhuma entrada no blocklist.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-300 border border-gray-700">
                      {e.kind}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{e.pattern}</td>
                  <td className="p-3 text-xs text-gray-400">{e.reason || "—"}</td>
                  <td className="p-3 text-xs text-gray-400">
                    {new Date(e.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      className="text-red-400 hover:text-red-300"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
