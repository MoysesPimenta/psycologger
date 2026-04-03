/**
 * GET    /api/v1/portal/journal/[id] — Get journal entry
 * PATCH  /api/v1/portal/journal/[id] — Edit entry (own, not yet reviewed)
 * DELETE /api/v1/portal/journal/[id] — Soft-delete entry
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, noContent, handleApiError, apiError } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";
import { containsCrisisKeywords } from "@/lib/safety";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { encrypt, decrypt } from "@/lib/crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

const updateSchema = z.object({
  entryType: z.enum([
    "MOOD_CHECKIN", "REFLECTION", "SESSION_PREP",
    "QUESTION", "IMPORTANT_EVENT", "GRATITUDE",
  ]).optional(),
  visibility: z.enum(["PRIVATE", "SHARED", "DRAFT"]).optional(),
  moodScore: z.number().int().min(1).max(10).nullable().optional(),
  anxietyScore: z.number().int().min(1).max(10).nullable().optional(),
  energyScore: z.number().int().min(1).max(10).nullable().optional(),
  sleepScore: z.number().int().min(1).max(10).nullable().optional(),
  emotionTags: z.array(z.string().max(50)).max(10).optional(),
  noteText: z.string().max(5000).nullable().optional(),
  discussNextSession: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getPatientContext(req);

    const entry = await dbAny.journalEntry.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
        deletedAt: null,
      },
    });

    if (!entry) {
      return apiError("NOT_FOUND", "Entrada não encontrada.", 404);
    }

    // Decrypt noteText for patient viewing
    let decryptedNote = entry.noteText;
    if (entry.noteText) {
      try {
        decryptedNote = await decrypt(entry.noteText);
      } catch (e) {
        // Log decryption failure but never return raw ciphertext
        console.error("[journal] Decryption failed for entry", params.id, e);
        decryptedNote = "[Não foi possível descriptografar esta entrada]";
      }
    }

    return ok({ ...entry, noteText: decryptedNote });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getPatientContext(req);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const entry = await dbAny.journalEntry.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
        deletedAt: null,
      },
    });

    if (!entry) {
      return apiError("NOT_FOUND", "Entrada não encontrada.", 404);
    }

    // Cannot edit once therapist has reviewed
    if (entry.reviewedAt) {
      return apiError("FORBIDDEN", "Não é possível editar uma entrada já revisada pelo terapeuta.", 403);
    }

    const body = updateSchema.parse(await req.json());

    // Build update data
    const data: Record<string, unknown> = {};
    if (body.entryType !== undefined) data.entryType = body.entryType;
    if (body.visibility !== undefined) data.visibility = body.visibility;
    if (body.moodScore !== undefined) data.moodScore = body.moodScore;
    if (body.anxietyScore !== undefined) data.anxietyScore = body.anxietyScore;
    if (body.energyScore !== undefined) data.energyScore = body.energyScore;
    if (body.sleepScore !== undefined) data.sleepScore = body.sleepScore;
    if (body.emotionTags !== undefined) data.emotionTags = body.emotionTags;
    if (body.discussNextSession !== undefined) data.discussNextSession = body.discussNextSession;

    if (body.noteText !== undefined) {
      // Re-check safety keywords
      if (body.noteText) {
        data.flaggedForSupport = containsCrisisKeywords(body.noteText);
        data.noteText = await encrypt(body.noteText);
      } else {
        data.noteText = null;
        data.flaggedForSupport = false;
      }
    }

    const updated = await dbAny.journalEntry.update({
      where: { id: params.id },
      data,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "PORTAL_JOURNAL_UPDATE",
      entity: "JournalEntry",
      entityId: params.id,
      summary: { fields: Object.keys(data) },
      ipAddress,
      userAgent,
    });

    return ok(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getPatientContext(req);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const entry = await dbAny.journalEntry.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
        deletedAt: null,
      },
    });

    if (!entry) {
      return apiError("NOT_FOUND", "Entrada não encontrada.", 404);
    }

    if (entry.reviewedAt) {
      return apiError("FORBIDDEN", "Não é possível excluir uma entrada já revisada.", 403);
    }

    // Soft delete
    await dbAny.journalEntry.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "PORTAL_JOURNAL_DELETE",
      entity: "JournalEntry",
      entityId: params.id,
      ipAddress,
      userAgent,
    });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
