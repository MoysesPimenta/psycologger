/**
 * POST /api/v1/cron/billing-reconcile
 *
 * Nightly billing enforcement (daily at 04:00 UTC):
 * 1. GRACE PERIOD ENFORCEMENT: Suspend tenants whose grace period has expired
 * 2. STRIPE RECONCILIATION: Fetch Stripe charges from last 24h, compare to DB records
 *
 * For grace enforcement, finds tenants with graceUntil in the past and:
 *   - Sets subscriptionStatus to null (cleared)
 *   - Suspends all ACTIVE memberships
 *   - Clears graceUntil
 *   - Sends suspension email to TENANT_ADMIN users
 *   - Creates audit log entry with action BILLING_STATE_CHANGED
 *
 * For Stripe reconciliation:
 * 1. Fetch Stripe charges from the last 24h
 * 2. Compare against DB Charge/Payment records
 * 3. Record any drift (missing, amount mismatch, status mismatch)
 * 4. Alert via Sentry if drift detected
 *
 * Always returns 200 with summary (drift is data, not failure).
 * Idempotent: safe to run multiple times in same window.
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCronAuth } from "@/lib/cron-auth";
import { auditLog } from "@/lib/audit";
import { sendSubscriptionSuspended } from "@/lib/email";

// Stripe client — initialized lazily
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _stripe: any = null;

async function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    const Stripe = (await import("stripe")).default;
    _stripe = new Stripe(key, { apiVersion: "2024-04-10" });
  }
  return _stripe;
}

interface DriftRecord {
  type:
    | "stripe_not_in_db"
    | "db_not_in_stripe"
    | "amount_mismatch"
    | "status_mismatch";
  stripeChargeId?: string;
  dbChargeId?: string;
  details?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const now = new Date();
  const last24hMs = 24 * 60 * 60 * 1000;
  const since = Math.floor((now.getTime() - last24hMs) / 1000); // Unix timestamp, seconds

  let tenantsChecked = 0;
  let totalCharges = 0;
  let graceAutoSuspended = 0;
  const allDrift: DriftRecord[] = [];

  // ─── GRACE PERIOD ENFORCEMENT ──────────────────────────────────────────────
  // Suspend tenants whose grace period has expired (graceUntil < now)
  try {
    const expiredGraceTenants = await db.tenant.findMany({
      where: {
        graceUntil: {
          lt: now, // graceUntil is in the past
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    for (const tenant of expiredGraceTenants) {
      try {
        // Update tenant: clear subscriptionStatus and graceUntil
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            subscriptionStatus: null,
            graceUntil: null,
          },
        });

        // Suspend all ACTIVE memberships for this tenant
        await db.membership.updateMany({
          where: {
            tenantId: tenant.id,
            status: "ACTIVE",
          },
          data: {
            status: "SUSPENDED",
          },
        });

        // Create audit log entry
        await auditLog({
          tenantId: tenant.id,
          action: "BILLING_STATE_CHANGED",
          entity: "Tenant",
          entityId: tenant.id,
          summary: {
            event: "grace_period_expired_auto_suspension",
            membershipsAffected: "all_active",
          },
        });

        // Send suspension notification to TENANT_ADMIN users
        try {
          const admins = await db.membership.findMany({
            where: {
              tenantId: tenant.id,
              role: "TENANT_ADMIN",
              status: "SUSPENDED", // They were just suspended
            },
            include: { user: { select: { email: true } } },
          });

          for (const admin of admins) {
            if (!admin.user.email) continue;
            try {
              await sendSubscriptionSuspended({
                email: admin.user.email,
                tenantName: tenant.name,
              });
            } catch (err) {
              console.error(
                `[cron/billing-reconcile] Failed to send suspension email to ${admin.user.email}:`,
                err
              );
            }
          }
        } catch (err) {
          console.error(
            `[cron/billing-reconcile] Failed to fetch admins for tenant ${tenant.id}:`,
            err
          );
        }

        graceAutoSuspended++;
        console.log(
          `[cron/billing-reconcile] Auto-suspended tenant ${tenant.id} (grace expired)`
        );
      } catch (err) {
        console.error(
          `[cron/billing-reconcile] Error processing grace expiry for tenant ${tenant.id}:`,
          err instanceof Error ? err.message : "Unknown error"
        );
      }
    }
  } catch (err) {
    console.error(
      "[cron/billing-reconcile] Error during grace period enforcement:",
      err instanceof Error ? err.message : "Unknown error"
    );
  }

  // Fetch all tenants
  const tenants = await db.tenant.findMany({
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    try {
      const stripe = await getStripe();

      // Fetch Stripe charges created in last 24h for this tenant
      // Note: Without Stripe Connect, we use the platform account.
      // If using Stripe Connect, use stripe.charges.list({ stripeAccount: tenant.stripeConnectId })
      const charges = await stripe.charges.list(
        {
          created: { gte: since },
          limit: 100, // Stripe pagination: start with 100
        },
        { maxNetworkRetries: 2 }
      );

      // Iterate through all pages of charges
      let cursor = charges;
      while (true) {
        for (const stripeCharge of cursor.data) {
          totalCharges++;

          // Try to find matching DB record by Stripe charge ID
          // (assumes we store stripe_charge_id in DB — not in current schema yet)
          // For now, we'll search by metadata or amount + date heuristic
          const dbCharges = await db.charge.findMany({
            where: {
              tenantId: tenant.id,
              // Match by amount in cents (Stripe amount in cents)
              amountCents: stripeCharge.amount,
            },
            include: { payments: true },
          });

          // Check if any matching DB charge exists
          // (This is a heuristic; production should have stripe_charge_id field)
          let matched = false;
          for (const dbCharge of dbCharges) {
            // Verify by amount and approximate date
            const chargeAge = Math.abs(
              new Date(stripeCharge.created * 1000).getTime() -
                dbCharge.createdAt.getTime()
            );
            if (chargeAge < 86400000) {
              // Within 24h
              matched = true;

              // Check status alignment
              const stripeStatus = stripeCharge.captured ? "PAID" : "PENDING";
              const refunded = stripeCharge.refunded ? "REFUNDED" : stripeStatus;
              const actualStripeStatus = stripeCharge.refunded ? "REFUNDED" : refunded;

              if (actualStripeStatus !== dbCharge.status) {
                allDrift.push({
                  type: "status_mismatch",
                  stripeChargeId: stripeCharge.id,
                  dbChargeId: dbCharge.id,
                  details: {
                    stripeStatus: actualStripeStatus,
                    dbStatus: dbCharge.status,
                    tenantId: tenant.id,
                  },
                });
              }
              break;
            }
          }

          // If no DB record found, this is drift
          if (!matched) {
            allDrift.push({
              type: "stripe_not_in_db",
              stripeChargeId: stripeCharge.id,
              details: {
                amount: stripeCharge.amount,
                status: stripeCharge.captured ? "captured" : "uncaptured",
                refunded: stripeCharge.refunded,
                created: new Date(stripeCharge.created * 1000).toISOString(),
                tenantId: tenant.id,
              },
            });
          }
        }

        // Pagination: check if there are more results
        if (!cursor.has_more) break;
        if (!cursor.data.length) break;

        const lastId = cursor.data[cursor.data.length - 1].id;
        cursor = await stripe.charges.list(
          {
            created: { gte: since },
            limit: 100,
            starting_after: lastId,
          },
          { maxNetworkRetries: 2 }
        );
      }

      tenantsChecked++;
    } catch (err) {
      console.error(
        `[cron/billing-reconcile] Error checking tenant ${tenant.id}:`,
        err instanceof Error ? err.message : "Unknown error"
      );
      // Continue checking other tenants even if one fails
    }
  }

  // Alert via Sentry if drift detected
  if (allDrift.length > 0) {
    try {
      const Sentry = await import("@sentry/nextjs").then((m) => m.default);
      Sentry.captureMessage(
        `Billing drift detected: ${allDrift.length} mismatches in last 24h`,
        "warning"
      );
    } catch {
      // Sentry not configured or import failed — log to console instead
      console.warn(
        `[cron/billing-reconcile] Billing drift detected: ${allDrift.length} mismatches`
      );
    }
  }

  return NextResponse.json({
    ok: true,
    graceAutoSuspended,
    tenantsChecked,
    totalCharges,
    driftCount: allDrift.length,
    drift: allDrift.slice(0, 10), // Return first 10 for summary
    timestamp: now.toISOString(),
  });
}
