/**
 * SaaS metrics computation for the SuperAdmin console.
 *
 * All metrics are computed from the local Postgres snapshot — no external
 * Stripe calls — and are therefore cheap enough to run on demand from server
 * components. For historical series we reconstruct state from AuditLog entries
 * written by the billing webhook handler (BILLING_* actions).
 *
 * Monetary amounts are always returned in BRL **cents** so the UI layer can
 * format with Intl.NumberFormat without float rounding surprises.
 *
 * Definitions used throughout this file
 * ──────────────────────────────────────
 * - Active subscriber  = tenant with subscriptionStatus in {active, trialing}
 * - Paid subscriber    = active subscriber on PRO or CLINIC
 * - Delinquent         = subscriptionStatus = past_due (may still be inside
 *                        graceUntil window, which is shown separately)
 * - MRR                = sum of plan price for paid subscribers (trialing
 *                        tenants contribute 0 — they have not paid yet)
 * - Churn (monthly)    = paid cancellations in month / paid active at month start
 * - LTV                = ARPA / monthly churn rate
 * - CAC                = null (requires marketing spend data we do not store)
 */

import { db } from "./db";
import { PlanTier } from "@prisma/client";
import { PLANS } from "./billing/plans";

// Pricing in cents, BRL. Keep in sync with Stripe products + billing-actions UI.
export const PLAN_PRICE_CENTS: Record<PlanTier, number> = {
  FREE: 0,
  PRO: 9900,
  CLINIC: 19900,
};

// Fallback FX. Real rate should come from Stripe balance transactions, but for
// MRR display a constant is acceptable — USD is a secondary readout.
const BRL_PER_USD = 5.0;

// ─── Current-state snapshot ─────────────────────────────────────────────────

export interface SaasMetrics {
  // Counts
  tenantCount: number;
  userCount: number;
  patientCount: number;

  // Plan distribution
  freeCount: number;
  proCount: number;
  clinicCount: number;

  // Subscription health
  activeSubscribers: number;   // active + trialing
  paidSubscribers: number;     // active + trialing on PRO/CLINIC
  trialingCount: number;
  pastDueCount: number;
  graceCount: number;          // past_due AND still inside graceUntil window
  canceledAtPeriodEndCount: number;

  // Revenue (cents, BRL)
  mrrCents: number;
  arrCents: number;
  mrrUsdCents: number;
  arpaCents: number;

  // Movements — current month to date
  newPaidThisMonth: number;
  canceledPaidThisMonth: number;
  reactivationsThisMonth: number;
  trialToPaidThisMonth: number;
  netNewPaidThisMonth: number;

  // Derived rates
  monthlyChurnRate: number | null;   // percent, e.g. 2.3 = 2.3%
  monthlyGrossChurnCents: number;    // MRR lost to cancellations this month
  ltvCents: number | null;
  cac: number | null;

  // Operational alerts
  webhookErrors24h: number;
  overQuotaTenantCount: number;
}

