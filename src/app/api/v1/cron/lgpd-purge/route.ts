/**
 * POST /api/v1/cron/lgpd-purge
 *
 * Daily LGPD compliance job. Purges tenant data for tenants marked CANCELLED
 * more than 90 days ago. For each eligible tenant:
 *
 *  1. Hard-deletes all tenant-scoped data in FK-safe order (children first):
 *     AuditLog, ReminderLog, PaymentReminderLog, JournalNote, JournalEntry,
 *     ClinicalSession (including soft-deleted), Appointment, Payment, Charge,
 *     FileObject, Membership, Patient, then Tenant itself.
 *
 *  2. Wraps each tenant's purge in db.$transaction for atomicity.
 *
 *  3. Writes a summary AuditLog entry BEFORE deletion with counts per table
 *     (action: "TENANT_LGPD_PURGED").
 *
 * Protected by CRON_SECRET header. Idempotent.
 *
 * See docs/generated/26-known-unknowns.md for LGPD retention policy.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCronAuth } from "@/lib/cron-auth";
import { computeTenantPurgeCutoff, LGPD_TENANT_RETENTION_DAYS } from "@/lib/lgpd";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const cutoff = computeTenantPurgeCutoff();
  const results: Array<{
    tenantId: string;
    tenantSlug: string;
    counts: Record<string, number>;
  }> = [];

  try {
    // Find all CANCELLED tenants older than the cutoff
    const cancelledTenants = await db.tenant.findMany({
      where: {
        subscriptionStatus: "CANCELED",
        updatedAt: { lt: cutoff },
      },
      select: { id: true, slug: true, name: true },
    });

    console.log(
      `[lgpd-purge] Found ${cancelledTenants.length} tenants eligible for purge (cutoff: ${cutoff.toISOString()})`
    );

    for (const tenant of cancelledTenants) {
      const counts: Record<string, number> = {};

      try {
        // Wrap each tenant's deletion in a transaction
        await db.$transaction(async (tx) => {
          // First, count what we're about to delete
          counts.auditLog = await tx.auditLog.count({
            where: { tenantId: tenant.id },
          });
          counts.reminderLog = await tx.reminderLog.count({
            where: { tenantId: tenant.id },
          });
          counts.paymentReminderLog = await tx.paymentReminderLog.count({
            where: { tenantId: tenant.id },
          });
          counts.journalNote = await tx.journalNote.count({
            where: { tenantId: tenant.id },
          });
          counts.journalEntry = await tx.journalEntry.count({
            where: { tenantId: tenant.id },
          });
          counts.clinicalSession = await tx.clinicalSession.count({
            where: { tenantId: tenant.id },
          });
          counts.appointment = await tx.appointment.count({
            where: { tenantId: tenant.id },
          });
          counts.payment = await tx.payment.count({
            where: { tenantId: tenant.id },
          });
          counts.charge = await tx.charge.count({
            where: { tenantId: tenant.id },
          });
          counts.fileObject = await tx.fileObject.count({
            where: { tenantId: tenant.id },
          });
          counts.membership = await tx.membership.count({
            where: { tenantId: tenant.id },
          });
          counts.patient = await tx.patient.count({
            where: { tenantId: tenant.id },
          });

          // Write audit entry BEFORE deleting the tenant
          await tx.auditLog.create({
            data: {
              tenantId: tenant.id,
              userId: null,
              action: "TENANT_LGPD_PURGED",
              entity: "Tenant",
              entityId: tenant.id,
              summaryJson: {
                tenantSlug: tenant.slug,
                retentionDays: LGPD_TENANT_RETENTION_DAYS,
                ...counts,
              } as unknown,
            },
          });

          // Delete in FK-safe order (children first)
          await tx.auditLog.deleteMany({ where: { tenantId: tenant.id } });
          await tx.reminderLog.deleteMany({ where: { tenantId: tenant.id } });
          await tx.paymentReminderLog.deleteMany({ where: { tenantId: tenant.id } });
          await tx.journalNote.deleteMany({ where: { tenantId: tenant.id } });
          await tx.journalEntry.deleteMany({ where: { tenantId: tenant.id } });
          await tx.clinicalSession.deleteMany({ where: { tenantId: tenant.id } });
          await tx.appointment.deleteMany({ where: { tenantId: tenant.id } });
          await tx.payment.deleteMany({ where: { tenantId: tenant.id } });
          await tx.charge.deleteMany({ where: { tenantId: tenant.id } });
          await tx.fileObject.deleteMany({ where: { tenantId: tenant.id } });
          await tx.membership.deleteMany({ where: { tenantId: tenant.id } });
          await tx.patient.deleteMany({ where: { tenantId: tenant.id } });

          // Finally, delete the tenant itself
          await tx.tenant.delete({ where: { id: tenant.id } });
        });

        results.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          counts,
        });

        console.log(
          `[lgpd-purge] Purged tenant ${tenant.slug} (${tenant.id}): ${JSON.stringify(counts)}`
        );
      } catch (err) {
        console.error(
          `[lgpd-purge] Error purging tenant ${tenant.slug} (${tenant.id}):`,
          err
        );
        // Continue to next tenant on error; don't fail the entire cron
      }
    }
  } catch (err) {
    console.error("[lgpd-purge] Error during LGPD purge:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }

  console.log(
    JSON.stringify({
      evt: "lgpd_purge",
      cutoff: cutoff.toISOString(),
      tenantsPurged: results.length,
      results,
    })
  );
  return NextResponse.json({
    ok: true,
    cutoff: cutoff.toISOString(),
    tenantsPurged: results.length,
    results,
  });
}
