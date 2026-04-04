"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StickyNote, Trash2, Loader2 } from "lucide-react";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface Note {
  id: string;
  noteText: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
}

interface Props {
  journalEntryId: string;
}

export default function JournalTherapistNotes({ journalEntryId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch notes on mount and when journalEntryId changes
  const fetchNotes = useCallback(async () => {
    if (!journalEntryId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/journal-inbox/${journalEntryId}/notes`
      );
      if (response.ok) {
        const result = await response.json();
        setNotes(result.data || []);
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setLoading(false);
    }
  }, [journalEntryId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAddNote = async () => {
    if (!newNoteText.trim() || saving) return;

    setSaving(true);
    try {
      const response = await fetchWithCsrf(
        `/api/v1/journal-inbox/${journalEntryId}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteText: newNoteText }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        // Prepend the new note to the list
        setNotes([result.data, ...notes]);
        setNewNoteText("");
      }
    } catch (error) {
      console.error("Error adding note:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const confirmed = window.confirm(
      "Tem certeza que deseja deletar esta nota?"
    );
    if (!confirmed) return;

    setDeleting(noteId);
    try {
      const response = await fetchWithCsrf(
        `/api/v1/journal-inbox/notes/${noteId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setNotes(notes.filter((note) => note.id !== noteId));
      }
    } catch (error) {
      console.error("Error deleting note:", error);
    } finally {
      setDeleting(null);
    }
  };

  const isEmpty = notes.length === 0 && !newNoteText;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <StickyNote size={16} />
        Notas do Terapeuta
      </div>

      {/* Empty state */}
      {isEmpty && (
        <p className="text-xs text-gray-500">Nenhuma nota ainda.</p>
      )}

      {/* Notes list */}
      {notes.map((note) => (
        <div
          key={note.id}
          className="bg-amber-50 border border-amber-200 rounded-lg p-3 group"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="text-xs text-gray-600">
              <span className="font-medium">{note.author.name}</span>
              {" • "}
              <span>
                {formatDistanceToNow(new Date(note.createdAt), {
                  locale: ptBR,
                })}
                {" atrás"}
              </span>
            </div>
            <button
              onClick={() => handleDeleteNote(note.id)}
              disabled={deleting === note.id}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-amber-100 rounded text-gray-500 hover:text-red-600 disabled:opacity-50"
              aria-label="Deletar nota"
            >
              {deleting === note.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {note.noteText}
          </p>
        </div>
      ))}

      {/* Add note area */}
      <div className="space-y-2 pt-2">
        <textarea
          value={newNoteText}
          onChange={(e) =>
            setNewNoteText(e.target.value.slice(0, 5000))
          }
          placeholder="Adicionar nota privada..."
          maxLength={5000}
          className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          rows={3}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {newNoteText.length}/5000
          </span>
          <button
            onClick={handleAddNote}
            disabled={!newNoteText.trim() || saving}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
