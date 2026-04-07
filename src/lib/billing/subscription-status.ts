/**
 * Subscription status determination — Psycologger
 * Decides if a tenant can access the staff app or is blocked due to payment issues.
 * State machine: FREE → ACTIVE → GRACE → BLOCKED (with exceptions for SUPERADMIN).
 */

import { db } from "@/lib/db";
import type { Tenant } from "@prisma/client";

export type BillingState = "FREE" | "ACTIVE" | "GRACE" | "BLOCKED";

export class SubscriptionBlockedError extends Error {
  readonly status = 402; // Payment Required
  readonly code = "SUBSCRIPTION_BLOCKED";
  constructor(message = "Assinatura inativa — acesso bloqueado") {
    super(message);
    this.name = "SubscriptionBlockedError";
  }
}

/**
 * Determine the billing state of a tenant.
 * - FREE: No paid subscription, always allowed.
 * - ACTIVE: Valid paid subscription (status === "ACTIVE").
 * - GRACE: Payment past due but within 3-day grace period.
 * - BLOCKED: Grace period expired or subscription canceled/unpaid.
 */
export function getBillingState(tenant: Tenant): BillingState {
  if (tenant.planTier === "FREE") {
    return "FREE";
  }

  // Check if in grace period
  if (tenant.graceUntil) {
    const now = new Date();
    if (now < tenant.graceUntil) {
      return "GRACE";
    }
    // Grace period expired — blocked
    return "BLOCKED";
  }

  // Not in grace, check subscription status
  if (tenant.subscriptionStatus === "ACTIVE") {
    return "ACTIVE";
  }

  // Any other status (past_due without grace, canceled, unpaid) = blocked
  return "BLOCKED";
}

/**
 * Assert that a tenant's subscription allows access to the staff app.
 * Throws SubscriptionBlockedError if billing state is BLOCKED.
 * FREE tier always passes. SUPERADMIN always passes.
 */
export async function requireActiveSubscription(
  tenantId: string,
  isSuperAdmin: boolean = false
): Promise<BillingState> {
  if (isSuperAdmin) {
    // SUPERADMIN can always access
    return "ACTIVE";
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      planTier: true,
      graceUntil: true,
      subscriptionStatus: true,
    },
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const state = getBillingState(tenant as Tenant);
  if (state === "BLOCKED") {
    throw new SubscriptionBlockedError();
  }

  return state;
}
