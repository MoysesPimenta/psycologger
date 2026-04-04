/**
 * GET  /api/v1/journal-inbox/[id]/notes — List therapist notes for a journal entry
 * POST /api/v1/journal-inbox/[id]/notes — Create a therapist note on a journal entry
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, created, handleApiError, apiError, NotFoundError } from "@/lib/api";
import { getAuthContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { encrypt, decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const createNoteSchema = z.object({
  noteText: z.string().min(1).max(5000),
});

/** Verify the journal entry exists, is SHARED, belongs to tenant, and the user is the assigned therapist */
async function verifyEntryAccess(entryId: string, ctx: { tenantId: string; userId: string }) {
  const entry = await db.journalEntry.findUnique({
    where: { id: entryId },
    select: { id: true, tenantId: true, visibility: true, therapistId: true },
  });

  if (!entry || entry.tenantId !== ctx.tenantId) {
    throw new NotFoundError("Journal entry");
  }
  if (entry.visibility !== "SHARED") {
    throw new NotFoundError("Journal entry");
  }
  if (entry.therapistId !== ctx.userId) {
    throw new NotFoundError("Journal entry");
  }
  return entry;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");

    await verifyEntryAccess(params.id, ctx);

    const notes = await db.journalNote.findMany({
      where: { journalEntryId: params.id, deletedAt: null },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" as const },
    });

    // Decrypt each note's text
    const decrypted = await Promise.all(
      notes.map(async (note: Record<string, unknown>) => {
        let text = note.noteText as string;
        try {
          text = await decrypt(text);
        } catch {
          text = "[Não foi possível descriptografar]";
        }
        return { ...note, noteText: text };
      }),
    );

    return ok(decrypted);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");

    // Rate limit therapist notes: 60 per hour per user
    const rl = await rateLimit(`therapist-notes:${ctx.userId}`, 60, 3600 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Limite de notas atingido. Tente novamente mais tarde." } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { noteText } = createNoteSchema.parse(body);

    await verifyEntryAccess(params.id, ctx);

    const encryptedText = await encrypt(noteText);

    const note = await db.journalNote.create({
      data: {
        tenantId: ctx.tenantId,
        journalEntryId: params.id,
        authorId: ctx.userId,
        noteText: encryptedText,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    // Return plaintext version to caller (avoid extra decrypt round-trip)
    return created({ ...note, noteText });
  } catch (err) {
    return handleApiError(err);
  }
}
