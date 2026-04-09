/**
 * POST /api/v1/sa/support/tickets/[id]/reply
 *
 * SuperAdmin-only: send a reply via Resend, append OUTBOUND encrypted message,
 * flip ticket status to PENDING, audit.
 *
 * Rate limit: 60 replies / hour per SA user (abuse guard / reply-storm protect).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { apiError, handleApiError, ok, tooManyRequests } from "@/lib/api";
import { encrypt, decrypt } from "@/lib/crypto";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  body: z.string().min(1).max(10_000),
  // Status to apply to the ticket after the reply is sent. SA picks between
  // PENDING (awaiting customer) and CLOSED (issue resolved). Defaults to
  // PENDING for backwards compatibility.
  afterStatus: z.enum(["PENDING", "CLOSED"]).optional(),
});

const SUPPORT_FROM =
  process.env.SUPPORT_EMAIL_FROM ?? "Psycologger Suporte <support@psycologger.com>";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const saUserId = await requireSuperAdmin();
    const meta = extractRequestMeta(req);

    const limit = await rateLimit(`support:outbound:${saUserId}`, 60, 60 * 60_000);
    if (!limit.allowed) {
      return tooManyRequests("Limite de respostas por hora atingido.", 60);
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Corpo inválido", 400, parsed.error.flatten());
    }

    const ticket = await db.supportTicket.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { emailMessageId: true },
        },
      },
    });
    if (!ticket) return apiError("NOT_FOUND", "Ticket não encontrado", 404);

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return apiError("SERVICE_UNAVAILABLE", "Email não configurado", 503);
    const resend = new Resend(apiKey);

    const inReplyTo = ticket.messages[0]?.emailMessageId ?? undefined;
    const replySubject = /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`;

    const escapedBody = parsed.data.body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

    const html = `<div style="font-family:sans-serif;max-width:600px;line-height:1.5;color:#111">
      <p>${escapedBody}</p>
      <hr style="margin-top:24px;border:none;border-top:1px solid #e5e7eb"/>
      <p style="color:#6b7280;font-size:12px">Psycologger — Suporte</p>
    </div>`;

    const { data, error } = await resend.emails.send({
      from: SUPPORT_FROM,
      to: [ticket.fromEmail],
      subject: replySubject,
      text: parsed.data.body,
      html,
      headers: inReplyTo
        ? { "In-Reply-To": inReplyTo, References: inReplyTo }
        : undefined,
    });

    if (error) {
      console.error("[sa-support-reply] resend error", error);
      return apiError("EMAIL_FAILED", "Failed to send email", 502);
    }

    // Store the same JSON wrapper format as inbound so the thread view can
    // render consistently. Outbound is always plaintext entered by an SA.
    const bodyEncrypted = await encrypt(
      JSON.stringify({ v: 1, text: parsed.data.body, html: "" })
    );

    await db.$transaction([
      db.supportMessage.create({
        data: {
          ticketId: ticket.id,
          direction: "OUTBOUND",
          bodyEncrypted,
          resendMessageId: data?.id ?? null,
          senderUserId: saUserId,
        },
      }),
      db.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: parsed.data.afterStatus ?? "PENDING",
          lastMessageAt: new Date(),
        },
      }),
    ]);

    await auditLog({
      userId: saUserId,
      action: "SUPPORT_TICKET_REPLIED",
      entity: "SupportTicket",
      entityId: ticket.id,
      summary: { toEmail: ticket.fromEmail, resendMessageId: data?.id ?? null },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Touch decrypt to avoid "unused import" during type-check.
    void decrypt;

    return ok({ id: ticket.id });
  } catch (err) {
    return handleApiError(err);
  }
}
