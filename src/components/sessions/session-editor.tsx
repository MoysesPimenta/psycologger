"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save, ChevronLeft, Clock, FileText, Tag, History,
  Paperclip, Upload, Trash2, Download, File, Image,
  AlertTriangle, X, CheckCircle2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateKey = "FREE" | "SOAP" | "BIRP";

interface FileAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string | null;
  createdAt: string;
  uploader?: { id: string; name: string | null };
}

interface Props {
  session: {
    id: string;
    noteText: string;
    templateKey: TemplateKey;
    tags: string[];
    sessionDate: string;
    revisions: { id: string; editedAt: string; editedById: string; editedBy?: { name: string | null; email: string } }[];
    files: FileAttachment[];
  } | null;
  patient: { id: string; fullName: string } | null;
  appointment: { id: string; startsAt: string; appointmentType?: { name: string } } | null;
  canEdit: boolean;
  userId: string;
}

// ─── Templates ────────────────────────────────────────────────────────────────

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

const TEMPLATES: Record<TemplateKey, string> = { FREE: "", SOAP: SOAP_TEMPLATE, BIRP: BIRP_TEMPLATE };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (mimeType === "application/pdf") return <File className="h-4 w-4 text-red-500" />;
  return <FileText className="h-4 w-4 text-gray-500" />;
}

// ─── File Attachment Panel ────────────────────────────────────────────────────

