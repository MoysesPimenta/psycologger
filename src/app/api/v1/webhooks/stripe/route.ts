/**
 * Stripe Webhook Handler — Psycologger
 * Handles customer.subscription.*, checkout.session.completed, invoice.payment_*
 * Idempotent: event.id stored in StripeWebhookEvent to prevent duplicate processing.
 *
 * In addition to the legacy BILLING_STATE_CHANGED event, this handler now
 * emits fine-grained lifecycle events that the SuperAdmin metrics and
 * activity timelines depend on:
 *   - BILLING_SUBSCRIPTION_CREATED      (new paid subscription)
 *   - BILLING_SUBSCRIPTION_REACTIVATED  (previously canceled/none -> active)
 *   - BILLING_TRIAL_CONVERTED           (trialing -> active)
 *   - BILLING_SUBSCRIPTION_CANCELED     (deletion or explicit cancel)
 *   - BILLING_WEBHOOK_FAILED            (handler-level failure)
 *
 * All events carry entityId = tenant.id so sa-metrics can join on it when
 * reconstructing history.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { auditLog, type AuditAction } from "@/lib/audit";
import { tierFromPriceId } from "@/lib/billing/plans";
import {
  sendPaymentOverdueWarning,
  sendSubscriptionSuspended,
} from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not configured");
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return apiError("CONFIGURATION_ERROR", "Webhook secret not configured", 500);
  }

  let eventType = "unknown";
  let eventId = "unknown";

  try {
    const rawBody = await req.text();

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return apiError("UNAUTHORIZED", "Missing stripe-signature header", 401);
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return apiError("SIGNATURE_VERIFICATION_FAILED", message, 401);
    }

    eventType = event.type;
    eventId = event.id;

    // Idempotency
    const existingEvent = await db.stripeWebhookEvent.findUnique({ where: { id: event.id } });
    if (existingEvent) return NextResponse.json({ received: true });

    await db.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChanged(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event);
        break;
      default:
        console.log(`[stripe-webhook] Ignoring event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Error processing webhook:", message);

    // Best-effort audit entry so the SA dashboard can surface webhook failures.
    // Not all failures have a known tenantId — we still log with tenantId
    // unset so requireTenant-style queries on tenant scope don't filter it in;
    // the SA dashboard counts by action, not by tenant.
    try {
      await auditLog({
        action: "BILLING_WEBHOOK_FAILED",
        entity: "StripeEvent",
        entityId: eventId,
        summary: { eventType, message },
      });
    } catch (logErr) {
      console.error("[stripe-webhook] Failed to write failure audit:", logErr);
    }

    // Return 500 to retry — Stripe will try again
    return apiError("WEBHOOK_PROCESSING_ERROR", message, 500);
  }
}

async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const tenantId = session.client_reference_id;
  if (!tenantId) {
    console.error("[stripe-webhook] No client_reference_id in checkout session");
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

  const priceIdData = tierFromPriceId((subscription.items.data[0]?.price.id || "") as string);
  if (!priceIdData) {
    console.error("[stripe-webhook] Unknown price ID:", subscription.items.data[0]?.price.id);
    return;
  }

  // Was this tenant already on a paid subscription? If so, this is a
  // reactivation flow rather than a first-time creation.
  const before = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeSubscriptionId: true, planTier: true, subscriptionStatus: true },
  });
  const isReactivation =
    before?.planTier === "FREE" && (!!before?.stripeSubscriptionId || before?.subscriptionStatus === null);

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      planTier: priceIdData.tier,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      billingCurrency: priceIdData.currency,
      graceUntil: null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    },
  });

  const lifecycleAction: AuditAction = isReactivation
    ? "BILLING_SUBSCRIPTION_REACTIVATED"
    : "BILLING_SUBSCRIPTION_CREATED";

  await emitBillingPair(tenantId, lifecycleAction, {
    event: "checkout_completed",
    tier: priceIdData.tier,
    status: subscription.status,
  });
}

async function handleSubscriptionChanged(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  const tenant = await db.tenant.findFirst({ where: { stripeCustomerId: customerId } });
  if (!tenant) {
    console.error("[stripe-webhook] Tenant not found for customer:", customerId);
    return;
  }

  const priceIdData = tierFromPriceId((subscription.items.data[0]?.price.id || "") as string);
  if (!priceIdData) {
    console.error("[stripe-webhook] Unknown price ID:", subscription.items.data[0]?.price.id);
    return;
  }

  // Detect lifecycle transitions BEFORE writing the new state.
  const previousStatus = tenant.subscriptionStatus;
  const nextStatus = subscription.status;

  let lifecycleAction: AuditAction | null = null;
  if (previousStatus === "trialing" && nextStatus === "active") {
    lifecycleAction = "BILLING_TRIAL_CONVERTED";
  } else if (
    (previousStatus === "canceled" || previousStatus === null || previousStatus === undefined) &&
    nextStatus === "active"
  ) {
    lifecycleAction = "BILLING_SUBSCRIPTION_REACTIVATED";
  } else if (event.type === "customer.subscription.created" && nextStatus === "active") {
    lifecycleAction = "BILLING_SUBSCRIPTION_CREATED";
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      planTier: priceIdData.tier,
      subscriptionStatus: nextStatus,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      billingCurrency: priceIdData.currency,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    },
  });

  if (lifecycleAction) {
    await emitBillingPair(tenant.id, lifecycleAction, {
      event: event.type,
      previousStatus,
      nextStatus,
      tier: priceIdData.tier,
    });
  } else {
    await auditLog({
      tenantId: tenant.id,
      action: "BILLING_STATE_CHANGED",
      entity: "Tenant",
      entityId: tenant.id,
      summary: {
        event: event.type,
        status: nextStatus,
        tier: priceIdData.tier,
      },
    });
  }
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  const tenant = await db.tenant.findFirst({ where: { stripeCustomerId: customerId } });
  if (!tenant) {
    console.error("[stripe-webhook] Tenant not found for customer:", customerId);
    return;
  }

  const previousTier = tenant.planTier;

  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      planTier: "FREE",
      subscriptionStatus: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      graceUntil: null,
      cancelAtPeriodEnd: false,
    },
  });

  await emitBillingPair(tenant.id, "BILLING_SUBSCRIPTION_CANCELED", {
    event: "subscription_deleted",
    previousTier,
  });

  // Send subscription suspended notification to tenant admins
  try {
    const admins = await db.membership.findMany({
      where: {
        tenantId: tenant.id,
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
      include: { user: { select: { email: true } } },
    });

    for (const admin of admins) {
      if (!admin.user.email) continue;
      try {
        await sendSubscriptionSuspended({
          email: admin.user.email,
          tenantName: tenant.name,
        });
      } catch (err) {
        console.error(
          `[stripe-webhook] Failed to send suspension notice to ${admin.user.email}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error(
      "[stripe-webhook] Failed to send subscription suspended emails:",
      err
    );
  }
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  const tenant = await db.tenant.findFirst({ where: { stripeCustomerId: customerId } });
  if (!tenant) {
    console.error("[stripe-webhook] Tenant not found for customer:", customerId);
    return;
  }

  if (invoice.status === "open" && !tenant.graceUntil) {
    const graceUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await db.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionStatus: "past_due", graceUntil },
    });

    await auditLog({
      tenantId: tenant.id,
      action: "BILLING_STATE_CHANGED",
      entity: "Tenant",
      entityId: tenant.id,
      summary: { event: "invoice_payment_failed", graceUntilDays: 3 },
    });

    // Send payment overdue warning to tenant admins
    try {
      const admins = await db.membership.findMany({
        where: {
          tenantId: tenant.id,
          role: "TENANT_ADMIN",
          status: "ACTIVE",
        },
        include: { user: { select: { email: true } } },
      });

      const graceDaysLeft = 3;
      for (const admin of admins) {
        if (!admin.user.email) continue;
        try {
          await sendPaymentOverdueWarning({
            email: admin.user.email,
            tenantName: tenant.name,
            graceDaysLeft,
          });
        } catch (err) {
          console.error(
            `[stripe-webhook] Failed to send payment warning to ${admin.user.email}:`,
            err
          );
        }
      }
    } catch (err) {
      console.error(
        "[stripe-webhook] Failed to send payment warning emails:",
        err
      );
    }
  }
}

async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  const tenant = await db.tenant.findFirst({ where: { stripeCustomerId: customerId } });
  if (!tenant) {
    console.error("[stripe-webhook] Tenant not found for customer:", customerId);
    return;
  }

  if (tenant.graceUntil) {
    await db.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionStatus: "active", graceUntil: null },
    });

    await auditLog({
      tenantId: tenant.id,
      action: "BILLING_STATE_CHANGED",
      entity: "Tenant",
      entityId: tenant.id,
      summary: { event: "invoice_payment_succeeded", graceClearedAt: new Date() },
    });
  }
}

/**
 * Write both the lifecycle event (consumed by sa-metrics) and the legacy
 * BILLING_STATE_CHANGED entry (consumed by older code paths), in order.
 */
async function emitBillingPair(
  tenantId: string,
  lifecycle: AuditAction,
  summary: Record<string, unknown>,
) {
  await auditLog({
    tenantId,
    action: lifecycle,
    entity: "Tenant",
    entityId: tenantId,
    summary,
  });
  await auditLog({
    tenantId,
    action: "BILLING_STATE_CHANGED",
    entity: "Tenant",
    entityId: tenantId,
    summary: { ...summary, mirror_of: lifecycle },
  });
}
