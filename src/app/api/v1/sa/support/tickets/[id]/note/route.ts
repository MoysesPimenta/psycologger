/**
 * POST /api/v1/sa/support/tickets/[id]/note
 *
 * SuperAdmin-only: append a private INTERNAL note to a ticket. The note is
 * encrypted at rest with the shared ENCRYPTION_KEY (same as INBOUND/OUTBOUND
 * bodies) and is never sent via email — it exists solely as an internal
 * hand-off channel between SA staff.
 *
 * Ticket status and lastMessageAt are intentionally NOT changed: adding a
 * note must not reopen a closed ticket or move it around the inbox.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { apiError, handleApiError, ok } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const saUserId = await requireSuperAdmin();
    const meta = extractRequestMeta(req);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Nota inválida", 400, parsed.error.flatten());
    }

    const ticket = await db.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!ticket) return apiError("NOT_FOUND", "Ticket não encontrado", 404);

    // Reuse the same JSON body wrapper so the thread view can render notes
    // through the existing parseBodyWrapper path without a second codec.
    const bodyEncrypted = await encrypt(
      JSON.stringify({ v: 1, text: parsed.data.body, html: "" })
    );

    const note = await db.supportMessage.create({
      data: {
        ticketId: ticket.id,
        direction: "INTERNAL",
        bodyEncrypted,
        senderUserId: saUserId,
      },
      select: { id: true },
    });

    await auditLog({
      userId: saUserId,
      action: "SUPPORT_MESSAGE_APPENDED",
      entity: "SupportTicket",
      entityId: ticket.id,
      summary: { direction: "INTERNAL", noteId: note.id },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return ok({ id: note.id });
  } catch (err) {
    return handleApiError(err);
  }
}
