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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Diário</h1>
        <Button size="sm" asChild>
          <Link href="/portal/journal/new">
            <Plus className="h-4 w-4 mr-1" /> Nova entrada
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">
          <PenLine className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          Nenhuma anotação ainda. Que tal registrar como você está?
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const vis = VISIBILITY_LABELS[entry.visibility] ?? VISIBILITY_LABELS.PRIVATE;
            const VisIcon = vis.icon;
            return (
              <Link
                key={entry.id}
                href={`/portal/journal/${entry.id}`}
                className="block bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">
                      {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                    </span>
                    {entry.moodScore && (
                      <span className="text-xs text-gray-400">· Humor {entry.moodScore}/10</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-300">
                    {format(new Date(entry.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>

                {entry.emotionTags.length > 0 && (
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {entry.emotionTags.map((tag) => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {entry.noteText && (
                  <p className="text-sm text-gray-500 truncate">{entry.noteText}</p>
                )}

                <div className="flex items-center gap-3 mt-2">
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <VisIcon className="h-3 w-3" /> {vis.label}
                  </span>
                  {entry.discussNextSession && (
                    <span className="flex items-center gap-1 text-[11px] text-brand-500">
                      <MessageCircle className="h-3 w-3" /> Discutir na sessão
                    </span>
                  )}
                  {entry.reviewedAt && (
                    <span className="text-[11px] text-green-500">Revisado</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
