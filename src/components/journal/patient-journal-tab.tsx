"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BookOpen,
  Check,
  MessageCircle,
  AlertTriangle,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { Button } from "@/components/ui/button";
import JournalTrendChart from "./journal-trend-chart";
import JournalTherapistNotes from "./journal-therapist-notes";

// ─── Types ───────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: string;
  entryType: string;
  moodScore: number | null;
  anxietyScore: number | null;
  energyScore: number | null;
  sleepScore: number | null;
  emotionTags: string[];
  noteText: string | null;
  discussNextSession: boolean;
  flaggedForSupport: boolean;
  reviewedAt: string | null;
  notesCount: number;
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function PatientJournalTab({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [tab, setTab] = useState<"unread" | "discuss" | "all">("all");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      patientId,
      tab,
      pageSize: "50",
    });
    try {
      const res = await fetch(`/api/v1/journal-inbox?${params}`);
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data);
      }
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, [patientId, tab]);

  useEffect(() => {
    fetchEntries();
    setSelectedId(null);
  }, [fetchEntries]);

  async function markReviewed(id: string) {
    setReviewing(true);
    const res = await fetchWithCsrf(`/api/v1/journal-inbox/${id}/review`, {
      method: "PATCH",
    });
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
    <div className="space-y-6">
      {/* Trend Chart */}
      <JournalTrendChart patientId={patientId} />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
          <p className="text-xs text-gray-500">Entradas</p>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">
            {entries.filter((e) => !e.reviewedAt).length}
          </p>
          <p className="text-xs text-gray-500">Não lidas</p>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-brand-600">
            {entries.filter((e) => e.discussNextSession).length}
          </p>
          <p className="text-xs text-gray-500">Discutir</p>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-500">
            {entries.filter((e) => e.flaggedForSupport).length}
          </p>
          <p className="text-xs text-gray-500">Alertas</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "unread", "discuss"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSelectedId(null);
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              tab === t
                ? "bg-brand-600 text-white"
                : "bg-white text-gray-600 border hover:bg-gray-50",
            )}
          >
            {t === "all" ? "Todas" : t === "unread" ? "Não lidas" : "Discutir"}
          </button>
        ))}
      </div>

      {/* Entries + Detail */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Entry list */}
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gray-200 rounded-xl" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-sm text-gray-400">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              {tab === "unread"
                ? "Tudo revisado!"
                : "Nenhuma entrada encontrada."}
            </div>
          ) : (
            entries.map((entry) => (
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">
                      {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                    </span>
                    {entry.moodScore != null && (
                      <span className="text-xs text-gray-400">
                        · Humor: {entry.moodScore}/10
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-300">
                    {format(new Date(entry.createdAt), "dd/MM HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                </div>

                {entry.noteText && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                    {entry.noteText}
                  </p>
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
                  {entry.notesCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-600">
                      <StickyNote className="h-3 w-3" /> {entry.notesCount}
                    </span>
                  )}
                  {entry.reviewedAt ? (
                    <span className="flex items-center gap-1 text-[11px] text-green-500">
                      <Check className="h-3 w-3" /> Revisado
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-500 font-medium">
                      Não lida
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected ? (
          <div className="bg-white border rounded-xl p-5 space-y-4 sticky top-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {ENTRY_TYPE_LABELS[selected.entryType]}
              </p>
              <p className="text-xs text-gray-500">
                {format(
                  new Date(selected.createdAt),
                  "dd/MM/yyyy 'às' HH:mm",
                  { locale: ptBR },
                )}
              </p>
            </div>

            {/* Scores */}
            <div className="flex gap-3 flex-wrap">
              {selected.moodScore != null && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-gray-400">Humor</p>
                  <p className="text-lg font-bold">{selected.moodScore}/10</p>
                </div>
              )}
              {selected.anxietyScore != null && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-gray-400">Ansiedade</p>
                  <p className="text-lg font-bold">{selected.anxietyScore}/10</p>
                </div>
              )}
              {selected.energyScore != null && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-gray-400">Energia</p>
                  <p className="text-lg font-bold">{selected.energyScore}/10</p>
                </div>
              )}
              {selected.sleepScore != null && (
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
                  <span
                    key={tag}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Note */}
            {selected.noteText && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {selected.noteText}
                </p>
              </div>
            )}

            {/* Flags */}
            {selected.flaggedForSupport && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Sinalizada por palavras-chave de risco.
              </div>
            )}
            {selected.discussNextSession && (
              <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-sm text-brand-700">
                <MessageCircle className="h-4 w-4 inline mr-1" />
                Discutir na próxima sessão.
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
                Revisado em{" "}
                {format(
                  new Date(selected.reviewedAt),
                  "dd/MM/yyyy 'às' HH:mm",
                  { locale: ptBR },
                )}
              </p>
            )}

            {/* Therapist notes */}
            <div className="border-t pt-4">
              <JournalTherapistNotes journalEntryId={selected.id} />
            </div>
          </div>
        ) : (
          <div className="bg-white border rounded-xl p-8 text-center text-gray-400 flex flex-col items-center justify-center">
            <BookOpen className="h-10 w-10 mb-3 text-gray-300" />
            <p className="text-sm">Selecione uma entrada para ver os detalhes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
