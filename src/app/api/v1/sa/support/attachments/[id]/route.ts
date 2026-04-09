/**
 * GET /api/v1/sa/support/attachments/[id]
 * GET /api/v1/sa/support/attachments/[id]?force=1   (download quarantined file)
 *
 * SuperAdmin-only. Streams a decrypted SupportAttachment back to the browser.
 *
 * Security:
 *  - requireSuperAdmin gates the route.
 *  - Quarantined attachments require ?force=1 (an explicit acknowledgement)
 *    AND are returned with Content-Disposition: attachment so the browser
 *    will not preview them. Every download is audited.
 *  - Allowlisted (PDF / image) attachments are returned inline so the
 *    iframe-based viewer can render them via signed-URL or data: blob.
 *  - Bytes in storage are AES-256-GCM ciphertext; decryption happens in this
 *    handler with the server's ENCRYPTION_KEY (never exposed to the client).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptBuffer } from "@/lib/crypto";
import { downloadFile, SUPPORT_ATTACHMENTS_BUCKET } from "@/lib/storage";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { apiError, NotFoundError, BadRequestError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireSuperAdmin();
  const meta = extractRequestMeta(req);

  if (!UUID_RE.test(params.id)) {
    return apiError("BAD_REQUEST", "Invalid id", 400);
  }

  const att = await db.supportAttachment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true,
      quarantined: true,
      message: { select: { ticketId: true } },
    },
  });
  if (!att) {
    return apiError("NOT_FOUND", "Attachment not found", 404);
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  if (att.quarantined && !force) {
    return apiError("FORBIDDEN", "Attachment blocked. Use ?force=1 to download.", 403);
  }

  let plain: Buffer;
  try {
    const cipher = await downloadFile(att.storageKey, SUPPORT_ATTACHMENTS_BUCKET);
    plain = await decryptBuffer(cipher);
  } catch (err) {
    console.error("[sa/support/attachments] decrypt failed:", (err as Error).message);
    return apiError("INTERNAL_ERROR", "Failed to retrieve attachment", 500);
  }

  await auditLog({
    action: "SUPPORT_ATTACHMENT_DOWNLOADED",
    entity: "SupportAttachment",
    entityId: att.id,
    summary: {
      filename: att.filename,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      ticketId: att.message?.ticketId,
      quarantined: att.quarantined,
      forced: force,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  // Quarantined: always serve as a download (never inline) so the browser
  // cannot auto-execute or preview anything. Render-allowlisted: inline,
  // so the existing iframe viewer can show it.
  const disposition = att.quarantined
    ? `attachment; filename="${att.filename.replace(/"/g, "")}"`
    : `inline; filename="${att.filename.replace(/"/g, "")}"`;

  return new NextResponse(new Uint8Array(plain), {
    status: 200,
    headers: {
      "Content-Type": att.quarantined ? "application/octet-stream" : att.mimeType,
      "Content-Length": String(plain.length),
      "Content-Disposition": disposition,
      // Defence in depth — strict CSP so even an HTML attachment can't escape.
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
    },
  });
}
