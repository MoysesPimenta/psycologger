/**
 * POST /api/v1/webhooks/resend-inbound
 *
 * Inbound-email webhook: Resend delivers parsed email → we create/append a
 * SupportTicket + SupportMessage. Bodies are encrypted at rest with the same
 * ENCRYPTION_KEY used for clinical notes.
 *
 * Security:
 *  - Svix signature verification (shared with outbound resend webhook).
 *  - Blocklist (EMAIL / DOMAIN) short-circuits with audit.
 *  - Rate limit: 20 messages / 10 min per fromEmail; 500 / min global.
 *  - Path is CSRF- and NextAuth-exempt in middleware (already whitelisted).
 *
 * Privacy:
 *  - Body is encrypted before hitting Postgres; never logged.
 *  - Audit events contain only fromEmail/subject metadata, never body.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  extractFromEmail as extractFromEmailLib,
  normalizeSubject as normalizeSubjectLib,
  verifySvixSignature as verifySvixSignatureLib,
} from "@/lib/support-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prefer the inbound-specific secret so Resend can route inbound email to its
// own webhook endpoint (separate from the outbound delivery events webhook).
// Falls back to RESEND_WEBHOOK_SECRET if only one webhook is configured.
const WEBHOOK_SECRET =
  process.env.RESEND_WEBHOOK_SECRET_INBOUND || process.env.RESEND_WEBHOOK_SECRET;

interface InboundPayload {
  type?: string;
  data?: {
    from?: { email?: string; name?: string } | string;
    to?: Array<{ email?: string } | string> | string;
    subject?: string;
    text?: string;
    html?: string;
    messageId?: string;
    message_id?: string;
    headers?: Record<string, string>;
  };
}

// Pure helpers live in src/lib/support-inbound.ts so they can be unit-tested.
const verifySvixSignature = verifySvixSignatureLib;
const extractFromEmail = extractFromEmailLib;
const normalizeSubject = normalizeSubjectLib;

export async function POST(req: NextRequest) {
  const meta = extractRequestMeta(req);

  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const svixId = req.headers.get("svix-id");
  if (!svixTimestamp || !svixSignature || !svixId) {
    return NextResponse.json({ error: "Missing webhook headers" }, { status: 401 });
  }

  const payload = await req.text();

  const ok = await verifySvixSignature(payload, svixTimestamp, svixSignature, WEBHOOK_SECRET, svixId);
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Global circuit breaker — defends against bulk abuse even if limiter dies.
  const global = await rateLimit("support:inbound:global", 500, 60_000);
  if (!global.allowed) {
    console.warn("[resend-inbound] global rate limit exceeded");
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let event: InboundPayload;
  try {
    event = JSON.parse(payload) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!event.data) {
    return NextResponse.json({ ok: true });
  }

  const { email: fromEmail, name: fromName } = extractFromEmail(event.data.from as never);
  if (!fromEmail || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromEmail)) {
    return NextResponse.json({ error: "Invalid from address" }, { status: 400 });
  }

  const domain = fromEmail.split("@")[1] ?? "";
  const subject = (event.data.subject ?? "(sem assunto)").slice(0, 500);
  // Stash both text and html in an encrypted JSON wrapper so the thread view
  // can render HTML (sanitized, sandboxed) while still falling back to text.
  // Resend has shipped multiple payload shapes — try every known field and
  // log which branch was populated (keys only, never body contents → no PHI).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = event.data as any;
  const text = (
    d.text ||
    d.plain ||
    d.bodyPlain ||
    d.body_plain ||
    d.content?.text ||
    ""
  ).toString();
  const html = (
    d.html ||
    d.bodyHtml ||
    d.body_html ||
    d.content?.html ||
    ""
  ).toString();
  // Resend's inbound webhook delivers metadata only — the actual body must
  // be fetched via the Resend API using email_id. Try it once, best-effort;
  // the ticket is still created either way.
  let fetchedText = text;
  let fetchedHtml = html;
  if (!fetchedText && !fetchedHtml) {
    const emailId: string | undefined = d.email_id || d.emailId;
    const apiKey = process.env.RESEND_API_KEY;
    if (emailId && apiKey) {
      try {
        // Correct endpoint for INBOUND emails is /emails/receiving/{id} —
        // the plain /emails/{id} path is for outbound messages we sent and
        // does not accept received-email ids.
        const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          // Don't hang the webhook — Resend retries on non-2xx, so keep it short.
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const body = (await res.json()) as Record<string, unknown>;
          fetchedText =
            (typeof body.text === "string" && body.text) ||
            (typeof (body as { plain?: string }).plain === "string" && (body as { plain?: string }).plain) ||
            "";
          fetchedHtml =
            (typeof body.html === "string" && body.html) ||
            (typeof (body as { body_html?: string }).body_html === "string" && (body as { body_html?: string }).body_html) ||
            "";
          if (!fetchedText && !fetchedHtml) {
            console.warn(
              "[resend-inbound] API fetch returned no body — keys:",
              Object.keys(body).join(",")
            );
          }
        } else {
          console.warn(
            "[resend-inbound] API fetch failed:",
            res.status,
            res.statusText
          );
        }
      } catch (err) {
        console.warn("[resend-inbound] API fetch error:", (err as Error).message);
      }
    } else {
      console.warn(
        "[resend-inbound] empty body — keys:",
        Object.keys(d).join(","),
        "no emailId or RESEND_API_KEY"
      );
    }
  }
  const bodyWrapper = JSON.stringify({ v: 1, text: fetchedText, html: fetchedHtml });
  const messageId =
    event.data.messageId ||
    event.data.message_id ||
    event.data.headers?.["message-id"] ||
    event.data.headers?.["Message-ID"] ||
    null;

  // Idempotency: Resend retries on any non-2xx response, and Svix can also
  // re-deliver on transient network failures. Without a guard, retries would
  // double-insert messages and reopen closed tickets twice. We dedupe on the
  // RFC822 Message-ID, which is unique per email.
  if (messageId) {
    const dup = await db.supportMessage.findFirst({
      where: { emailMessageId: messageId },
      select: { id: true, ticketId: true },
    });
    if (dup) {
      console.warn("[resend-inbound] duplicate messageId — ignoring", messageId);
      return NextResponse.json({ ok: true, duplicate: true, ticketId: dup.ticketId });
    }
  }

  // Blocklist check — case-insensitive equals on email and domain.
  // Stored patterns may have been entered with stray casing/whitespace; the
  // webhook must still honor the block.
  const blocked = await db.supportBlocklist.findFirst({
    where: {
      OR: [
        { kind: "EMAIL", pattern: { equals: fromEmail, mode: "insensitive" } },
        { kind: "DOMAIN", pattern: { equals: domain, mode: "insensitive" } },
      ],
    },
    select: { id: true, kind: true, pattern: true },
  });
  if (blocked) {
    await auditLog({
      action: "SUPPORT_INBOUND_BLOCKED",
      summary: {
        fromEmail,
        domain,
        blockedBy: `${blocked.kind}:${blocked.pattern}`,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    // Return 200 so Resend does not retry — the block is intentional.
    return NextResponse.json({ ok: true, blocked: true });
  }

  // Per-sender rate limit: 20 messages / 10 minutes.
  const perSender = await rateLimit(`support:inbound:${fromEmail}`, 20, 10 * 60_000);
  if (!perSender.allowed) {
    await auditLog({
      action: "SUPPORT_INBOUND_BLOCKED",
      summary: { fromEmail, reason: "rate_limited" },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true, rateLimited: true });
  }

  const subjectNormalized = normalizeSubject(subject);

  // Best-effort tenant/user match — never required.
  const user = await db.user.findFirst({
    where: { email: { equals: fromEmail, mode: "insensitive" } },
    select: { id: true },
  });
  let tenantId: string | null = null;
  if (user) {
    const membership = await db.membership.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { tenantId: true },
    });
    tenantId = membership?.tenantId ?? null;
  }

  // Find an existing thread by (fromEmail + normalized subject) within the
  // last 14 days — regardless of status. A customer reply to a CLOSED ticket
  // must reopen it, not spawn a duplicate.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const existing = await db.supportTicket.findFirst({
    where: {
      fromEmail,
      subjectNormalized,
      lastMessageAt: { gte: since },
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  const bodyEncrypted = await encrypt(bodyWrapper);

  if (existing) {
    await db.supportMessage.create({
      data: {
        ticketId: existing.id,
        direction: "INBOUND",
        bodyEncrypted,
        emailMessageId: messageId,
      },
    });
    await db.supportTicket.update({
      where: { id: existing.id },
      data: { status: "OPEN", lastMessageAt: new Date() },
    });
    await auditLog({
      action: "SUPPORT_MESSAGE_APPENDED",
      entity: "SupportTicket",
      entityId: existing.id,
      summary: { fromEmail, direction: "INBOUND" },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true, ticketId: existing.id });
  }

  const ticket = await db.supportTicket.create({
    data: {
      fromEmail,
      fromName: fromName ?? null,
      tenantId,
      userId: user?.id ?? null,
      subject,
      subjectNormalized,
      status: "OPEN",
      lastMessageAt: new Date(),
      messages: {
        create: {
          direction: "INBOUND",
          bodyEncrypted,
          emailMessageId: messageId,
        },
      },
    },
    select: { id: true },
  });

  await auditLog({
    action: "SUPPORT_TICKET_CREATED",
    entity: "SupportTicket",
    entityId: ticket.id,
    summary: { fromEmail, tenantId, userId: user?.id ?? null },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, ticketId: ticket.id });
}
