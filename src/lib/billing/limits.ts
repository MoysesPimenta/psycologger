/**
 * Billing limits enforcement — Psycologger
 *
 * Plan entitlement logic. Single source of truth for "can this tenant add
 * another <resource>?" decisions. MUST be called server-side at every
 * creation and reactivation path. Do NOT gate on UI flags only.
 *
 * "Active patient" for LIMIT enforcement = Patient.isActive === true.
 * This matches what a clinic operator reads on the billing page
 * ("Até 3 pacientes ativos"). A soft-deleted / archived patient
 * (isActive=false) does not count against quota, so clinics can grow
 * their roster forever without being penalized for inactive history.
 *
 * A separate dashboard metric (countPatientsWithRecentActivity) uses the
 * 90-day activity window — that's an engagement KPI, NOT a gate.
 */

import { db } from "@/lib/db";
import { getPlan } from "./plans";
import type { PlanTier } from "@prisma/client";

export class QuotaExceededError extends Error {
  readonly status = 402; // Payment Required
  readonly code = "QUOTA_EXCEEDED";
  constructor(
    public readonly resource: "patient" | "therapist",
    public readonly current: number,
    public readonly limit: number,
    public readonly planTier: PlanTier
  ) {
    const msg =
      resource === "patient"
        ? `Limite de pacientes ativos atingido no plano ${planTier}: ${current}/${limit}. Faça upgrade do plano para adicionar mais pacientes.`
        : `Limite de terapeutas atingido no plano ${planTier}: ${current}/${limit}. Faça upgrade do plano para convidar mais membros da equipe.`;
    super(msg);
    this.name = "QuotaExceededError";
  }
}

/**
 * Count ACTIVE patients (isActive=true) — the limit-enforcement definition.
 * Use this for gating creation / reactivation.
 */
export async function countActivePatients(tenantId: string): Promise<number> {
  return db.patient.count({
    where: { tenantId, isActive: true },
  });
}

/**
 * Count patients with activity (appointment/session/charge/journal) in the
 * last 90 days. This is a DASHBOARD/ENGAGEMENT metric — do NOT use for
 * quota enforcement because newly-created patients have no activity yet
 * and would trivially bypass the gate.
 */
export async function countPatientsWithRecentActivity(
  tenantId: string
): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return db.patient.count({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { appointments: { some: { createdAt: { gte: ninetyDaysAgo } } } },
        { clinicalSessions: { some: { createdAt: { gte: ninetyDaysAgo } } } },
        { charges: { some: { createdAt: { gte: ninetyDaysAgo } } } },
        { journalEntries: { some: { createdAt: { gte: ninetyDaysAgo } } } },
      ],
    },
  });
}

/**
 * Count therapist seats (active staff with PSYCHOLOGIST or ASSISTANT role).
 */
export async function countTherapistSeats(tenantId: string): Promise<number> {
  return db.membership.count({
    where: {
      tenantId,
      status: "ACTIVE",
      role: { in: ["PSYCHOLOGIST", "ASSISTANT"] },
    },
  });
}

/**
 * Assert that the tenant can add another active patient.
 * Throws QuotaExceededError (HTTP 402) if at limit.
 */
export async function assertCanAddPatient(tenantId: string): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { planTier: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const plan = getPlan(tenant.planTier);
  if (plan.maxActivePatients === Infinity) return;

  const current = await countActivePatients(tenantId);
  if (current >= plan.maxActivePatients) {
    throw new QuotaExceededError(
      "patient",
      current,
      plan.maxActivePatients,
      tenant.planTier
    );
  }
}

/**
 * Assert that the tenant can add another therapist seat.
 * Throws QuotaExceededError (HTTP 402) if at limit.
 */
export async function assertCanAddTherapist(tenantId: string): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { planTier: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const plan = getPlan(tenant.planTier);
  if (plan.maxTherapistSeats === Infinity) return;

  const current = await countTherapistSeats(tenantId);
  if (current >= plan.maxTherapistSeats) {
    throw new QuotaExceededError(
      "therapist",
      current,
      plan.maxTherapistSeats,
      tenant.planTier
    );
  }
}

/**
 * Snapshot of a tenant's quota utilization — for admin dashboards and the
 * billing page. Pure read, no throw.
 */
export async function getTenantQuotaUsage(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { planTier: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const plan = getPlan(tenant.planTier);
  const [activePatients, therapistSeats, recentlyEngaged] = await Promise.all([
    countActivePatients(tenantId),
    countTherapistSeats(tenantId),
    countPatientsWithRecentActivity(tenantId),
  ]);

  return {
    planTier: tenant.planTier,
    patients: {
      current: activePatients,
      limit: plan.maxActivePatients,
      overQuota: activePatients > plan.maxActivePatients,
    },
    therapists: {
      current: therapistSeats,
      limit: plan.maxTherapistSeats,
      overQuota: therapistSeats > plan.maxTherapistSeats,
    },
    engagement: {
      patientsActive90d: recentlyEngaged,
    },
  };
}
