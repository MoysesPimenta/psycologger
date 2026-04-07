/**
 * POST /api/v1/billing/checkout
 * Create a Stripe checkout session for a tenant to upgrade plans.
 * Auth: TENANT_ADMIN or SUPERADMIN
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { ok, handleApiError, BadRequestError } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { priceIdFor } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const schema = z.object({
  tier: z.enum(["PRO", "CLINIC"]),
  currency: z.enum(["BRL", "USD"]).default("BRL"),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requireTenant(ctx);

    // Only TENANT_ADMIN or SUPERADMIN can initiate billing
    if (
      ctx.role !== "TENANT_ADMIN" &&
      ctx.role !== "SUPERADMIN"
    ) {
      return new Response(
        JSON.stringify({
          error: {
            code: "FORBIDDEN",
            message: "Apenas administradores podem gerenciar a assinatura",
          },
        }),
        { status: 403 }
      );
    }

    const body = schema.parse(await req.json());

    // Fetch tenant
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
      },
    });

    if (!tenant) {
      throw new BadRequestError("Tenant not found");
    }

    const priceId = priceIdFor(body.tier, body.currency);
    if (!priceId) {
      throw new BadRequestError("Invalid plan configuration");
    }

    // Create or retrieve Stripe customer
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: {
          tenantId: tenant.id,
        },
      });
      customerId = customer.id;

      // Persist customer ID
      await db.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Create checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://psycologger.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/app/billing/success`,
      cancel_url: `${appUrl}/app/billing/cancel`,
      allow_promotion_codes: true,
      client_reference_id: tenant.id,
    });

    // Audit log
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "BILLING_CHECKOUT_INITIATED",
      entity: "Tenant",
      entityId: ctx.tenantId,
      summary: { tier: body.tier, currency: body.currency },
    });

    return ok({ url: session.url });
  } catch (err) {
    return handleApiError(err);
  }
}
