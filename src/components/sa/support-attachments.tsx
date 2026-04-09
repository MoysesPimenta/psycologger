"use client";

/**
 * Renders the attachment strip below a SupportMessage.
 *
 * - Render-allowlisted images → <img> via the SA-only stream endpoint.
 * - Render-allowlisted PDFs   → "Abrir PDF" link that opens the same endpoint
 *                               in a new tab (browser native viewer).
 * - Quarantined files         → "Baixar anexo bloqueado" button with a confirm
 *                               dialog; download is audited server-side.
 */

import { useState } from "react";
import { FileText, ImageIcon, ShieldAlert, Download } from "lucide-react";

export interface SupportAttachmentLite {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  quarantined: boolean;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SupportAttachments({ items }: { items: SupportAttachmentLite[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((a) => (
        <Attachment key={a.id} a={a} />
      ))}
    </div>
  );
}

function Attachment({ a }: { a: SupportAttachmentLite }) {
  const url = `/api/v1/sa/support/attachments/${a.id}`;
  const isImage = a.mimeType.startsWith("image/");
  const isPdf = a.mimeType === "application/pdf";

  if (a.quarantined) return <Quarantined a={a} />;

  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={`${a.filename} · ${fmtSize(a.sizeBytes)}`}
        className="block rounded border border-gray-700 bg-gray-900 p-1 hover:border-brand-500"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={a.filename}
          className="max-h-32 max-w-[160px] rounded object-cover"
        />
        <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-gray-400">
          <ImageIcon className="h-3 w-3" />
          <span className="truncate max-w-[140px]">{a.filename}</span>
        </div>
      </a>
    );
  }

  if (isPdf) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 hover:border-brand-500"
        title={`${a.filename} · ${fmtSize(a.sizeBytes)}`}
      >
        <FileText className="h-4 w-4 text-red-400" />
        <span className="truncate max-w-[200px]">{a.filename}</span>
        <span className="text-gray-500">{fmtSize(a.sizeBytes)}</span>
      </a>
    );
  }

  // Renderable mime type the page didn't special-case (shouldn't happen given
  // the allowlist, but degrade to a plain link rather than crashing).
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 hover:border-brand-500"
    >
      <Download className="h-4 w-4" />
      <span className="truncate max-w-[200px]">{a.filename}</span>
      <span className="text-gray-500">{fmtSize(a.sizeBytes)}</span>
    </a>
  );
}

function Quarantined({ a }: { a: SupportAttachmentLite }) {
  const [downloading, setDownloading] = useState(false);
  const onClick = async () => {
    const ok = window.confirm(
      `O anexo "${a.filename}" (${a.mimeType}) foi colocado em quarentena por ser de um tipo potencialmente perigoso.\n\nBaixar mesmo assim? Esta ação será registrada nos logs de auditoria.`
    );
    if (!ok) return;
    setDownloading(true);
    try {
      // Use a hidden anchor so the browser handles Content-Disposition.
      const link = document.createElement("a");
      link.href = `/api/v1/sa/support/attachments/${a.id}?force=1`;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={downloading}
      className="inline-flex items-center gap-2 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-xs text-amber-200 hover:bg-amber-950/60 disabled:opacity-60"
      title={`${a.mimeType} · ${fmtSize(a.sizeBytes)} · em quarentena`}
    >
      <ShieldAlert className="h-4 w-4" />
      <span className="truncate max-w-[200px]">{a.filename}</span>
      <span className="text-amber-300/70">Baixar anexo bloqueado</span>
    </button>
  );
}
