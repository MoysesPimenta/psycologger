/**
 * Stripe Webhook Handler — Psycologger
 * Handles customer.subscription.*, checkout.session.completed, invoice.payment_*
 * Idempotent: event.id stored in StripeWebhookEvent to prevent duplicate processing.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { tierFromPriceId } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return apiError(
      "CONFIGURATION_ERROR",
      "Webhook secret not configured",
      500
    );
  }

  try {
    const rawBody = await req.text();

    // Verify Stripe signature
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return apiError("UNAUTHORIZED", "Missing stripe-signature header", 401);
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      return apiError("SIGNATURE_VERIFICATION_FAILED", message, 401);
    }

    // Idempotency: check if we've already processed this event
    const existingEvent = await db.stripeWebhookEvent.findUnique({
      where: { id: event.id },
    });

    if (existingEvent) {
      // Already processed, return 200 to acknowledge
      return NextResponse.json({ received: true });
    }

    // Record that we're processing this event (before processing, in case of crash)
    await db.stripeWebhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
      },
    });

    // Route to handler based on event type
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

      // Other events are silently ignored
      default:
        console.log(`[stripe-webhook] Ignoring event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Error processing webhook:", message);
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

  // Fetch the subscription to get details
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  const priceIdData = tierFromPriceId(
    (subscription.items.data[0]?.price.id || "") as string
  );

  if (!priceIdData) {
    console.error("[stripe-webhook] Unknown price ID:", subscription.items.data[0]?.price.id);
    return;
  }

  // Update tenant with subscription details
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      planTier: priceIdData.tier,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: new Date(
        subscription.current_period_end * 1000
      ),
      billingCurrency: priceIdData.currency,
      graceUntil: null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    },
  });

  await auditLog({
    tenantId,
    action: "BILLING_STATE_CHANGED",
    entity: "Tenant",
    entityId: tenantId,
    summary: { event: "checkout_completed", tier: priceIdData.tier },
  });
}

async function handleSubscriptionChanged(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  // Find tenant by stripeCustomerId
  const tenant = await db.tenant.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!tenant) {
    console.error(
      "[stripe-webhook] Tenant not found for customer:",
      customerId
    );
    return;
  }

  const priceIdData = tierFromPriceId(
    (subscription.items.data[0]?.price.id || "") as string
  );

  if (!priceIdData) {
    console.error("[stripe-webhook] Unknown price ID:", subscription.items.data[0]?.price.id);
    return;
  }

  // Update subscription details
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      planTier: priceIdData.tier,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: new Date(
        subscription.current_period_end * 1000
      ),
      billingCurrency: priceIdData.currency,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    },
  });

  await auditLog({
    tenantId: tenant.id,
    action: "BILLING_STATE_CHANGED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: {
      event: event.type,
      status: subscription.status,
      tier: priceIdData.tier,
    },
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  const tenant = await db.tenant.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!tenant) {
    console.error(
      "[stripe-webhook] Tenant not found for customer:",
      customerId
    );
    return;
  }

  // Downgrade to FREE tier
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

  await auditLog({
    tenantId: tenant.id,
    action: "BILLING_STATE_CHANGED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: { event: "subscription_deleted", tier: "FREE" },
  });
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  const tenant = await db.tenant.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!tenant) {
    console.error(
      "[stripe-webhook] Tenant not found for customer:",
      customerId
    );
    return;
  }

  // Only set grace period if transitioning to past_due and not already in grace
  if (invoice.status === "open" && !tenant.graceUntil) {
    const graceUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        subscriptionStatus: "past_due",
        graceUntil,
      },
    });

    await auditLog({
      tenantId: tenant.id,
      action: "BILLING_STATE_CHANGED",
      entity: "Tenant",
      entityId: tenant.id,
      summary: {
        event: "invoice_payment_failed",
        graceUntilDays: 3,
      },
    });
  }
}

async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  const tenant = await db.tenant.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!tenant) {
    console.error(
      "[stripe-webhook] Tenant not found for customer:",
      customerId
    );
    return;
  }

  // Clear grace period if payment succeeds
  if (tenant.graceUntil) {
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        subscriptionStatus: "active",
        graceUntil: null,
      },
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
