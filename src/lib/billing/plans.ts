/**
 * Billing plans — Psycologger
 * Single source of truth for plan definitions, pricing, and limits.
 */

import type { PlanTier } from "@prisma/client";

export type Currency = "BRL" | "USD";

export interface Plan {
  tier: PlanTier;
  name: string;
  description: string;
  maxActivePatients: number;
  maxTherapistSeats: number;
  monthlyPriceCents: Record<Currency, number>; // 0 for FREE tier
}

export const PLANS: Record<PlanTier, Plan> = {
  FREE: {
    tier: "FREE",
    name: "Plano Gratuito",
    description: "Até 3 pacientes ativos, 1 terapeuta",
    maxActivePatients: 3,
    maxTherapistSeats: 1,
    monthlyPriceCents: { BRL: 0, USD: 0 },
  },
  PRO: {
    tier: "PRO",
    name: "Plano Pro",
    description: "Até 25 pacientes ativos, 1 terapeuta",
    maxActivePatients: 25,
    maxTherapistSeats: 1,
    monthlyPriceCents: { BRL: 9900, USD: 2000 }, // 99 BRL, 20 USD
  },
  CLINIC: {
    tier: "CLINIC",
    name: "Plano Clínica",
    description: "Pacientes ilimitados, até 5 terapeutas",
    maxActivePatients: Infinity,
    maxTherapistSeats: 5,
    monthlyPriceCents: { BRL: 19900, USD: 4000 }, // 199 BRL, 40 USD
  },
};

/**
 * Get plan definition by tier
 */
export function getPlan(tier: PlanTier): Plan {
  return PLANS[tier];
}

/**
 * Get Stripe price ID for a given tier and currency.
 * Requires env vars: STRIPE_PRICE_PRO_BRL, STRIPE_PRICE_PRO_USD, etc.
 * FREE tier has no price ID (no subscription).
 */
export function priceIdFor(tier: PlanTier, currency: Currency): string | null {
  if (tier === "FREE") return null;

  const envKey = `STRIPE_PRICE_${tier}_${currency}`;
  const priceId = process.env[envKey];
  return priceId && priceId.length > 0 ? priceId : null;
}

/**
 * Throw a user-facing error if the price ID for a (tier, currency) is not
 * configured. Use this at the checkout entry point so the API returns a
 * clear message instead of a generic 500.
 */
export function requirePriceId(tier: PlanTier, currency: Currency): string {
  const id = priceIdFor(tier, currency);
  if (!id) {
    throw new Error(
      `Stripe price not configured for ${tier}/${currency}. ` +
        `Set env var STRIPE_PRICE_${tier}_${currency} in Vercel.`
    );
  }
  return id;
}

/**
 * Reverse-lookup: given a Stripe Price ID, find the tier and currency.
 * Useful for webhook processing.
 */
export function tierFromPriceId(
  priceId: string
): { tier: PlanTier; currency: Currency } | null {
  for (const tier of ["PRO", "CLINIC"] as const) {
    for (const currency of ["BRL", "USD"] as const) {
      if (priceIdFor(tier, currency) === priceId) {
        return { tier, currency };
      }
    }
  }
  return null;
}
