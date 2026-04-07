/**
 * POST /api/v1/webhooks/resend
 *
 * Webhook handler for Resend email delivery status updates.
 *
 * Verifies Svix signature (Resend uses Svix for webhooks).
 * Updates EmailReminder.lastEmailStatus + lastEmailStatusAt based on event type.
 *
 * Event types handled:
 * - email.sent: lastEmailStatus = 'sent'
 * - email.delivered: lastEmailStatus = 'delivered'
 * - email.bounced: lastEmailStatus = 'bounced'
 * - email.complained: lastEmailStatus = 'complained'
 * - email.delivery_delayed: lastEmailStatus = 'queued'
 * - email.opened: ignored (too noisy)
 * - email.clicked: ignored (too noisy)
 *
 * Signature verification is required. If RESEND_WEBHOOK_SECRET is missing,
 * returns 503 to indicate the service is not ready.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

interface ResendWebhookEvent {
  type: string;
  id: string;
  created_at: string;
  data: {
    email_id: string;
    to: string;
    [key: string]: unknown;
  };
}

/**
 * Verify Svix signature using the format:
 * "timestamp.signature"
 * where signature = base64(HMAC-SHA256(timestamp.payload, secret))
 */
async function verifySvixSignature(
  payload: string,
  timestamp: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const crypto = await import("crypto");
    const encoder = new TextEncoder();
    const key = encoder.encode(secret);

    // Svix signs: timestamp.payload
    const signedContent = `${timestamp}.${payload}`;
    const signedContentBytes = encoder.encode(signedContent);

    // Create HMAC
    const hmac = crypto.createHmac("sha256", key);
    hmac.update(signedContentBytes);
    const computed = Buffer.from(hmac.digest()).toString("base64");

    // Compare (using base64-encoded signatures)
    // Note: Svix may include "v1," prefix on signature
    const sigWithoutPrefix = signature.replace("v1,", "");
    return computed === sigWithoutPrefix;
  } catch (err) {
    console.error("[resend-webhook] Signature verification error:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Check if webhook secret is configured
  if (!WEBHOOK_SECRET) {
    console.error(
      "[resend-webhook] RESEND_WEBHOOK_SECRET not configured — cannot verify webhooks"
    );
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 }
    );
  }

  // Extract Svix headers
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const svixId = req.headers.get("svix-id");

  if (!svixTimestamp || !svixSignature || !svixId) {
    console.warn(
      "[resend-webhook] Missing required Svix headers (timestamp/signature/id)"
    );
    return NextResponse.json(
      { error: "Missing webhook authentication headers" },
      { status: 401 }
    );
  }

  // Read request body
  const payload = await req.text();

  // Verify signature
  const isValid = await verifySvixSignature(
    payload,
    svixTimestamp,
    svixSignature,
    WEBHOOK_SECRET
  );

  if (!isValid) {
    console.warn("[resend-webhook] Invalid Svix signature");
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 }
    );
  }

  // Parse event
  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload) as ResendWebhookEvent;
  } catch (err) {
    console.error("[resend-webhook] Failed to parse webhook payload:", err);
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  // Map event type to email status
  let emailStatus: string | null = null;
  switch (event.type) {
    case "email.sent":
      emailStatus = "sent";
      break;
    case "email.delivered":
      emailStatus = "delivered";
      break;
    case "email.bounced":
      emailStatus = "bounced";
      break;
    case "email.complained":
      emailStatus = "complained";
      break;
    case "email.delivery_delayed":
      emailStatus = "queued";
      break;
    case "email.opened":
    case "email.clicked":
      // Ignore noisy events
      return NextResponse.json({ ok: true });
    default:
      console.warn(`[resend-webhook] Unknown event type: ${event.type}`);
      return NextResponse.json({ ok: true });
  }

  // Find and update EmailReminder by resendMessageId
  const messageId = event.data.email_id;
  if (!messageId) {
    console.warn("[resend-webhook] No email_id in event data");
    return NextResponse.json(
      { error: "Missing email_id in event data" },
      { status: 400 }
    );
  }

  try {
    const reminder = await db.emailReminder.findFirst({
      where: { resendMessageId: messageId },
    });

    if (!reminder) {
      console.warn(
        `[resend-webhook] No EmailReminder found for resendMessageId: ${messageId}`
      );
      return NextResponse.json({ ok: true }); // Still return 200 — don't fail webhook
    }

    // Update status
    await db.emailReminder.update({
      where: { id: reminder.id },
      data: {
        lastEmailStatus: emailStatus,
        lastEmailStatusAt: new Date(),
      },
    });

    console.log(
      `[resend-webhook] Updated ${messageId} status to ${emailStatus}`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[resend-webhook] Error updating EmailReminder:", err);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