function FileAttachmentPanel({
  sessionId,
  initialFiles,
  canEdit,
  onCountChange,
}: {
  sessionId: string;
  initialFiles: FileAttachment[];
  canEdit: boolean;
  onCountChange?: (count: number) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileAttachment[]>(initialFiles);
  const updateFiles = (updater: (prev: FileAttachment[]) => FileAttachment[]) => {
    setFiles((prev) => {
      const next = updater(prev);
      onCountChange?.(next.length);
      return next;
    });
  };
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const uploadFiles = useCallback(async (fileList: FileList) => {
    if (!fileList.length) return;
    setUploading(true);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadProgress(`Enviando ${file.name} (${i + 1}/${fileList.length})…`);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetchWithCsrf(`/api/v1/sessions/${sessionId}/files`, { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) { toast({ title: typeof json?.error === "string" ? json.error : json?.error?.message ?? json?.message ?? "Erro ao enviar arquivo", variant: "destructive" }); continue; }
        updateFiles((prev) => [json.data, ...prev]);
        toast({ title: `${file.name} enviado`, variant: "success" });
      } catch {
        toast({ title: `Erro ao enviar ${file.name}`, variant: "destructive" });
      }
    }
    setUploading(false);
    setUploadProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [sessionId, toast]);

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  async function executeFileDelete(fileId: string) {
    setDeletingId(fileId);
    setConfirmDelete(null);
    try {
      const res = await fetchWithCsrf(`/api/v1/sessions/${sessionId}/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      updateFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast({ title: "Arquivo excluído", variant: "success" });
    } catch {
      toast({ title: "Erro ao excluir arquivo", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDownload(file: FileAttachment) {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/files/${file.id}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const url = json.data?.downloadUrl ?? file.downloadUrl;
      if (url) window.open(url, "_blank");
    } catch {
      if (file.downloadUrl) window.open(file.downloadUrl, "_blank");
      else toast({ title: "Não foi possível gerar link de download", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files); }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 cursor-pointer transition-colors",
            dragging ? "border-brand-400 bg-brand-50" : "border-gray-200 hover:border-brand-300 hover:bg-gray-50",
            uploading && "cursor-not-allowed opacity-60"
          )}
        >
          <input
            ref={fileInputRef}
            type="file" multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.doc,.docx"
            className="sr-only"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            disabled={uploading}
          />
          {uploading ? (
            <><Loader2 className="h-6 w-6 animate-spin text-brand-500" /><p className="text-xs text-gray-600">{uploadProgress}</p></>
          ) : (
            <>
              <Upload className="h-6 w-6 text-gray-400" />
              <p className="text-xs text-gray-600 text-center">
                <span className="font-medium text-brand-600">Clique para selecionar</span> ou arraste aqui
              </p>
              <p className="text-xs text-gray-400">PDF, imagens, Word · máx. 25 MB por arquivo</p>
            </>
          )}
        </div>
      )}

      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
              <div className="shrink-0"><FileIcon mimeType={file.mimeType} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{file.fileName}</p>
                <p className="text-xs text-gray-400">
                  {formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}
                  {file.uploader?.name && ` · ${file.uploader.name}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => handleDownload(file)} title="Baixar"
                  className="h-7 w-7 p-0 text-gray-400 hover:text-brand-600">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {canEdit && (
                  <Button variant="ghost" size="sm" disabled={deletingId === file.id}
                    onClick={() => setConfirmDelete({ id: file.id, name: file.fileName })} title="Excluir"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-red-600">
                    {deletingId === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-gray-400 py-2">Nenhum arquivo anexado</p>
      )}

      {/* File delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-labelledby="file-delete-title"
          onClick={() => setConfirmDelete(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <h2 id="file-delete-title" className="text-base font-semibold text-gray-900">Excluir arquivo?</h2>
            <p className="text-sm text-gray-600">
              O arquivo <strong>{confirmDelete.name}</strong> será removido permanentemente. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={() => executeFileDelete(confirmDelete.id)}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────

export function SessionEditor({ session, patient, appointment, canEdit }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [templateKey, setTemplateKey] = useState<TemplateKey>(session?.templateKey ?? "FREE");
  const [noteText, setNoteText] = useState(session?.noteText ?? "");
  const [tags, setTags] = useState<string[]>(session?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [sessionDate] = useState(session?.sessionDate ?? appointment?.startsAt ?? new Date().toISOString());
  // Track saved session id so file panel becomes available after first save
  const [savedSessionId, setSavedSessionId] = useState<string | null>(session?.id ?? null);
  // undefined = not yet checked, true/false = result
  const [storageOk, setStorageOk] = useState<boolean | undefined>(undefined);
  // Tracks the live file count (synced by FileAttachmentPanel via onCountChange)
  const [fileCount, setFileCount] = useState<number>(session?.files?.length ?? 0);

  // ── Unsaved-changes tracking ───────────────────────────────────────────────
  // Refs hold the last-saved snapshot; isDirty compares current state against them.
  const savedNoteText    = useRef(session?.noteText ?? "");
  const savedTemplateKey = useRef<TemplateKey>(session?.templateKey ?? "FREE");
  const savedTags        = useRef<string[]>(session?.tags ?? []);

  const isDirty =
    noteText !== savedNoteText.current ||
    templateKey !== savedTemplateKey.current ||
    JSON.stringify(tags) !== JSON.stringify(savedTags.current);

  // When the user tries to navigate away with unsaved changes we show a modal.
  // We store the destination href here; null = modal is hidden.
  const [pendingNavUrl, setPendingNavUrl] = useState<string | null>(null);

  // Guards ALL navigation when dirty.
  // Strategy: intercept link CLICKS in the capture phase, before Next.js
  // App Router starts any transition (patching pushState is too late —
  // the App Router drives route changes via startTransition independently
  // of the URL update, so blocking pushState doesn't stop the navigation).
  useEffect(() => {
    if (!isDirty) return;

    // Warn on tab-close / hard refresh
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Intercept every <a href> click before Next.js sees it
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      // Ignore: hash-only, external (new tab), mailto/tel
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingNavUrl(href);
    };
    document.addEventListener("click", handleClick, true /* capture */);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  /** User chose to stay — dismiss the modal, keep changes. */
  function handleNavCancel() {
    setPendingNavUrl(null);
  }

  /** User chose to leave — navigate programmatically (bypasses click guard). */
  function handleNavConfirm() {
    if (!pendingNavUrl) return;
    const url = pendingNavUrl;
    setPendingNavUrl(null);
    router.push(url);
  }

  // Probe storage config once we have a session ID
  function probeStorage(id: string) {
    if (storageOk !== undefined) return;
    fetch(`/api/v1/sessions/${id}/files`)
      .then((r) => setStorageOk(r.status !== 503))
      .catch(() => setStorageOk(false));
  }

  if (savedSessionId && storageOk === undefined) probeStorage(savedSessionId);

  function handleTemplateChange(key: TemplateKey) {
    setTemplateKey(key);
    if (!noteText && TEMPLATES[key]) setNoteText(TEMPLATES[key]);
  }

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  async function handleSave() {
    if (!noteText.trim()) { toast({ title: "A nota não pode estar vazia", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const isNew = !savedSessionId;
      const url = isNew ? "/api/v1/sessions" : `/api/v1/sessions/${savedSessionId}`;
      const method = isNew ? "POST" : "PATCH";
      const body = isNew
        ? { patientId: patient!.id, appointmentId: appointment?.id, templateKey, noteText, tags, sessionDate }
        : { noteText, templateKey, tags };

      const res = await fetchWithCsrf(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast({ title: isNew ? "Sessão criada!" : "Sessão salva!", variant: "success" });

      // Reset dirty baseline so the guard clears after save
      savedNoteText.current    = noteText;
      savedTemplateKey.current = templateKey;
      savedTags.current        = [...tags];

      if (isNew) {
        const newId: string = data.data.id;
        setSavedSessionId(newId);
        probeStorage(newId);
        router.replace(`/app/sessions/${newId}`);
      }
    } catch {
      toast({ title: "Erro ao salvar sessão", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSession() {
    if (!savedSessionId) return;
    setDeleting(true);
    try {
      const res = await fetchWithCsrf(`/api/v1/sessions/${savedSessionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Sessão excluída", variant: "success" });
      router.push(patient ? `/app/patients/${patient.id}` : "/app/today");
    } catch {
      toast({ title: "Erro ao excluir sessão", variant: "destructive" });
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Delete confirmation modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-labelledby="delete-session-title"
          onClick={() => setShowDeleteModal(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-session-title" className="text-base font-semibold text-gray-900">Excluir sessão clínica?</h2>
            <p className="text-sm text-gray-600">
              A sessão será removida imediatamente e excluída permanentemente após 30 dias. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteSession} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Excluir sessão
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={patient ? `/app/patients/${patient.id}` : "/app/today"}>
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{session ? "Nota clínica" : "Nova sessão"}</h1>
            {patient && (
              <p className="text-sm text-gray-500">{patient.fullName} · {formatDate(sessionDate)}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {session?.revisions && session.revisions.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-4 w-4 mr-1" />
              {session.revisions.length} revisõe{session.revisions.length !== 1 ? "s" : ""}
            </Button>
          )}
          {canEdit && savedSessionId && (
            <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(true)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir
            </Button>
          )}
          {canEdit && (
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Main area ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Template selector */}
          <div className="flex gap-2">
            {(["FREE", "SOAP", "BIRP"] as TemplateKey[]).map((key) => (
              <button key={key} onClick={() => handleTemplateChange(key)} disabled={!canEdit}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  templateKey === key ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}>
                {key === "FREE" ? "Texto livre" : key}
              </button>
            ))}
          </div>

          {/* Note textarea */}
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
              placeholder="Registre a evolução do paciente…"
              className="w-full p-4 text-sm text-gray-900 font-mono leading-relaxed resize-none focus:outline-none"
              style={{ minHeight: "420px" }}
            />
          </div>

          {/* ── File attachments ── */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
              <Paperclip className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Anexos</span>
              {savedSessionId && (
                <span className="ml-auto text-xs text-gray-400">
                  {fileCount} arquivo{fileCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="p-4">
              {!savedSessionId ? (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Salve a nota antes de adicionar anexos.
                </div>
              ) : storageOk === false ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Armazenamento não configurado. Adicione{" "}
                    <code className="font-mono bg-amber-100 px-1 rounded">SUPABASE_URL</code> e{" "}
                    <code className="font-mono bg-amber-100 px-1 rounded">SUPABASE_SERVICE_KEY</code> nas variáveis de
                    ambiente e crie o bucket <strong>session-files</strong> no Supabase Storage.
                  </span>
                </div>
              ) : (
                <FileAttachmentPanel
                  sessionId={savedSessionId}
                  initialFiles={session?.files ?? []}
                  canEdit={canEdit}
                  onCountChange={setFileCount}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Informações</h3>
            {appointment?.startsAt && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4 text-gray-400" />
                {formatDateTime(appointment.startsAt)}
              </div>
            )}
            {appointment?.id && (
              <Link href={`/app/appointments/${appointment.id}`} className="text-xs text-brand-600 hover:underline block">
                Ver consulta →
              </Link>
            )}
            {savedSessionId && (
              <div className="flex items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Salvo
              </div>
            )}
          </div>

          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <Tag className="h-4 w-4" /> Tags
            </h3>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs gap-1">
                  {tag}
                  {canEdit && (
                    <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-red-500 ml-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            {canEdit && (
              <input
                type="text" placeholder="Adicionar tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); } }}
                className="w-full text-xs border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            )}
          </div>

          {showHistory && session?.revisions && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Histórico de edições</h3>
              <div className="space-y-2">
                {session.revisions.map((rev) => (
                  <div key={rev.id} className="text-xs text-gray-500">
                    {formatDateTime(rev.editedAt)}
                    {rev.editedBy?.name && <span className="text-gray-400"> · {rev.editedBy.name}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Unsaved-changes confirmation modal ── */}
      {pendingNavUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog" aria-modal="true" aria-labelledby="unsaved-changes-title"
          onClick={handleNavCancel}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h2 id="unsaved-changes-title" className="text-sm font-semibold text-gray-900">Alterações não salvas</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Você tem alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleNavCancel}>
                Ficar na página
              </Button>
              <Button variant="destructive" size="sm" onClick={handleNavConfirm}>
                Sair sem salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
