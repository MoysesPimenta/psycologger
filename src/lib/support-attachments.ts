/**
 * Inbound support attachment pipeline.
 *
 * Resend's GET /emails/receiving/{id} returns an `attachments` array. We:
 *   1. Decode each attachment's bytes (base64 or signed URL).
 *   2. Enforce per-file (10 MB) and per-message (25 MB) size caps.
 *   3. Allowlist render-safe MIME types — everything else is quarantined.
 *   4. Encrypt the bytes with ENCRYPTION_KEY (binary AES-256-GCM).
 *   5. Upload ciphertext to the private "support-attachments" bucket.
 *   6. Persist a SupportAttachment row pointing at the storage key.
 *
 * The attachment row is the only thing user-facing code touches; raw bytes
 * are never written to the DB and the storage bucket bytes are ciphertext.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { encryptBuffer } from "@/lib/crypto";
import { uploadFile, SUPPORT_ATTACHMENTS_BUCKET } from "@/lib/storage";
import { auditLog } from "@/lib/audit";

const MAX_PER_FILE = 10 * 1024 * 1024; // 10 MB
const MAX_PER_MESSAGE = 25 * 1024 * 1024; // 25 MB

const RENDER_ALLOWLIST = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

interface RawAttachment {
  filename?: string;
  name?: string;
  content_type?: string;
  contentType?: string;
  content?: string; // base64
  url?: string; // signed download URL when content is too large to inline
}

function safeFilename(raw: string | undefined): string {
  const name = (raw ?? "anexo").trim();
  // Strip path separators and control chars; cap at 200 chars.
  return name
    .replace(/[\\/]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .slice(0, 200) || "anexo";
}

async function fetchAttachmentBytes(att: RawAttachment): Promise<Buffer | null> {
  if (att.content && typeof att.content === "string") {
    try {
      return Buffer.from(att.content, "base64");
    } catch {
      return null;
    }
  }
  if (att.url) {
    try {
      const res = await fetch(att.url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Process all attachments for a freshly-created SupportMessage. Best-effort:
 * a single attachment failure must not block the rest of the email landing.
 */
export async function processInboundAttachments(opts: {
  messageId: string;
  ticketId: string;
  attachments: unknown;
}): Promise<{ stored: number; quarantined: number; skipped: number }> {
  const list = Array.isArray(opts.attachments)
    ? (opts.attachments as RawAttachment[])
    : [];
  if (list.length === 0) return { stored: 0, quarantined: 0, skipped: 0 };

  let totalSize = 0;
  let stored = 0;
  let quarantined = 0;
  let skipped = 0;

  for (const att of list) {
    try {
      const filename = safeFilename(att.filename ?? att.name);
      const mimeType = (att.content_type || att.contentType || "application/octet-stream")
        .toString()
        .toLowerCase()
        .slice(0, 200);

      const bytes = await fetchAttachmentBytes(att);
      if (!bytes) {
        skipped++;
        continue;
      }

      if (bytes.length === 0 || bytes.length > MAX_PER_FILE) {
        console.warn("[support-attach] file size out of range", filename, bytes.length);
        skipped++;
        continue;
      }
      if (totalSize + bytes.length > MAX_PER_MESSAGE) {
        console.warn("[support-attach] message size cap reached, skipping rest");
        skipped++;
        break;
      }
      totalSize += bytes.length;

      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const isRenderable = RENDER_ALLOWLIST.has(mimeType);

      // Encrypt before any storage write — bytes at rest are always ciphertext.
      const ciphertext = await encryptBuffer(bytes);

      // Storage key: ticketId/messageId/sha256.bin — sha256 dedupes within
      // a message; the .bin extension is opaque since the actual mime is in
      // the DB row, not derived from the path.
      const storageKey = `${opts.ticketId}/${opts.messageId}/${sha256}.bin`;
      await uploadFile({
        buffer: ciphertext,
        fileName: storageKey,
        mimeType: "application/octet-stream",
        storageKey,
        bucket: SUPPORT_ATTACHMENTS_BUCKET,
      });

      const row = await db.supportAttachment.create({
        data: {
          messageId: opts.messageId,
          filename,
          mimeType,
          sizeBytes: bytes.length,
          sha256,
          storageKey,
          quarantined: !isRenderable,
        },
        select: { id: true },
      });

      if (isRenderable) {
        stored++;
        await auditLog({
          action: "SUPPORT_ATTACHMENT_STORED",
          entity: "SupportAttachment",
          entityId: row.id,
          summary: { filename, mimeType, sizeBytes: bytes.length, ticketId: opts.ticketId },
        });
      } else {
        quarantined++;
        await auditLog({
          action: "SUPPORT_ATTACHMENT_QUARANTINED",
          entity: "SupportAttachment",
          entityId: row.id,
          summary: { filename, mimeType, sizeBytes: bytes.length, ticketId: opts.ticketId },
        });
      }
    } catch (err) {
      skipped++;
      console.error("[support-attach] failed:", (err as Error).message);
    }
  }

  return { stored, quarantined, skipped };
}
