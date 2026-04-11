/**
 * GET /api/v1/journal-inbox — Shared journal entries for therapist's assigned patients
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, parsePagination, buildMeta } from "@/lib/api";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list"); // At minimum, must see patients
    requireTenant(ctx);

    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(searchParams);
    const tab = searchParams.get("tab") ?? "unread"; // "unread" | "discuss" | "all"

    const patientId = searchParams.get("patientId"); // Optional: filter by specific patient

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      visibility: "SHARED",
      deletedAt: null,
      // Only entries from patients assigned to this therapist
      therapistId: ctx.userId,
    };

    // Filter by specific patient when provided
    if (patientId) {
      where.patientId = patientId;
    }

    if (tab === "unread") {
      where.reviewedAt = null;
    } else if (tab === "discuss") {
      where.discussNextSession = true;
    }

    const [total, entries] = await Promise.all([
      db.journalEntry.count({ where }),
      db.journalEntry.findMany({
        where,
        include: {
          patient: {
            select: { id: true, fullName: true, preferredName: true },
          },
          _count: {
            select: { notes: { where: { deletedAt: null } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    // Decrypt noteText for therapist viewing (SHARED entries only)
    const decrypted = await Promise.all(
      entries.map(async (entry: Record<string, unknown>) => {
        let noteText = entry.noteText as string | null;
        if (noteText) {
          try {
            noteText = await decrypt(noteText);
          } catch (e) {
            console.error("[journal-inbox] Decryption failed for entry", entry.id, e);
            noteText = "[Não foi possível descriptografar esta entrada]";
          }
        }
        const notesCount = (entry as Record<string, unknown>)._count
          ? ((entry as Record<string, unknown>)._count as Record<string, number>).notes ?? 0
          : 0;
        return { ...entry, noteText, notesCount };
      }),
    );

    return ok(decrypted, buildMeta(total, { page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}
