"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, ChevronLeft, Clock, FileText, Tag, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TemplateKey = "FREE" | "SOAP" | "BIRP";

interface Props {
  session: {
    id: string;
    noteText: string;
    templateKey: TemplateKey;
    tags: string[];
    sessionDate: string;
    revisions: { id: string; editedAt: string; editedById: string }[];
    files: { id: string; fileName: string }[];
  } | null;
  patient: { id: string; fullName: string } | null;
  appointment: { id: string; startsAt: string; appointmentType?: { name: string } } | null;
  canEdit: boolean;
  userId: string;
}

const SOAP_TEMPLATE = `**S — Subjetivo**
(O que o paciente relatou)

**O — Objetivo**
(Observações do profissional)

**A — Avaliação**
(Impressão clínica)

**P — Plano**
(Próximos passos)
`;

const BIRP_TEMPLATE = `**B — Comportamento**
(Comportamentos observados)

**I — Intervenção**
(Técnicas utilizadas)

**R — Resposta**
(Resposta do paciente)

**P — Plano**
(Próximos passos)
`;

const TEMPLATES: Record<TemplateKey, string> = {
  FREE: "",
  SOAP: SOAP_TEMPLATE,
  BIRP: BIRP_TEMPLATE,
};

export function SessionEditor({ session, patient, appointment, canEdit, userId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setSaving] = useState(false);
  const [templateKey, setTemplateKey] = useState<TemplateKey>(session?.templateKey ?? "FREE");
  const [noteText, setNoteText] = useState(session?.noteText ?? "");
  const [tags, setTags] = useState<string[]>(session?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [sessionDate] = useState(
    session?.sessionDate ?? appointment?.startsAt ?? new Date().toISOString()
  );

  function handleTemplateChange(key: TemplateKey) {
    setTemplateKey(key);
    if (!noteText && TEMPLATES[key]) {
      setNoteText(TEMPLATES[key]);
    }
  }

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  async function handleSave() {
    if (!noteText.trim()) {
      toast({ title: "A nota não pode estar vazia", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const isNew = !session;
      const url = isNew ? "/api/v1/sessions" : `/api/v1/sessions/${session!.id}`;
      const method = isNew ? "POST" : "PATCH";
      const body = isNew
        ? {
            patientId: patient!.id,
            appointmentId: appointment?.id,
            templateKey,
            noteText,
            tags,
            sessionDate,
          }
        : { noteText, templateKey, tags };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error();
      const data = await res.json();

      toast({ title: isNew ? "Sessão criada!" : "Sessão salva!", variant: "success" });

      if (isNew) {
        router.push(`/app/sessions/${data.data.id}`);
      }
    } catch {
      toast({ title: "Erro ao salvar sessão", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={patient ? `/app/patients/${patient.id}` : "/app/today"}>
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {session ? "Nota clínica" : "Nova sessão"}
            </h1>
            {patient && (
              <p className="text-sm text-gray-500">
                {patient.fullName} · {formatDate(sessionDate)}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {session?.revisions && session.revisions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-4 w-4" />
              {session.revisions.length} revisõe{session.revisions.length !== 1 ? "s" : ""}
            </Button>
          )}
          {canEdit && (
            <Button onClick={handleSave} loading={loading} size="sm">
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main editor */}
        <div className="lg:col-span-3 space-y-4">
          {/* Template selector */}
          <div className="flex gap-2">
            {(["FREE", "SOAP", "BIRP"] as TemplateKey[]).map((key) => (
              <button
                key={key}
                onClick={() => handleTemplateChange(key)}
                disabled={!canEdit}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  templateKey === key
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {key === "FREE" ? "Texto livre" : key}
              </button>
            ))}
          </div>

          {/* Text editor */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Nota clínica</span>
              <span className="ml-auto text-xs text-gray-400">{noteText.length} caracteres</span>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              readOnly={!canEdit}
              placeholder="Registre a evolução do paciente..."
              className="w-full p-4 text-sm text-gray-900 font-mono leading-relaxed resize-none focus:outline-none"
              style={{ minHeight: "400px" }}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Session info */}
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Informações</h3>
            {appointment?.startsAt && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4 text-gray-400" />
                {formatDateTime(appointment.startsAt)}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <Tag className="h-4 w-4" /> Tags
            </h3>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                  {canEdit && (
                    <button
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                      className="ml-1 hover:text-red-500"
                    >
                      ×
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            {canEdit && (
              <input
                type="text"
                placeholder="Adicionar tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                className="w-full text-xs border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            )}
          </div>

          {/* Revision history */}
          {showHistory && session?.revisions && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Histórico de edições</h3>
              <div className="space-y-2">
                {session.revisions.map((rev) => (
                  <div key={rev.id} className="text-xs text-gray-500">
                    {formatDateTime(rev.editedAt)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
