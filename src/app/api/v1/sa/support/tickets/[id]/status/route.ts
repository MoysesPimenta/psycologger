/**
 * POST /api/v1/sa/support/tickets/[id]/status
 * SA-only: change ticket status with audit log.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { apiError, handleApiError, ok } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  status: z.enum(["OPEN", "PENDING", "CLOSED"]),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const saUserId = await requireSuperAdmin();
    const meta = extractRequestMeta(req);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Status inválido", 400, parsed.error.flatten());
    }

    const ticket = await db.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!ticket) return apiError("NOT_FOUND", "Ticket não encontrado", 404);

    if (ticket.status === parsed.data.status) {
      return ok({ id: ticket.id, status: ticket.status });
    }

    await db.supportTicket.update({
      where: { id: ticket.id },
      data: { status: parsed.data.status },
    });

    await auditLog({
      userId: saUserId,
      action: "SUPPORT_TICKET_STATUS_CHANGED",
      entity: "SupportTicket",
      entityId: ticket.id,
      summary: { from: ticket.status, to: parsed.data.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return ok({ id: ticket.id, status: parsed.data.status });
  } catch (err) {
    return handleApiError(err);
  }
}
