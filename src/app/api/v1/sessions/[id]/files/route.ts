/**
 * POST /api/v1/sessions/[id]/files  — upload a file attachment
 * GET  /api/v1/sessions/[id]/files  — list files for a session
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, NotFoundError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { uploadFile, signedDownloadUrl, isStorageConfigured } from "@/lib/storage";
import { randomUUID } from "crypto";
import { validateMimeType } from "@/lib/mime-check";

import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/constants";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "sessions:view");

    const session = await db.clinicalSession.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        // PSYCHOLOGIST can only access their own sessions' files
        ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      },
    });
    if (!session) throw new NotFoundError("Session");

    const files = await db.fileObject.findMany({
      where: { sessionId: params.id, tenantId: ctx.tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
        createdAt: true,
        uploader: { select: { id: true, name: true } },
      },
    });

    // Attach fresh signed URLs (expire in 1 h)
    const filesWithUrls = await Promise.all(
      files.map(async (f) => {
        try {
          const url = await signedDownloadUrl(f.storageKey);
          return { ...f, downloadUrl: url };
        } catch {
          return { ...f, downloadUrl: null };
        }
      })
    );

    return ok(filesWithUrls);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "files:uploadClinical");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    if (!isStorageConfigured()) {
      return new Response(
        JSON.stringify({
          error: "Armazenamento de arquivos não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_KEY nas variáveis de ambiente.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = await db.clinicalSession.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        // PSYCHOLOGIST can only upload to their own sessions
        ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      },
    });
    if (!session) throw new NotFoundError("Session");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(
        JSON.stringify({ error: "Nenhum arquivo enviado." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate size
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return new Response(
        JSON.stringify({ error: `Arquivo muito grande. Máximo: ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024} MB.` }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate mime type (allow any if list empty)
    if (ALLOWED_TYPES.length > 0 && !ALLOWED_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: `Tipo de arquivo não permitido: ${file.type}` }),
        { status: 415, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build storage key: tenant/session/uuid-originalname
    const ext = file.name.includes(".") ? file.name.split(".").pop()! : "";
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `${ctx.tenantId}/${params.id}/${randomUUID()}-${safeFileName}`;

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Magic-byte MIME validation — prevents spoofed Content-Type headers
    if (!validateMimeType(buffer, file.type)) {
      return new Response(
        JSON.stringify({ error: "O conteúdo do arquivo não corresponde ao tipo declarado." }),
        { status: 415, headers: { "Content-Type": "application/json" } }
      );
    }

    // Upload to Supabase Storage
    await uploadFile({ buffer, fileName: file.name, mimeType: file.type || "application/octet-stream", storageKey });

    // Store metadata in DB
    const fileObject = await db.fileObject.create({
      data: {
        tenantId: ctx.tenantId,
        sessionId: params.id,
        patientId: session.patientId,
        uploaderId: ctx.userId,
        storageKey,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        isClinical: true,
      },
      select: {
        id: true, fileName: true, mimeType: true, sizeBytes: true, storageKey: true, createdAt: true,
        uploader: { select: { id: true, name: true } },
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "FILE_UPLOAD",
      entity: "FileObject",
      entityId: fileObject.id,
      summary: { sessionId: params.id, fileName: file.name, sizeBytes: file.size },
      ipAddress,
      userAgent,
    });

    // Return with signed download URL
    let downloadUrl: string | null = null;
    try { downloadUrl = await signedDownloadUrl(storageKey); } catch { /* non-fatal */ }

    return created({ ...fileObject, downloadUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
