/**
 * POST /api/v1/billing/portal
 * Create a Stripe billing portal session for a tenant to manage their subscription.
 * Auth: TENANT_ADMIN or SUPERADMIN
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { ok, handleApiError, BadRequestError } from "@/lib/api";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not configured");
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requireTenant(ctx);

    // Only TENANT_ADMIN or SUPERADMIN can access billing portal
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

    // Fetch tenant and verify Stripe customer exists
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        stripeCustomerId: true,
      },
    });

    if (!tenant) {
      throw new BadRequestError("Tenant not found");
    }

    if (!tenant.stripeCustomerId) {
      throw new BadRequestError(
        "Sem assinatura ativa — inicie uma assinatura primeiro"
      );
    }

    // Create billing portal session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://psycologger.com";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${appUrl}/app/billing`,
    });

    // Audit log
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "BILLING_PORTAL_ACCESSED",
      entity: "Tenant",
      entityId: ctx.tenantId,
    });

    return ok({ url: portalSession.url });
  } catch (err) {
    return handleApiError(err);
  }
}
