"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PortalCrisisCard } from "./portal-crisis-card";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/csrf-client";

const ENTRY_TYPES = [
  { value: "MOOD_CHECKIN", label: "Humor" },
  { value: "REFLECTION", label: "Reflexão" },
  { value: "SESSION_PREP", label: "Próxima sessão" },
  { value: "QUESTION", label: "Pergunta" },
  { value: "IMPORTANT_EVENT", label: "Evento" },
  { value: "GRATITUDE", label: "Gratidão" },
] as const;

const COMMON_EMOTIONS = [
  "ansiedade", "calma", "tristeza", "alegria", "medo",
  "raiva", "cansaço", "esperança", "frustração", "gratidão",
  "solidão", "paz", "confusão", "alívio",
];

const VISIBILITY_OPTIONS = [
  { value: "PRIVATE", label: "Privado (só você vê)" },
  { value: "SHARED", label: "Compartilhado com terapeuta" },
  { value: "DRAFT", label: "Rascunho" },
] as const;

export function PortalJournalNewClient() {
  const router = useRouter();
  const t = useTranslations("common");
  const [entryType, setEntryType] = useState<string>("MOOD_CHECKIN");
  const [visibility, setVisibility] = useState<string>("PRIVATE");
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [anxietyScore, setAnxietyScore] = useState<number | null>(null);
  const [energyScore, setEnergyScore] = useState<number | null>(null);
  const [sleepScore, setSleepScore] = useState<number | null>(null);
  const [emotionTags, setEmotionTags] = useState<string[]>([]);
  const [noteText, setNoteText] = useState("");
  const [discussNextSession, setDiscussNextSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crisisData, setCrisisData] = useState<{ phone: string; text: string } | null>(null);

  function toggleEmotion(tag: string) {
    setEmotionTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      } else if (prev.length >= 10) {
        // Show feedback that limit is reached
        return prev;
      } else {
        return [...prev, tag];
      }
    });
  }

  async function handleSave() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetchWithCsrf("/api/v1/portal/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType,
          visibility,
          moodScore,
          anxietyScore,
          energyScore,
          sleepScore,
          emotionTags,
          noteText: noteText.trim() || null,
          discussNextSession,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? "Erro ao salvar.");
        return;
      }

      const json = await res.json();

      if (json.data?.flaggedForSupport && json.data?.crisisResources) {
        setCrisisData(json.data.crisisResources);
        return; // Show crisis card before navigating
      }

      router.push("/portal/journal");
      router.refresh();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  if (crisisData) {
    return (
      <div className="space-y-4">
        <PortalCrisisCard phone={crisisData.phone} text={crisisData.text} />
        <p className="text-sm text-gray-500 text-center">Sua anotação foi salva.</p>
        <Button className="w-full" onClick={() => router.push("/portal/journal")}>
          Voltar ao diário
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <Link href="/portal/journal" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Voltar ao diário">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nova anotação</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-4 rounded-xl border border-red-200" role="alert">
          {error}
        </div>
      )}

      {/* Mood score */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Como você está? (opcional)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1"
            max="10"
            value={moodScore ?? 5}
            onChange={(e) => setMoodScore(Number(e.target.value))}
            className="flex-1 accent-brand-600"
          />
          <span className="text-lg font-bold text-gray-700 w-10 text-center">
            {moodScore ?? "—"}/10
          </span>
        </div>
        {moodScore === null && (
          <button
            type="button"
            onClick={() => setMoodScore(5)}
            className="text-xs text-brand-600 mt-1 hover:underline"
          >
            Registrar humor
          </button>
        )}
      </div>

      {/* Entry type */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2.5">Tipo</label>
        <div className="flex flex-wrap gap-2">
          {ENTRY_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setEntryType(value)}
              className={cn(
                "px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all active:scale-95",
                entryType === value
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "text-gray-600 border-gray-300 bg-white hover:bg-gray-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Emotion tags */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2.5">Emoções (opcional)</label>
        <div className="flex flex-wrap gap-2">
          {COMMON_EMOTIONS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleEmotion(tag)}
              disabled={emotionTags.length >= 10 && !emotionTags.includes(tag)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full border transition-all active:scale-95",
                emotionTags.includes(tag)
                  ? "bg-blue-100 text-blue-700 border-blue-300"
                  : emotionTags.length >= 10
                  ? "text-gray-300 border-gray-200 bg-gray-50 cursor-not-allowed"
                  : "text-gray-600 border-gray-300 bg-white hover:bg-gray-50",
              )}
            >
              {tag}
            </button>
          ))}
        </div>
        {emotionTags.length >= 10 && (
          <p className="text-xs text-amber-600 mt-2 font-medium">Limite de 10 emoções atingido</p>
        )}
      </div>

      {/* Additional scores */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Ansiedade", value: anxietyScore, setter: setAnxietyScore },
          { label: "Energia", value: energyScore, setter: setEnergyScore },
          { label: "Sono", value: sleepScore, setter: setSleepScore },
        ].map(({ label, value, setter }) => (
          <div key={label}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
            <input
              type="number"
              min="1"
              max="10"
              value={value ?? ""}
              onChange={(e) => setter(e.target.value ? Number(e.target.value) : null)}
              placeholder="1-10"
              className="w-full px-2 py-1.5 text-sm border rounded-lg text-center"
            />
          </div>
        ))}
      </div>

      {/* Note text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Escreva o que quiser...
        </label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          maxLength={5000}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
          placeholder="O que está na sua mente?"
        />
        <p className="text-xs text-gray-300 text-right mt-1">{noteText.length}/5000</p>
      </div>

      {/* Discuss checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={discussNextSession}
          onChange={(e) => setDiscussNextSession(e.target.checked)}
          className="accent-brand-600 h-4 w-4 rounded"
        />
        <span className="text-sm text-gray-700">Discutir na próxima sessão</span>
      </label>

      {/* Visibility */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2.5">Visibilidade</label>
        <div className="space-y-2.5">
          {VISIBILITY_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors" role="radio" aria-checked={visibility === value}>
              <input
                type="radio"
                name="visibility"
                value={value}
                checked={visibility === value}
                onChange={(e) => setVisibility(e.target.value)}
                className="accent-blue-600 h-4 w-4"
              />
              <span className="text-sm text-gray-700 font-medium">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Sticky save bar on mobile */}
      <div className="fixed bottom-24 inset-x-0 z-10 px-4 pb-4 bg-gradient-to-t from-white via-white to-transparent pt-4 max-w-lg md:max-w-2xl mx-auto">
        <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl active:scale-95 transition-all" disabled={loading}>
          {loading ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
