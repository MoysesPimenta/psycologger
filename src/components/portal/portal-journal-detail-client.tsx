"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, Trash2, Eye, EyeOff, PenLine, MessageCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortalCrisisCard } from "./portal-crisis-card";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/csrf-client";

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
  updatedAt: string;
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  MOOD_CHECKIN: "Check-in de Humor",
  REFLECTION: "Reflexão",
  SESSION_PREP: "Preparação para Sessão",
  QUESTION: "Pergunta",
  IMPORTANT_EVENT: "Evento Importante",
  GRATITUDE: "Gratidão",
};

const SCORE_LABELS = [
  { key: "moodScore", label: "Humor" },
  { key: "anxietyScore", label: "Ansiedade" },
  { key: "energyScore", label: "Energia" },
  { key: "sleepScore", label: "Sono" },
] as const;

export function PortalJournalDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/v1/portal/journal/${id}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setEntry(json.data); })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          // Handle error silently
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [id]);

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("Tem certeza que deseja deletar esta entrada?")) {
      return;
    }
    setDeleting(true);
    const res = await fetchWithCsrf(`/api/v1/portal/journal/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/portal/journal");
      router.refresh();
    }
    setDeleting(false);
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-6 w-32 bg-gray-200 rounded" />
      <div className="h-40 bg-gray-200 rounded-xl" />
    </div>;
  }

  if (!entry) {
    return <p className="text-gray-500">Entrada não encontrada.</p>;
  }

  const canEdit = !entry.reviewedAt;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/portal/journal" className="text-gray-400 hover:text-gray-600">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900">
            {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
          </h1>
        </div>
        {canEdit && (
          <button onClick={handleDelete} className="text-red-400 hover:text-red-600 p-2" title="Excluir">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-sm text-gray-400">
        {format(new Date(entry.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </p>

      {entry.flaggedForSupport && <PortalCrisisCard />}

      {/* Scores */}
      {SCORE_LABELS.some(({ key }) => entry[key] !== null) && (
        <div className="grid grid-cols-2 gap-3">
          {SCORE_LABELS.map(({ key, label }) => {
            const val = entry[key];
            if (val === null) return null;
            return (
              <div key={key} className="bg-white rounded-lg border p-3 text-center">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-2xl font-bold text-gray-800">{val}<span className="text-sm text-gray-300">/10</span></p>
              </div>
            );
          })}
        </div>
      )}

      {/* Emotion tags */}
      {entry.emotionTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.emotionTags.map((tag) => (
            <span key={tag} className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Note text */}
      {entry.noteText && (
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{entry.noteText}</p>
        </div>
      )}

      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
        {entry.visibility === "PRIVATE" && (
          <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> Privado</span>
        )}
        {entry.visibility === "SHARED" && (
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Compartilhado</span>
        )}
        {entry.visibility === "DRAFT" && (
          <span className="flex items-center gap-1"><PenLine className="h-3 w-3" /> Rascunho</span>
        )}
        {entry.discussNextSession && (
          <span className="flex items-center gap-1 text-brand-500">
            <MessageCircle className="h-3 w-3" /> Discutir na sessão
          </span>
        )}
        {entry.reviewedAt && (
          <span className="flex items-center gap-1 text-green-500">
            <CheckCircle className="h-3 w-3" /> Revisado pelo terapeuta
          </span>
        )}
      </div>
    </div>
  );
}
