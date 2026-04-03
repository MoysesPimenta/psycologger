"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookOpen, Check, MessageCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JournalEntry {
  id: string;
  entryType: string;
  visibility: string;
  moodScore: number | null;
  anxietyScore: number | null;
  energyScore: number | null;
  sleepScore: number | null;
  emotionTags: string[];
  noteText: string | null;
  discussNextSession: boolean;
  flaggedForSupport: boolean;
  reviewedAt: string | null;
  reviewedById: string | null;
  createdAt: string;
  patient: {
    id: string;
    fullName: string;
    preferredName: string | null;
  };
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  MOOD_CHECKIN: "Humor",
  REFLECTION: "Reflexão",
  SESSION_PREP: "Preparação",
  QUESTION: "Pergunta",
  IMPORTANT_EVENT: "Evento",
  GRATITUDE: "Gratidão",
};

export function JournalInboxClient() {
  const [tab, setTab] = useState<"unread" | "discuss" | "all">("unread");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/journal-inbox?tab=${tab}&pageSize=50`);
    if (res.ok) {
      const json = await res.json();
      setEntries(json.data);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function markReviewed(id: string) {
    setReviewing(true);
    const res = await fetch(`/api/v1/journal-inbox/${id}/review`, { method: "PATCH" });
    if (res.ok) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, reviewedAt: new Date().toISOString() } : e,
        ),
      );
      setSelectedId(null);
    }
    setReviewing(false);
  }

  const selected = entries.find((e) => e.id === selectedId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Diário dos Pacientes</h1>
      <p className="text-sm text-gray-500">
        Entradas compartilhadas por seus pacientes.
      </p>

      <div className="flex gap-2">
        {(["unread", "discuss", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedId(null); }}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === t ? "bg-brand-600 text-white" : "bg-white text-gray-600 border hover:bg-gray-50",
            )}
          >
            {t === "unread" ? "Não lidos" : t === "discuss" ? "Próxima sessão" : "Todos"}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Entry list */}
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-sm text-gray-400">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              {tab === "unread" ? "Tudo revisado!" : "Nenhuma entrada encontrada."}
            </div>
          ) : (
            entries.map((entry) => {
              const patientName = entry.patient.preferredName ?? entry.patient.fullName;
              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    "w-full text-left bg-white border rounded-xl p-4 hover:shadow-sm transition-all",
                    selectedId === entry.id && "ring-2 ring-brand-500",
                    !entry.reviewedAt && "border-l-4 border-l-brand-400",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{patientName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                        </span>
                        {entry.moodScore && (
                          <span className="text-xs text-gray-400">· Humor: {entry.moodScore}/10</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-300">
                      {format(new Date(entry.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>

                  {entry.noteText && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{entry.noteText}</p>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    {entry.flaggedForSupport && (
                      <span className="flex items-center gap-1 text-[11px] text-red-500">
                        <AlertTriangle className="h-3 w-3" /> Alerta
                      </span>
                    )}
                    {entry.discussNextSession && (
                      <span className="flex items-center gap-1 text-[11px] text-brand-500">
                        <MessageCircle className="h-3 w-3" /> Discutir
                      </span>
                    )}
                    {entry.reviewedAt ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-500">
                        <Check className="h-3 w-3" /> Revisado
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-500 font-medium">Não lido</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="bg-white border rounded-xl p-5 space-y-4 sticky top-4">
            <div>
              <p className="font-semibold text-gray-900">
                {selected.patient.preferredName ?? selected.patient.fullName}
              </p>
              <p className="text-sm text-gray-500">
                {ENTRY_TYPE_LABELS[selected.entryType]} ·{" "}
                {format(new Date(selected.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>

            {/* Scores */}
            <div className="flex gap-3 flex-wrap">
              {selected.moodScore && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-gray-400">Humor</p>
                  <p className="text-lg font-bold">{selected.moodScore}/10</p>
                </div>
              )}
              {selected.anxietyScore && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-gray-400">Ansiedade</p>
                  <p className="text-lg font-bold">{selected.anxietyScore}/10</p>
                </div>
              )}
              {selected.energyScore && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-gray-400">Energia</p>
                  <p className="text-lg font-bold">{selected.energyScore}/10</p>
                </div>
              )}
              {selected.sleepScore && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-gray-400">Sono</p>
                  <p className="text-lg font-bold">{selected.sleepScore}/10</p>
                </div>
              )}
            </div>

            {/* Emotions */}
            {selected.emotionTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.emotionTags.map((tag) => (
                  <span key={tag} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Note */}
            {selected.noteText && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.noteText}</p>
              </div>
            )}

            {/* Flags */}
            {selected.flaggedForSupport && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Esta entrada foi sinalizada automaticamente por palavras-chave de risco.
              </div>
            )}
            {selected.discussNextSession && (
              <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-sm text-brand-700">
                <MessageCircle className="h-4 w-4 inline mr-1" />
                O paciente quer discutir este tema na próxima sessão.
              </div>
            )}

            {/* Review action */}
            {!selected.reviewedAt ? (
              <Button
                onClick={() => markReviewed(selected.id)}
                disabled={reviewing}
                className="w-full"
              >
                <Check className="h-4 w-4 mr-2" />
                {reviewing ? "Marcando..." : "Marcar como revisado"}
              </Button>
            ) : (
              <p className="text-sm text-green-600 text-center">
                <Check className="h-4 w-4 inline mr-1" />
                Revisado em {format(new Date(selected.reviewedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
