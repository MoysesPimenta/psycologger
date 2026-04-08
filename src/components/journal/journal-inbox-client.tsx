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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { useTranslations } from "next-intl";
import { JournalPatientSidebar } from "./journal-patient-sidebar";
import JournalTherapistNotes from "./journal-therapist-notes";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  notesCount: number;
  createdAt: string;
  patient: {
    id: string;
    fullName: string;
    preferredName: string | null;
  };
}

interface PatientSummary {
  patientId: string;
  fullName: string;
  preferredName: string | null;
  unreadCount: number;
  flaggedCount: number;
  discussCount: number;
  totalShared: number;
  lastEntryAt: string | null;
  latestMoodScore: number | null;
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

export function JournalInboxClient() {
  const t = useTranslations("journal");

  // State
  const [tab, setTab] = useState<"unread" | "discuss" | "all">("unread");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // Patient sidebar state
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // ─── Data fetching ───────────────────────────────────────────────────────

  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true);
    try {
      const res = await fetch("/api/v1/journal-inbox/patients");
      if (res.ok) {
        const json = await res.json();
        setPatients(json.data);
      }
    } catch {
      /* non-critical */
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ tab, pageSize: "50" });
    if (selectedPatientId) {
      params.set("patientId", selectedPatientId);
    }
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
  }, [tab, selectedPatientId]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  useEffect(() => {
    fetchEntries();
    setSelectedId(null);
  }, [fetchEntries]);

  // ─── Actions ─────────────────────────────────────────────────────────────

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
      // Update patient unread counts
      fetchPatients();
      setSelectedId(null);
    }
    setReviewing(false);
  }

  function handleSelectPatient(patientId: string | null) {
    setSelectedPatientId(patientId);
    setSelectedId(null);
  }

  const selected = entries.find((e) => e.id === selectedId);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("title")}
        </h1>
        <p className="text-sm text-gray-500">
          {t("subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["unread", "discuss", "all"] as const).map((tabName) => (
          <button
            key={tabName}
            onClick={() => {
              setTab(tabName);
              setSelectedId(null);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === tabName
                ? "bg-brand-600 text-white"
                : "bg-white text-gray-600 border hover:bg-gray-50",
            )}
          >
            {tabName === "unread"
              ? t("unread")
              : tabName === "discuss"
                ? t("discussTab")
                : t("all")}
          </button>
        ))}
      </div>

      {/* Three-panel layout */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_1fr] gap-4" style={{ minHeight: "70vh" }}>
        {/* Left: Patient sidebar */}
        <div className="hidden md:block">
          <JournalPatientSidebar
            patients={patients}
            selectedPatientId={selectedPatientId}
            onSelectPatient={handleSelectPatient}
            loading={patientsLoading}
          />
        </div>

        {/* Mobile: Patient dropdown */}
        <div className="md:hidden">
          <select
            value={selectedPatientId ?? ""}
            onChange={(e) => handleSelectPatient(e.target.value || null)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">{t("allPatients")}</option>
            {patients.map((p) => (
              <option key={p.patientId} value={p.patientId}>
                {p.preferredName ?? p.fullName}
                {p.unreadCount > 0 ? ` (${p.unreadCount})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Middle: Entry list */}
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-gray-200 rounded-xl" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-sm text-gray-400">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              {tab === "unread"
                ? t("reviewed")
                : t("noEntries")}
            </div>
          ) : (
            entries.map((entry) => {
              const patientName =
                entry.patient.preferredName ?? entry.patient.fullName;
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
                      <p className="font-medium text-gray-900 text-sm">
                        {patientName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                        </span>
                        {entry.moodScore != null && (
                          <span className="text-xs text-gray-400">
                            · Humor: {entry.moodScore}/10
                          </span>
                        )}
                      </div>
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
                        <AlertTriangle className="h-3 w-3" /> {t("alert")}
                      </span>
                    )}
                    {entry.discussNextSession && (
                      <span className="flex items-center gap-1 text-[11px] text-brand-500">
                        <MessageCircle className="h-3 w-3" /> {t("discuss")}
                      </span>
                    )}
                    {entry.notesCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-600">
                        <StickyNote className="h-3 w-3" /> {entry.notesCount}
                      </span>
                    )}
                    {entry.reviewedAt ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-500">
                        <Check className="h-3 w-3" /> {t("reviewedLabel")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-500 font-medium">
                        {t("unreadLabel")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="overflow-y-auto" style={{ maxHeight: "70vh" }}>
          {selected ? (
            <div className="bg-white border rounded-xl p-5 space-y-4 sticky top-4">
              {/* Header */}
              <div>
                <p className="font-semibold text-gray-900">
                  {selected.patient.preferredName ?? selected.patient.fullName}
                </p>
                <p className="text-sm text-gray-500">
                  {ENTRY_TYPE_LABELS[selected.entryType]} ·{" "}
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
                    <p className="text-xs text-gray-400">{t("mood")}</p>
                    <p className="text-lg font-bold">{selected.moodScore}/10</p>
                  </div>
                )}
                {selected.anxietyScore != null && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-gray-400">{t("anxiety")}</p>
                    <p className="text-lg font-bold">
                      {selected.anxietyScore}/10
                    </p>
                  </div>
                )}
                {selected.energyScore != null && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-gray-400">{t("energy")}</p>
                    <p className="text-lg font-bold">
                      {selected.energyScore}/10
                    </p>
                  </div>
                )}
                {selected.sleepScore != null && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-gray-400">{t("sleep")}</p>
                    <p className="text-lg font-bold">
                      {selected.sleepScore}/10
                    </p>
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

              {/* Note text */}
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
                  {t("flaggedAuto")}
                </div>
              )}
              {selected.discussNextSession && (
                <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-sm text-brand-700">
                  <MessageCircle className="h-4 w-4 inline mr-1" />
                  {t("discussNextSession")}
                </div>
              )}

              {/* Review action - note: keeping PT locale for date formatting since this is clinical notes */}
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

              {/* Therapist notes section */}
              <div className="border-t pt-4">
                <JournalTherapistNotes journalEntryId={selected.id} />
              </div>
            </div>
          ) : (
            <div className="bg-white border rounded-xl p-8 text-center text-gray-400 h-full flex flex-col items-center justify-center">
              <BookOpen className="h-10 w-10 mb-3 text-gray-300" />
              <p className="text-sm">
                Selecione uma entrada para ver os detalhes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
