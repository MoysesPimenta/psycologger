/**
 * PATCH /api/v1/journal-inbox/[id]/review — Mark journal entry as reviewed
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, apiError } from "@/lib/api";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");
    requireTenant(ctx);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Only SHARED entries assigned to this therapist
    const entry = await db.journalEntry.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        therapistId: ctx.userId,
        visibility: "SHARED",
        deletedAt: null,
      },
    });

    if (!entry) {
      return apiError("NOT_FOUND", "Entrada não encontrada.", 404);
    }

    if (entry.reviewedAt) {
      return ok({ alreadyReviewed: true });
    }

    await db.journalEntry.update({
      where: { id: params.id },
      data: {
        reviewedAt: new Date(),
        reviewedById: ctx.userId,
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PORTAL_JOURNAL_REVIEWED",
      entity: "JournalEntry",
      entityId: params.id,
      ipAddress,
      userAgent,
    });

    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
