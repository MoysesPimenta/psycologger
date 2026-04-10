/**
 * POST /api/v1/webhooks/resend-events
 *
 * Delivery event webhook: Resend sends email delivery status updates
 * (delivered, bounced, complained, delivery_delayed).
 *
 * Security:
 *  - Svix signature verification (same pattern as resend-inbound).
 *  - Rate limit: 100 events / 10 min per tenant.
 *  - Path is CSRF- and NextAuth-exempt in middleware (already whitelisted).
 *
 * Tracking:
 *  - Bounces and complaints: logged as AuditLog entries (EMAIL_BOUNCE, EMAIL_COMPLAINT)
 *  - Delivery delays: logged to console only
 *  - Delivered events: counted silently (for future analytics)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { ok, apiError } from "@/lib/api";
import { verifySvixSignature as verifySvixSignatureLib } from "@/lib/support-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resend webhook secret for delivery events — separate from inbound webhook
const WEBHOOK_SECRET =
  process.env.RESEND_WEBHOOK_SECRET_EVENTS ??
  process.env.RESEND_WEBHOOK_SECRET;

interface ResendEventPayload {
  type?: string;
  data?: {
    id?: string;
    email?: string;
    message_id?: string;
    messageId?: string;
    created_at?: string;
    created_at_number?: number;
    reason?: string;
    bounce_type?: string;
    complaint_feedback_type?: string;
  };
}

const verifySvixSignature = verifySvixSignatureLib;

export async function POST(req: NextRequest) {
  const meta = extractRequestMeta(req);

  if (!WEBHOOK_SECRET) {
    return apiError("SERVICE_UNAVAILABLE", "Webhook not configured", 503);
  }

  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const svixId = req.headers.get("svix-id");
  if (!svixTimestamp || !svixSignature || !svixId) {
    return apiError("UNAUTHORIZED", "Missing webhook headers", 401);
  }

  const payload = await req.text();

  const isValid = await verifySvixSignature(
    payload,
    svixTimestamp,
    svixSignature,
    WEBHOOK_SECRET,
    svixId
  );
  if (!isValid) {
    return apiError("UNAUTHORIZED", "Invalid signature", 401);
  }

  // Global circuit breaker
  const global = await rateLimit("resend:events:global", 500, 60_000);
  if (!global.allowed) {
    console.warn("[resend-events] global rate limit exceeded");
    return apiError("RATE_LIMITED", "Too many requests", 429);
  }

  let event: ResendEventPayload;
  try {
    event = JSON.parse(payload) as ResendEventPayload;
  } catch {
    return apiError("BAD_REQUEST", "Invalid JSON", 400);
  }

  if (!event.data) {
    return ok({ ok: true });
  }

  const eventType = event.type ?? "unknown";
  const email = event.data.email ?? "";
  const messageId = event.data.message_id ?? event.data.messageId ?? "";
  const reason = event.data.reason ?? "";
  const bounceType = event.data.bounce_type ?? "";
  const complaintType = event.data.complaint_feedback_type ?? "";

  // Find the tenant by looking up the email in emailReminder (for tracking)
  // and user/tenant mapping. If no tenant found, log without it.
  let tenantId: string | null = null;

  if (messageId) {
    const reminder = await db.emailReminder.findFirst({
      where: { resendMessageId: messageId },
      select: { tenantId: true },
    });
    tenantId = reminder?.tenantId ?? null;
  }

  // Per-tenant rate limit: 100 events / 10 min
  if (tenantId) {
    const perTenant = await rateLimit(
      `resend:events:${tenantId}`,
      100,
      10 * 60_000
    );
    if (!perTenant.allowed) {
      console.warn(
        `[resend-events] per-tenant rate limit exceeded for ${tenantId}`
      );
      return ok({ ok: true, rateLimited: true });
    }
  }

  // Handle events
  switch (eventType) {
    case "email.delivered":
      // Just log silently for now (future: could update delivery stats)
      console.log(
        `[resend-events] email.delivered messageId=${messageId} to="${email}"`
      );
      break;

    case "email.bounced":
      console.log(
        `[resend-events] email.bounced messageId=${messageId} to="${email}" reason="${reason}" bounceType="${bounceType}"`
      );
      await auditLog({
        action: "EMAIL_BOUNCE",
        tenantId: tenantId ?? undefined,
        summary: {
          email,
          messageId,
          reason,
          bounceType,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      break;

    case "email.complained":
      console.log(
        `[resend-events] email.complained messageId=${messageId} to="${email}" complaintType="${complaintType}"`
      );
      await auditLog({
        action: "EMAIL_COMPLAINT",
        tenantId: tenantId ?? undefined,
        summary: {
          email,
          messageId,
          complaintType,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      break;

    case "email.delivery_delayed":
      console.warn(
        `[resend-events] email.delivery_delayed messageId=${messageId} to="${email}" reason="${reason}"`
      );
      // Log to console only, no audit log
      break;

    default:
      // Unknown event type — just log and ignore
      console.log(`[resend-events] unknown event type: ${eventType}`);
  }

  // Always return 200 so Resend doesn't retry
  return ok({ ok: true, eventType });
}
