/**
 * GET/POST /api/v1/cron/support-stale-pending
 *
 * Auto-closes any SupportTicket whose status has been PENDING (waiting on the
 * customer) for more than STALE_DAYS without a new inbound message. Each
 * auto-closed ticket gets:
 *   - status flipped to CLOSED
 *   - an INTERNAL note appended explaining the closure (encrypted, like all
 *     other support messages)
 *   - a SUPPORT_TICKET_AUTO_CLOSED audit log entry
 *
 * Runs daily via Vercel Cron. Protected by CRON_SECRET, same pattern as the
 * other crons in this folder.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { auditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;
const STALE_DAYS = 7;

function unauthorized() {
  return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
}

async function run() {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const stale = await db.supportTicket.findMany({
    where: { status: "PENDING", lastMessageAt: { lt: cutoff } },
    select: { id: true, fromEmail: true, lastMessageAt: true },
    take: 500, // hard cap so a backlog can't blow the function timeout
  });

  let closed = 0;
  for (const t of stale) {
    try {
      const noteText =
        `Ticket fechado automaticamente após ${STALE_DAYS} dias sem retorno do cliente. ` +
        `Última mensagem: ${new Date(t.lastMessageAt).toISOString()}.`;
      const wrapper = JSON.stringify({ v: 1, text: noteText, html: "" });
      const bodyEncrypted = await encrypt(wrapper);
      await db.$transaction([
        db.supportMessage.create({
          data: {
            ticketId: t.id,
            direction: "INTERNAL",
            bodyEncrypted,
          },
        }),
        db.supportTicket.update({
          where: { id: t.id },
          data: { status: "CLOSED" },
        }),
      ]);
      await auditLog({
        action: "SUPPORT_TICKET_AUTO_CLOSED",
        entity: "SupportTicket",
        entityId: t.id,
        summary: { fromEmail: t.fromEmail, staleDays: STALE_DAYS },
      });
      closed++;
    } catch (err) {
      console.error("[cron/support-stale-pending] failed for", t.id, err);
    }
  }
  return NextResponse.json({ ok: true, scanned: stale.length, closed });
}

async function authed(req: NextRequest) {
  if (!CRON_SECRET) {
    console.error("[cron/support-stale-pending] CRON_SECRET unset — rejecting");
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return unauthorized();
  return run();
}
export async function POST(req: NextRequest) {
  if (!(await authed(req))) return unauthorized();
  return run();
}