export async function computeSaasMetrics(): Promise<SaasMetrics> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [tenants, tenantCount, userCount, patientCount, webhookErrors24h] =
    await Promise.all([
      db.tenant.findMany({
        select: {
          id: true,
          planTier: true,
          subscriptionStatus: true,
          currentPeriodEnd: true,
          graceUntil: true,
          billingCurrency: true,
          createdAt: true,
          cancelAtPeriodEnd: true,
        },
      }),
      db.tenant.count(),
      db.user.count(),
      db.patient.count({ where: { isActive: true } }),
      db.auditLog.count({
        where: {
          action: "BILLING_WEBHOOK_FAILED",
          createdAt: { gte: oneDayAgo },
        },
      }),
    ]);

  let freeCount = 0;
  let proCount = 0;
  let clinicCount = 0;
  let activeSubscribers = 0;
  let paidSubscribers = 0;
  let trialingCount = 0;
  let pastDueCount = 0;
  let graceCount = 0;
  let canceledAtPeriodEndCount = 0;
  let mrrCents = 0;

  for (const t of tenants) {
    if (t.planTier === "FREE") freeCount++;
    else if (t.planTier === "PRO") proCount++;
    else if (t.planTier === "CLINIC") clinicCount++;

    const status = t.subscriptionStatus ?? "";
    const isActive = status === "active" || status === "trialing";
    if (isActive) activeSubscribers++;
    if (status === "trialing") trialingCount++;
    if (status === "past_due") pastDueCount++;
    if (t.graceUntil && t.graceUntil > now) graceCount++;
    if (t.cancelAtPeriodEnd) canceledAtPeriodEndCount++;

    // MRR — only *active* paid subscribers contribute. Trialing is counted in
    // active subs for health, but not in MRR because no money is flowing yet.
    if (status === "active" && (t.planTier === "PRO" || t.planTier === "CLINIC")) {
      paidSubscribers++;
      mrrCents += PLAN_PRICE_CENTS[t.planTier];
    }
  }

  // Paid subscribers in MRR are the "active" ones; paidSubscribers for
  // trialing-inclusive head count:
  const paidOrTrialing = tenants.filter(
    (t) =>
      (t.subscriptionStatus === "active" || t.subscriptionStatus === "trialing") &&
      (t.planTier === "PRO" || t.planTier === "CLINIC"),
  ).length;

  const arpaCents = paidSubscribers > 0 ? Math.round(mrrCents / paidSubscribers) : 0;
  const arrCents = mrrCents * 12;
  const mrrUsdCents = Math.round(mrrCents / BRL_PER_USD);

  // ─── Month-to-date movements via AuditLog ────────────────────────────────
  // Rely on BILLING_* audit events emitted by the Stripe webhook handler.
  const [movementsThisMonth, canceledThisMonth] = await Promise.all([
    db.auditLog.findMany({
      where: {
        action: { in: ["BILLING_SUBSCRIPTION_CREATED", "BILLING_SUBSCRIPTION_REACTIVATED", "BILLING_TRIAL_CONVERTED"] },
        createdAt: { gte: startOfMonth },
      },
      select: { action: true },
    }),
    db.auditLog.count({
      where: {
        action: "BILLING_SUBSCRIPTION_CANCELED",
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  let newPaidThisMonth = 0;
  let reactivationsThisMonth = 0;
  let trialToPaidThisMonth = 0;
  for (const m of movementsThisMonth) {
    if (m.action === "BILLING_SUBSCRIPTION_CREATED") newPaidThisMonth++;
    else if (m.action === "BILLING_SUBSCRIPTION_REACTIVATED") reactivationsThisMonth++;
    else if (m.action === "BILLING_TRIAL_CONVERTED") trialToPaidThisMonth++;
  }
  const canceledPaidThisMonth = canceledThisMonth;
  const netNewPaidThisMonth =
    newPaidThisMonth + reactivationsThisMonth + trialToPaidThisMonth - canceledPaidThisMonth;

  // ─── Churn rate — previous-month cohort basis ───────────────────────────
  // Denominator = paid subs that existed at the START of the current month,
  // approximated by (paidSubscribers now + canceledPaidThisMonth - newPaid - reactivations).
  // Numerator = canceled in current month.
  let monthlyChurnRate: number | null = null;
  const denom =
    paidSubscribers + canceledPaidThisMonth - newPaidThisMonth - reactivationsThisMonth;
  if (denom > 0) {
    monthlyChurnRate = (canceledPaidThisMonth / denom) * 100;
  }
  // Gross revenue churn: best-effort — we do not know the exact MRR of each
  // canceled sub at cancellation time without parsing the audit summary, so we
  // approximate with current ARPA.
  const monthlyGrossChurnCents = arpaCents * canceledPaidThisMonth;

  let ltvCents: number | null = null;
  if (monthlyChurnRate !== null && monthlyChurnRate > 0 && monthlyChurnRate < 100) {
    ltvCents = Math.round(arpaCents / (monthlyChurnRate / 100));
  }

  // ─── Over-quota tenants (from plan-limit audit) ─────────────────────────
  const overQuotaTenantCount = await countOverQuotaTenants();

  void paidOrTrialing;
  void startOfPrevMonth;

  return {
    tenantCount,
    userCount,
    patientCount,
    freeCount,
    proCount,
    clinicCount,
    activeSubscribers,
    paidSubscribers,
    trialingCount,
    pastDueCount,
    graceCount,
    canceledAtPeriodEndCount,
    mrrCents,
    arrCents,
    mrrUsdCents,
    arpaCents,
    newPaidThisMonth,
    canceledPaidThisMonth,
    reactivationsThisMonth,
    trialToPaidThisMonth,
    netNewPaidThisMonth,
    monthlyChurnRate,
    monthlyGrossChurnCents,
    ltvCents,
    cac: null,
    webhookErrors24h,
    overQuotaTenantCount,
  };
}

// ─── Historical series ──────────────────────────────────────────────────────
// Reconstructed from AuditLog BILLING_* events. First pass is a forward
// simulation starting from the earliest billing audit entry; tenants that
// existed before the first event are assumed to have been on their current
// plan at that point.

export interface HistoricalPoint {
  month: string;        // YYYY-MM
  label: string;        // human label (pt-BR)
  mrrCents: number;
  activeSubscribers: number;
  newPaid: number;
  canceled: number;
}

export async function computeHistoricalSeries(months: number = 12): Promise<HistoricalPoint[]> {
  const now = new Date();
  const out: HistoricalPoint[] = [];

  // Pull all paid tenants once — we will bucket their createdAt into months.
  const paidTenants = await db.tenant.findMany({
    where: { planTier: { in: ["PRO", "CLINIC"] } },
    select: { id: true, planTier: true, createdAt: true, subscriptionStatus: true },
  });

  // Pull cancellation audit events for the window.
  const windowStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const cancelEvents = await db.auditLog.findMany({
    where: {
      action: "BILLING_SUBSCRIPTION_CANCELED",
      createdAt: { gte: windowStart },
    },
    select: { createdAt: true, entityId: true },
  });

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const ymLabel = monthStart.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const ymKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

    let mrrCents = 0;
    let activeSubscribers = 0;
    let newPaid = 0;
    const canceled = cancelEvents.filter(
      (c) => c.createdAt >= monthStart && c.createdAt < monthEnd,
    ).length;

    for (const t of paidTenants) {
      if (t.createdAt < monthEnd) {
        // Assume still active unless we see a cancel event for this tenant
        // with createdAt <= monthEnd.
        const wasCanceledBefore = cancelEvents.some(
          (c) => c.entityId === t.id && c.createdAt < monthEnd,
        );
        if (!wasCanceledBefore) {
          activeSubscribers++;
          mrrCents += PLAN_PRICE_CENTS[t.planTier];
        }
      }
      if (t.createdAt >= monthStart && t.createdAt < monthEnd) {
        newPaid++;
      }
    }

    out.push({ month: ymKey, label: ymLabel, mrrCents, activeSubscribers, newPaid, canceled });
  }

  return out;
}

// ─── Delinquent accounts ────────────────────────────────────────────────────

export async function listDelinquentTenants(limit: number = 50) {
  return db.tenant.findMany({
    where: {
      OR: [
        { subscriptionStatus: "past_due" },
        { subscriptionStatus: "unpaid" },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      planTier: true,
      subscriptionStatus: true,
      graceUntil: true,
      currentPeriodEnd: true,
      _count: { select: { memberships: true, patients: true } },
    },
    orderBy: { currentPeriodEnd: "asc" },
    take: limit,
  });
}

// ─── Over-quota audit ───────────────────────────────────────────────────────
// Finds tenants whose current (isActive=true) patient count or seat count
// exceeds their plan's quota. Uses the same entitlement definitions as the
// runtime gate in billing/limits.ts.

export interface OverQuotaTenantRow {
  id: string;
  name: string;
  slug: string;
  planTier: PlanTier;
  patientsCurrent: number;
  patientsLimit: number | "∞";
  therapistsCurrent: number;
  therapistsLimit: number | "∞";
  overPatients: boolean;
  overTherapists: boolean;
}

async function countOverQuotaTenants(): Promise<number> {
  const rows = await listOverQuotaTenants(1000);
  return rows.length;
}

export async function listOverQuotaTenants(limit: number = 200): Promise<OverQuotaTenantRow[]> {
  const tenants = await db.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      planTier: true,
      _count: {
        select: {
          patients: { where: { isActive: true } },
          memberships: { where: { status: "ACTIVE", role: { in: ["PSYCHOLOGIST", "ASSISTANT"] } } },
        },
      },
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  const rows: OverQuotaTenantRow[] = [];
  for (const t of tenants) {
    const plan = PLANS[t.planTier];
    const pLimit = plan.maxActivePatients;
    const sLimit = plan.maxTherapistSeats;
    const pCurr = t._count.patients;
    const sCurr = t._count.memberships;
    const overPatients = Number.isFinite(pLimit) && pCurr > (pLimit as number);
    const overTherapists = Number.isFinite(sLimit) && sCurr > (sLimit as number);
    if (overPatients || overTherapists) {
      rows.push({
        id: t.id,
        name: t.name,
        slug: t.slug,
        planTier: t.planTier,
        patientsCurrent: pCurr,
        patientsLimit: Number.isFinite(pLimit) ? (pLimit as number) : "∞",
        therapistsCurrent: sCurr,
        therapistsLimit: Number.isFinite(sLimit) ? (sLimit as number) : "∞",
        overPatients,
        overTherapists,
      });
    }
  }
  return rows;
}

// ─── Recent activity streams ────────────────────────────────────────────────

export async function getRecentBillingEvents(limit: number = 20) {
  return db.auditLog.findMany({
    where: { action: { startsWith: "BILLING_" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { email: true, name: true } } },
  });
}
