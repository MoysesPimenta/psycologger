/**
 * Billing limits enforcement — Psycologger
 * Quota checks for active patients and therapist seats.
 * Called at the point of resource creation to enforce plan limits.
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
    public readonly limit: number
  ) {
    const msg =
      resource === "patient"
        ? `Limite de pacientes atingido: ${current}/${limit}`
        : `Limite de terapeutas atingido: ${current}/${limit}`;
    super(msg);
    this.name = "QuotaExceededError";
  }
}

/**
 * Count active patients in a tenant.
 * Active = isActive && (has appointment OR session OR charge OR journal entry in last 90 days)
 */
export async function countActivePatients(tenantId: string): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Subquery: patients with recent activity
  const activePatients = await db.patient.count({
    where: {
      tenantId,
      isActive: true,
      OR: [
        {
          appointments: {
            some: { createdAt: { gte: ninetyDaysAgo } },
          },
        },
        {
          clinicalSessions: {
            some: { createdAt: { gte: ninetyDaysAgo } },
          },
        },
        {
          charges: {
            some: { createdAt: { gte: ninetyDaysAgo } },
          },
        },
        {
          journalEntries: {
            some: { createdAt: { gte: ninetyDaysAgo } },
          },
        },
      ],
    },
  });

  return activePatients;
}

/**
 * Count therapist seats (active staff with PSYCHOLOGIST or ASSISTANT role).
 */
export async function countTherapistSeats(tenantId: string): Promise<number> {
  const therapists = await db.membership.count({
    where: {
      tenantId,
      status: "ACTIVE",
      role: { in: ["PSYCHOLOGIST", "ASSISTANT"] },
    },
  });

  return therapists;
}

/**
 * Assert that the tenant can add another patient.
 * Throws QuotaExceededError if at limit.
 */
export async function assertCanAddPatient(tenantId: string): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { planTier: true },
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const plan = getPlan(tenant.planTier);
  const current = await countActivePatients(tenantId);

  if (current >= plan.maxActivePatients) {
    throw new QuotaExceededError("patient", current, plan.maxActivePatients);
  }
}

/**
 * Assert that the tenant can add another therapist.
 * Throws QuotaExceededError if at limit.
 */
export async function assertCanAddTherapist(tenantId: string): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { planTier: true },
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const plan = getPlan(tenant.planTier);
  const current = await countTherapistSeats(tenantId);

  if (current >= plan.maxTherapistSeats) {
    throw new QuotaExceededError("therapist", current, plan.maxTherapistSeats);
  }
}
