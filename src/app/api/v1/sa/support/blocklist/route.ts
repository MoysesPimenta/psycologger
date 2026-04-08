/**
 * POST /api/v1/sa/support/blocklist — add an entry.
 * DELETE /api/v1/sa/support/blocklist?id=... — remove an entry.
 * SA-only, audited.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { apiError, handleApiError, ok, created } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddSchema = z.object({
  kind: z.enum(["EMAIL", "DOMAIN"]),
  pattern: z.string().trim().min(3).max(254),
  reason: z.string().max(500).optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const saUserId = await requireSuperAdmin();
    const meta = extractRequestMeta(req);

    const parsed = AddSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Entrada inválida", 400, parsed.error.flatten());
    }

    const pattern = parsed.data.pattern.toLowerCase();
    // Rough shape validation.
    if (parsed.data.kind === "EMAIL" && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(pattern)) {
      return apiError("VALIDATION_ERROR", "Email inválido", 400);
    }
    if (parsed.data.kind === "DOMAIN" && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(pattern)) {
      return apiError("VALIDATION_ERROR", "Domínio inválido", 400);
    }

    const entry = await db.supportBlocklist.upsert({
      where: { kind_pattern: { kind: parsed.data.kind, pattern } },
      create: {
        kind: parsed.data.kind,
        pattern,
        reason: parsed.data.reason ?? null,
        createdBy: saUserId,
      },
      update: { reason: parsed.data.reason ?? null },
      select: { id: true, kind: true, pattern: true },
    });

    await auditLog({
      userId: saUserId,
      action: "SUPPORT_BLOCKLIST_ADDED",
      entity: "SupportBlocklist",
      entityId: entry.id,
      summary: { kind: entry.kind, pattern: entry.pattern },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return created(entry);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const saUserId = await requireSuperAdmin();
    const meta = extractRequestMeta(req);

    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) return apiError("VALIDATION_ERROR", "ID inválido", 400);

    const existing = await db.supportBlocklist.findUnique({ where: { id } });
    if (!existing) return apiError("NOT_FOUND", "Entrada não encontrada", 404);

    await db.supportBlocklist.delete({ where: { id } });

    await auditLog({
      userId: saUserId,
      action: "SUPPORT_BLOCKLIST_REMOVED",
      entity: "SupportBlocklist",
      entityId: id,
      summary: { kind: existing.kind, pattern: existing.pattern },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return ok({ id });
  } catch (err) {
    return handleApiError(err);
  }
}
