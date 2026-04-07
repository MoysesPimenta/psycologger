"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, PenLine, Eye, EyeOff, MessageCircle } from "lucide-react";
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
  createdAt: string;
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  MOOD_CHECKIN: "Humor",
  REFLECTION: "Reflexão",
  SESSION_PREP: "Próxima sessão",
  QUESTION: "Pergunta",
  IMPORTANT_EVENT: "Evento",
  GRATITUDE: "Gratidão",
};

const VISIBILITY_LABELS: Record<string, { label: string; icon: typeof Eye }> = {
  PRIVATE: { label: "Privado", icon: EyeOff },
  SHARED: { label: "Compartilhado", icon: Eye },
  DRAFT: { label: "Rascunho", icon: PenLine },
};

export function PortalJournalListClient() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/portal/journal?pageSize=50", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setEntries(json.data); })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          // Handle error silently
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-4 relative">
      <h1 className="text-2xl font-bold text-gray-900">Diário</h1>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/50 p-8 text-center">
          <PenLine className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Nenhuma anotação ainda. Que tal registrar como você está?</p>
        </div>
      ) : (
        <div className="space-y-2 pb-4">
          {entries.map((entry) => {
            const vis = VISIBILITY_LABELS[entry.visibility] ?? VISIBILITY_LABELS.PRIVATE;
            const VisIcon = vis.icon;
            return (
              <Link
                key={entry.id}
                href={`/portal/journal/${entry.id}`}
                className="block bg-white rounded-2xl border border-gray-200/50 p-4 hover:shadow-md active:bg-gray-50 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">
                      {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                    </span>
                    {entry.moodScore && (
                      <span className="text-xs text-gray-500">· {entry.moodScore}/10</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {format(new Date(entry.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>

                {entry.emotionTags.length > 0 && (
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {entry.emotionTags.map((tag) => (
                      <span key={tag} className="text-[11px] px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {entry.noteText && (
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">{entry.noteText}</p>
                )}

                <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
                  <span className="flex items-center gap-1 text-gray-500">
                    <VisIcon className="h-3.5 w-3.5" /> {vis.label}
                  </span>
                  {entry.discussNextSession && (
                    <span className="flex items-center gap-1 text-blue-600 font-medium">
                      <MessageCircle className="h-3.5 w-3.5" /> Discutir
                    </span>
                  )}
                  {entry.reviewedAt && (
                    <span className="text-green-600 font-medium">Revisado</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Floating Action Button */}
      <Link
        href="/portal/journal/new"
        className="fixed bottom-28 right-5 z-20 h-14 w-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:bg-blue-700 active:scale-95 transition-all"
        aria-label="Nova entrada no diário"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}
