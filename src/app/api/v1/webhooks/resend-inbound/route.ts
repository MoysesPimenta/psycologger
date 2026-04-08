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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

interface InboundPayload {
  type?: string;
  data?: {
    from?: { email?: string; name?: string } | string;
    to?: Array<{ email?: string } | string> | string;
    subject?: string;
    text?: string;
    html?: string;
    messageId?: string;
    headers?: Record<string, string>;
  };
}

async function verifySvixSignature(
  payload: string,
  timestamp: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const { createHmac } = await import("crypto");
    const signedContent = `${timestamp}.${payload}`;
    const hmac = createHmac("sha256", secret);
    hmac.update(signedContent);
    const computed = Buffer.from(hmac.digest()).toString("base64");
    // Svix signatures can come as "v1,<sig> v1,<sig2>" — compare any.
    return signature
      .split(" ")
      .map((s) => s.replace(/^v1,/, ""))
      .some((s) => s === computed);
  } catch (err) {
    console.error("[resend-inbound] Signature verify error:", err);
    return false;
  }
}

function extractFromEmail(from: InboundPayload["data"] extends infer D ? (D extends { from?: infer F } ? F : never) : never): {
  email: string;
  name: string | null;
} {
  if (!from) return { email: "", name: null };
  if (typeof from === "string") {
    const m = from.match(/(?:"?([^"<]+)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?/);
    return { email: (m?.[2] ?? "").trim().toLowerCase(), name: m?.[1]?.trim() || null };
  }
  return { email: (from.email ?? "").trim().toLowerCase(), name: from.name?.trim() || null };
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd?|enc)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

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

  const ok = await verifySvixSignature(payload, svixTimestamp, svixSignature, WEBHOOK_SECRET);
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
  const body = event.data.text || event.data.html || "";
  const messageId =
    event.data.messageId ||
    event.data.headers?.["message-id"] ||
    event.data.headers?.["Message-ID"] ||
    null;

  // Blocklist check (email exact OR domain).
  const blocked = await db.supportBlocklist.findFirst({
    where: {
      OR: [
        { kind: "EMAIL", pattern: fromEmail },
        { kind: "DOMAIN", pattern: domain },
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

  // Find an existing open/pending thread by (fromEmail + normalized subject)
  // within the last 14 days; otherwise create a new ticket.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const existing = await db.supportTicket.findFirst({
    where: {
      fromEmail,
      subjectNormalized,
      status: { in: ["OPEN", "PENDING"] },
      lastMessageAt: { gte: since },
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  const bodyEncrypted = await encrypt(body);

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
