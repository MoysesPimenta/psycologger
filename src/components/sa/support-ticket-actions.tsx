"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { Send, Lock } from "lucide-react";

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
  const [note, setNote] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

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

  const setStatus = async (
    status: "OPEN" | "PENDING" | "CLOSED",
    opts?: { redirectToInbox?: boolean }
  ) => {
    setError(null);
    try {
      const res = await fetchWithCsrf(`/api/v1/sa/support/tickets/${ticketId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        if (opts?.redirectToInbox) {
          router.push("/sa/support");
        }
        router.refresh();
      } else {
        const p = await res.json().catch(() => ({}));
        setError(p?.error?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setIsSavingNote(true);
    setNoteError(null);
    try {
      const res = await fetchWithCsrf(`/api/v1/sa/support/tickets/${ticketId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note }),
      });
      if (res.ok) {
        setNote("");
        router.refresh();
      } else {
        const p = await res.json().catch(() => ({}));
        setNoteError(p?.error?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
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
        <button
          type="button"
          onClick={() => setStatus("CLOSED", { redirectToInbox: true })}
          className="px-3 py-1 rounded border border-gray-700 bg-gray-800 text-xs text-gray-200 hover:bg-gray-700"
          title="Fecha o ticket e retorna à caixa de entrada."
        >
          Fechar e ir ao suporte
        </button>
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

      <div className="bg-amber-950/20 border border-amber-900/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-400" />
          <p className="text-sm font-medium text-amber-200">
            Nota interna (staff apenas)
          </p>
        </div>
        <p className="text-xs text-amber-200/70">
          Esta nota nunca é enviada ao cliente. Use para registrar contexto
          para outros membros da equipe de suporte. Não altera o status do
          ticket.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={10000}
          placeholder="Ex.: cliente já abriu ticket similar em março, verificar antes de responder…"
          className="w-full px-3 py-2 bg-gray-900 border border-amber-900/60 rounded text-sm text-amber-50 placeholder-amber-200/40"
        />
        {noteError && <p className="text-sm text-red-400">{noteError}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveNote}
            disabled={isSavingNote || !note.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-sm font-medium text-amber-50"
          >
            <Lock className="h-4 w-4" />
            {isSavingNote ? "Salvando…" : "Salvar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}
