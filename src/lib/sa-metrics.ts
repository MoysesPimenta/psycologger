/**
 * SaaS metrics computation for SuperAdmin dashboard
 * Computes MRR, ARR, churn, and other key metrics from local database
 */

import { db } from "./db";
import { PlanTier } from "@prisma/client";

// Hardcoded fallback rates (USD to BRL)
// TODO: pull from Stripe API or a rates service
const CURRENCY_RATES: Record<string, number> = {
  BRL: 1.0,
  USD: 5.0, // fallback rate
};

// Pricing tiers (in cents, BRL assumed)
const PLAN_PRICES: Record<PlanTier, number> = {
  FREE: 0,
  PRO: 9900, // R$ 99.00/month
  CLINIC: 19900, // R$ 199.00/month
};

interface MetricsResult {
  mrrBrl: number;
  mrrUsd: number;
  arr: number;
  activeSubscribers: number;
  freeCount: number;
  proCount: number;
  clinicCount: number;
  churnRate: number | null;
  netNewPaidThisMonth: number;
  pastDueCount: number;
  graceCount: number;
  arpa: number;
  ltv: number | null;
  cac: number | null;
}

export async function computeSaasMetrics(): Promise<MetricsResult> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Fetch all tenants with billing info
  const tenants = await db.tenant.findMany({
    select: {
      id: true,
      planTier: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      graceUntil: true,
      billingCurrency: true,
      createdAt: true,
      cancelAtPeriodEnd: true,
      _count: { select: { patients: true } },
    },
  });

  // Compute MRR
  let mrrBrl = 0;
  let activeCount = 0;
  let proCount = 0;
  let clinicCount = 0;
  let freeCount = 0;
  let pastDueCount = 0;
  let graceCount = 0;

  for (const tenant of tenants) {
    if (tenant.planTier === "FREE") {
      freeCount++;
    } else if (tenant.planTier === "PRO") {
      proCount++;
    } else if (tenant.planTier === "CLINIC") {
      clinicCount++;
    }

    if (tenant.subscriptionStatus === "active" || tenant.subscriptionStatus === "trialing") {
      activeCount++;
      const price = PLAN_PRICES[tenant.planTier] / 100; // Convert from cents to BRL
      const rate = CURRENCY_RATES[tenant.billingCurrency || "BRL"] || 1;
      mrrBrl += price / rate; // Normalize to BRL
    } else if (tenant.subscriptionStatus === "past_due") {
      pastDueCount++;
    }

    if (tenant.graceUntil && tenant.graceUntil > now) {
      graceCount++;
    }
  }

  // Compute ARR
  const arr = mrrBrl * 12;

  // Compute churn
  let churnRate: number | null = null;
  const canceledInPeriod = tenants.filter(
    (t) => t.cancelAtPeriodEnd && t.createdAt >= thirtyDaysAgo
  ).length;
  if (activeCount > 0) {
    churnRate = (canceledInPeriod / activeCount) * 100;
  }

  // Compute net new paid (PRO + CLINIC created this month minus canceled)
  const newPaidThisMonth = tenants.filter(
    (t) =>
      t.createdAt >= startOfMonth &&
      (t.planTier === "PRO" || t.planTier === "CLINIC")
  ).length;
  const canceledPaidThisMonth = tenants.filter(
    (t) =>
      t.cancelAtPeriodEnd &&
      t.createdAt >= startOfMonth &&
      (t.planTier === "PRO" || t.planTier === "CLINIC")
  ).length;
  const netNewPaidThisMonth = newPaidThisMonth - canceledPaidThisMonth;

  // ARPA (Average Revenue Per Account)
  const arpa = activeCount > 0 ? mrrBrl / activeCount : 0;

  // LTV (Customer Lifetime Value) = ARPA / monthly churn rate
  let ltv: number | null = null;
  if (churnRate && churnRate > 0 && churnRate < 100) {
    const monthlyChurn = churnRate / 100;
    ltv = arpa / monthlyChurn;
  }

  // CAC: requires external data (marketing spend) — stored in SaaSMetric table
  // For now, return null
  const cac = null;

  // Convert MRR to USD for display (using fallback rate)
  const mrrUsd = mrrBrl / (CURRENCY_RATES.USD || 5.0);

  return {
    mrrBrl,
    mrrUsd,
    arr,
    activeSubscribers: activeCount,
    freeCount,
    proCount,
    clinicCount,
    churnRate: churnRate !== null && churnRate !== 0 && churnRate < 100 ? churnRate : null,
    netNewPaidThisMonth,
    pastDueCount,
    graceCount,
    arpa,
    ltv,
    cac,
  };
}

/**
 * Compute MRR over last 12 months (uses tenant snapshots from audit log)
 * For now, returns flat line — TODO: implement historical tracking via audit log
 */
export async function computeHistoricalMrr(): Promise<Array<{ month: string; mrrBrl: number }>> {
  const now = new Date();
  const months: Array<{ month: string; mrrBrl: number }> = [];

  // Generate 12-month history
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

    // TODO: Reconstruct from audit log BILLING_STATE_CHANGED entries
    // For now, use current MRR as flat line
    const metrics = await computeSaasMetrics();
    months.push({
      month: monthStr,
      mrrBrl: metrics.mrrBrl,
    });
  }

  return months;
}

/**
 * Get active subscriber count over time
 */
export async function computeHistoricalActiveSubscribers(): Promise<
  Array<{ month: string; count: number }>
> {
  const now = new Date();
  const months: Array<{ month: string; count: number }> = [];

  // Generate 12-month history
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

    // TODO: Use audit log to reconstruct historical state
    const metrics = await computeSaasMetrics();
    months.push({
      month: monthStr,
      count: metrics.activeSubscribers,
    });
  }

  return months;
}

/**
 * Get recent billing events from audit log
 */
export async function getRecentBillingEvents(limit: number = 20) {
  return db.auditLog.findMany({
    where: {
      action: { startsWith: "BILLING_" },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { email: true, name: true } },
    },
  });
}
