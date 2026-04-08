"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { Send } from "lucide-react";

export function SupportTicketActions({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: "OPEN" | "PENDING" | "CLOSED";
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (afterStatus: "PENDING" | "CLOSED") => {
    if (!body.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      const res = await fetchWithCsrf(`/api/v1/sa/support/tickets/${ticketId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, afterStatus }),
      });
      if (res.ok) {
        setBody("");
        // After a reply (regardless of PENDING vs CLOSED) return to the
        // inbox so the SA can triage the next ticket.
        router.push("/sa/support");
        router.refresh();
      } else {
        const p = await res.json().catch(() => ({}));
        setError(p?.error?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsSending(false);
    }
  };

  const setStatus = async (status: "OPEN" | "PENDING" | "CLOSED") => {
    setError(null);
    try {
      const res = await fetchWithCsrf(`/api/v1/sa/support/tickets/${ticketId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-400">Mudar status:</span>
        {(["OPEN", "PENDING", "CLOSED"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            disabled={s === currentStatus}
            className="px-3 py-1 rounded border border-gray-700 bg-gray-800 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {s === "OPEN" ? "Abrir" : s === "PENDING" ? "Aguardando" : "Fechar"}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-200">Responder</p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={10000}
          placeholder="Digite sua resposta…"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => send("PENDING")}
            disabled={isSending || !body.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-sm font-medium"
            title="Envia a resposta e marca o ticket como Aguardando cliente."
          >
            <Send className="h-4 w-4" />
            {isSending ? "Enviando…" : "Enviar & Aguardando"}
          </button>
          <button
            type="button"
            onClick={() => send("CLOSED")}
            disabled={isSending || !body.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-sm font-medium"
            title="Envia a resposta e fecha o ticket."
          >
            <Send className="h-4 w-4" />
            {isSending ? "Enviando…" : "Enviar & Fechar"}
          </button>
        </div>
      </div>
    </div>
  );
}
