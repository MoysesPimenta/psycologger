/**
 * POST /api/v1/cron/billing-quota-check
 *
 * Daily quota enforcement — finds tenants over quota and sends warning emails.
 * Runs once daily (Vercel Hobby plan limit).
 *
 * For each tenant with a paid plan (PRO or CLINIC):
 * 1. Check if active patients > plan.maxActivePatients
 * 2. Check if therapist seats > plan.maxTherapistSeats
 * 3. If over quota: send warning email to TENANT_ADMIN users (first time only)
 * 4. Log audit event
 *
 * The existing quota enforcement (assertCanAddPatient, assertCanAddTherapist)
 * already prevents ADDING new resources. This cron focuses on NOTIFYING
 * about existing over-quota conditions.
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCronAuth } from "@/lib/cron-auth";
import { auditLog } from "@/lib/audit";
import { countActivePatients, countTherapistSeats, getTenantQuotaUsage } from "@/lib/billing/limits";
import { getPlan } from "@/lib/billing/plans";
import {
  sendOverQuotaWarning,
  sendPaymentOverdueWarning,
} from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface QuotaCheckResult {
  tenantId: string;
  tenantName: string;
  overQuota: boolean;
  patientOverQuota: boolean;
  therapistOverQuota: boolean;
  emailsSent: number;
}

export async function POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const now = new Date();
  const results: QuotaCheckResult[] = [];

  try {
    // Fetch all tenants with paid plans
    const paidTenants = await db.tenant.findMany({
      where: {
        planTier: { in: ["PRO", "CLINIC"] },
      },
      select: {
        id: true,
        name: true,
        planTier: true,
        subscriptionStatus: true,
        graceUntil: true,
      },
    });

    console.log(
      `[cron/billing-quota-check] Checking ${paidTenants.length} paid tenants for over-quota conditions`
    );

    for (const tenant of paidTenants) {
      try {
        const result: QuotaCheckResult = {
          tenantId: tenant.id,
          tenantName: tenant.name,
          overQuota: false,
          patientOverQuota: false,
          therapistOverQuota: false,
          emailsSent: 0,
        };

        // Fetch quota usage
        const quotaUsage = await getTenantQuotaUsage(tenant.id);
        const plan = getPlan(tenant.planTier);

        result.patientOverQuota = quotaUsage.patients.overQuota;
        result.therapistOverQuota = quotaUsage.therapists.overQuota;
        result.overQuota = result.patientOverQuota || result.therapistOverQuota;

        if (!result.overQuota) {
          results.push(result);
          continue;
        }

        // Tenant is over quota — fetch admins and send warnings
        const admins = await db.membership.findMany({
          where: {
            tenantId: tenant.id,
            role: "TENANT_ADMIN",
            status: "ACTIVE",
          },
          include: { user: { select: { email: true, name: true } } },
        });

        // Check if warning was already sent recently (within last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentWarning = await db.auditLog.findFirst({
          where: {
            tenantId: tenant.id,
            action: "BILLING_QUOTA_WARNING_SENT",
            createdAt: { gte: sevenDaysAgo },
          },
        });

        // Only send emails if no recent warning
        if (!recentWarning) {
          for (const admin of admins) {
            if (!admin.user.email) continue;

            try {
              let resourceType = "";
              let current = 0;
              let limit = 0;

              if (result.patientOverQuota) {
                resourceType = "pacientes";
                current = quotaUsage.patients.current;
                limit = quotaUsage.patients.limit;
              } else if (result.therapistOverQuota) {
                resourceType = "terapeutas";
                current = quotaUsage.therapists.current;
                limit = quotaUsage.therapists.limit;
              }

              await sendOverQuotaWarning({
                email: admin.user.email,
                tenantName: tenant.name,
                resource: resourceType,
                current,
                limit,
                planTier: tenant.planTier,
              });

              result.emailsSent++;
            } catch (err) {
              console.error(
                `[cron/billing-quota-check] Failed to send warning to ${admin.user.email}:`,
                err
              );
            }
          }

          // Log that warnings were sent
          if (result.emailsSent > 0) {
            await auditLog({
              tenantId: tenant.id,
              action: "BILLING_QUOTA_WARNING_SENT",
              entity: "Tenant",
              entityId: tenant.id,
              summary: {
                patientOverQuota: result.patientOverQuota,
                patientCurrent: quotaUsage.patients.current,
                patientLimit: quotaUsage.patients.limit,
                therapistOverQuota: result.therapistOverQuota,
                therapistCurrent: quotaUsage.therapists.current,
                therapistLimit: quotaUsage.therapists.limit,
                emailsSent: result.emailsSent,
              },
            });
          }
        }

        results.push(result);
      } catch (err) {
        console.error(
          `[cron/billing-quota-check] Error checking tenant ${tenant.id}:`,
          err instanceof Error ? err.message : "Unknown error"
        );
      }
    }

    // Count over-quota tenants
    const overQuotaCount = results.filter((r) => r.overQuota).length;
    const warningsSent = results.reduce((sum, r) => sum + r.emailsSent, 0);

    console.log(
      `[cron/billing-quota-check] Complete: ${overQuotaCount} over-quota, ${warningsSent} warnings sent`
    );

    return NextResponse.json({
      ok: true,
      tenantChecked: paidTenants.length,
      overQuotaCount,
      warningsSent,
      results: results.filter((r) => r.overQuota), // Return only over-quota results
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error(
      "[cron/billing-quota-check] Fatal error:",
      err instanceof Error ? err.message : "Unknown error"
    );

    // Log failure for debugging
    try {
      await auditLog({
        action: "BILLING_WEBHOOK_FAILED",
        entity: "CronJob",
        entityId: "billing-quota-check",
        summary: {
          error: err instanceof Error ? err.message : "Unknown error",
          cron: "billing-quota-check",
        },
      });
    } catch {
      // Ignore audit failure
    }

    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
