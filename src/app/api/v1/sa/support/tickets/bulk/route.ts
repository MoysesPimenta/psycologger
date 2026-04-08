/**
 * POST /api/v1/sa/support/tickets/bulk
 * SA-only: bulk action on multiple support tickets.
 * Actions:
 *  - SET_STATUS { status: OPEN|PENDING|CLOSED }
 *  - DELETE (hard-deletes ticket + messages via cascade on SupportMessage.ticketId)
 *  - BLOCK_SENDERS (adds fromEmail of each ticket to EMAIL blocklist, idempotent)
 *
 * Every action is audited per-ticket so the audit trail remains granular.
 * Input is capped at 200 ticket IDs to protect the server.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { apiError, handleApiError, ok } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SET_STATUS"),
    ticketIds: z.array(z.string().regex(UUID_RE)).min(1).max(200),
    status: z.enum(["OPEN", "PENDING", "CLOSED"]),
  }),
  z.object({
    action: z.literal("DELETE"),
    ticketIds: z.array(z.string().regex(UUID_RE)).min(1).max(200),
  }),
  z.object({
    action: z.literal("BLOCK_SENDERS"),
    ticketIds: z.array(z.string().regex(UUID_RE)).min(1).max(200),
    reason: z.string().max(500).optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const saUserId = await requireSuperAdmin();
    const meta = extractRequestMeta(req);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Entrada inválida", 400, parsed.error.flatten());
    }

    const { action, ticketIds } = parsed.data;

    // Load tickets first so we can audit accurately and only touch real rows.
    const tickets = await db.supportTicket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, status: true, fromEmail: true },
    });
    if (tickets.length === 0) {
      return apiError("NOT_FOUND", "Nenhum ticket encontrado", 404);
    }

    if (action === "SET_STATUS") {
      const targetStatus = parsed.data.status;
      const toUpdate = tickets.filter((t) => t.status !== targetStatus);
      if (toUpdate.length > 0) {
        await db.supportTicket.updateMany({
          where: { id: { in: toUpdate.map((t) => t.id) } },
          data: { status: targetStatus },
        });
        for (const t of toUpdate) {
          await auditLog({
            userId: saUserId,
            action: "SUPPORT_TICKET_STATUS_CHANGED",
            entity: "SupportTicket",
            entityId: t.id,
            summary: { from: t.status, to: targetStatus, bulk: true },
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          });
        }
      }
      return ok({ action, affected: toUpdate.length });
    }

    if (action === "DELETE") {
      // Messages are cascaded via the SupportMessage.ticketId FK. Confirm in
      // prisma/schema.prisma before relying on it; fall back to manual delete
      // if cascade is not set.
      await db.supportMessage.deleteMany({
        where: { ticketId: { in: tickets.map((t) => t.id) } },
      });
      await db.supportTicket.deleteMany({
        where: { id: { in: tickets.map((t) => t.id) } },
      });
      for (const t of tickets) {
        await auditLog({
          userId: saUserId,
          action: "SUPPORT_TICKET_STATUS_CHANGED",
          entity: "SupportTicket",
          entityId: t.id,
          summary: { bulk: true, deleted: true, fromEmail: t.fromEmail },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }
      return ok({ action, affected: tickets.length });
    }

    // BLOCK_SENDERS
    const reason = parsed.data.reason ?? "bulk block from /sa/support";
    const uniqueEmails = Array.from(
      new Set(tickets.map((t) => t.fromEmail.trim().toLowerCase()).filter(Boolean))
    );
    let added = 0;
    for (const pattern of uniqueEmails) {
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(pattern)) continue;
      const entry = await db.supportBlocklist.upsert({
        where: { kind_pattern: { kind: "EMAIL", pattern } },
        create: { kind: "EMAIL", pattern, reason, createdBy: saUserId },
        update: { reason },
        select: { id: true, pattern: true },
      });
      added++;
      await auditLog({
        userId: saUserId,
        action: "SUPPORT_BLOCKLIST_ADDED",
        entity: "SupportBlocklist",
        entityId: entry.id,
        summary: { kind: "EMAIL", pattern: entry.pattern, bulk: true },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }
    return ok({ action, affected: added });
  } catch (err) {
    return handleApiError(err);
  }
}
