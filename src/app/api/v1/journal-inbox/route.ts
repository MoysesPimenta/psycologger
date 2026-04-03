/**
 * GET /api/v1/journal-inbox — Shared journal entries for therapist's assigned patients
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, parsePagination, buildMeta } from "@/lib/api";
import { getAuthContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { decrypt } from "@/lib/crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list"); // At minimum, must see patients

    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(searchParams);
    const tab = searchParams.get("tab") ?? "unread"; // "unread" | "discuss" | "all"

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      visibility: "SHARED",
      deletedAt: null,
      // Only entries from patients assigned to this therapist
      therapistId: ctx.userId,
    };

    if (tab === "unread") {
      where.reviewedAt = null;
    } else if (tab === "discuss") {
      where.discussNextSession = true;
    }

    const [total, entries] = await Promise.all([
      dbAny.journalEntry.count({ where }),
      dbAny.journalEntry.findMany({
        where,
        include: {
          patient: {
            select: { id: true, fullName: true, preferredName: true },
          },
        },
        orderBy: { createdAt: "desc" as const },
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
        return { ...entry, noteText };
      }),
    );

    return ok(decrypted, buildMeta(total, { page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}
