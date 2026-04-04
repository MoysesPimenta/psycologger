/**
 * DELETE /api/v1/journal-inbox/notes/[noteId] — Soft-delete a therapist note (author only)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, NotFoundError } from "@/lib/api";
import { getAuthContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

export async function DELETE(
  req: NextRequest,
  { params }: { params: { noteId: string } },
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");

    const note = await db.journalNote.findUnique({
      where: { id: params.noteId },
      select: { id: true, tenantId: true, authorId: true, deletedAt: true },
    });

    if (!note || note.tenantId !== ctx.tenantId || note.authorId !== ctx.userId || note.deletedAt) {
      throw new NotFoundError("Journal note");
    }

    await db.journalNote.update({
      where: { id: params.noteId },
      data: { deletedAt: new Date() },
    });

    return ok({ id: params.noteId, deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
