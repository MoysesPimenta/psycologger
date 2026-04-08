/**
 * /sa/tenants/[id]/billing
 * SuperAdmin console for viewing and overriding tenant billing.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/billing/plans";
import { getBillingState } from "@/lib/billing/subscription-status";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function TenantBillingPage({
  params: { id: tenantId },
  searchParams,
}: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sa/login");

  // Verify SUPERADMIN
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) {
    return <div className="text-red-600">Unauthorized</div>;
  }

  // Fetch tenant
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      planTier: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      graceUntil: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      billingCurrency: true,
    },
  });

  if (!tenant) {
    return <div>Tenant not found</div>;
  }

  const plan = getPlan(tenant.planTier);
  const state = getBillingState({
    planTier: tenant.planTier,
    graceUntil: tenant.graceUntil,
    subscriptionStatus: tenant.subscriptionStatus,
  } as any);

  // Handle POST actions for overrides
  if (searchParams.action === "force-tier" && searchParams.tier) {
    const newTier = searchParams.tier as any;
    if (["FREE", "PRO", "CLINIC"].includes(newTier)) {
      await db.tenant.update({
        where: { id: tenantId },
        data: { planTier: newTier },
      });

      await auditLog({
        tenantId,
        userId: session.user.id,
        action: "BILLING_STATE_CHANGED",
        entity: "Tenant",
        entityId: tenantId,
        summary: { event: "superadmin_force_tier", newTier },
      });
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">{tenant.name} — Billing</h1>
        <p className="text-gray-600 mt-2">SuperAdmin override console</p>
      </div>

      {/* Current Status */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold mb-4">Current Status</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Plan Tier</p>
            <p className="text-lg font-semibold">{tenant.planTier}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Billing State</p>
            <p className="text-lg font-semibold">{state}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Subscription Status</p>
            <p className="text-sm font-mono">{tenant.subscriptionStatus || "—"}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Currency</p>
            <p className="text-sm font-mono">{tenant.billingCurrency}</p>
          </div>
          <div className="col-span-2">
            <p className="text-sm text-gray-600">Current Period End</p>
            <p className="text-sm font-mono">
              {tenant.currentPeriodEnd
                ? new Date(tenant.currentPeriodEnd).toISOString().split("T")[0]
                : "—"}
            </p>
          </div>
          {tenant.graceUntil && (
            <div className="col-span-2">
              <p className="text-sm text-gray-600">Grace Until</p>
              <p className="text-sm font-mono bg-yellow-50 p-2 rounded">
                {new Date(tenant.graceUntil).toISOString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stripe Integration */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold mb-4">Stripe Integration</h2>
        <div className="space-y-3 font-mono text-sm">
          <div>
            <p className="text-gray-600">Customer ID</p>
            <p className="bg-gray-100 p-2 rounded break-all">
              {tenant.stripeCustomerId || "—"}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Subscription ID</p>
            <p className="bg-gray-100 p-2 rounded break-all">
              {tenant.stripeSubscriptionId || "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Force Tier Override */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold mb-4">Force Tier (Override)</h2>
        <p className="text-sm text-gray-600 mb-4">
          This bypasses Stripe and sets the plan tier directly. Use only for testing or
          compensation.
        </p>
        <div className="flex gap-2">
          {(["FREE", "PRO", "CLINIC"] as const).map((tier) => (
            <a
              key={tier}
              href={`/sa/tenants/${tenantId}/billing?action=force-tier&tier=${tier}`}
              className={`px-4 py-2 rounded font-semibold transition ${
                tenant.planTier === tier
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
            >
              Force {tier}
            </a>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Prefer using the Ops panel on the tenant detail page — it uses the
          audited <code>/api/v1/sa/tenants/[id]/plan-override</code> route.
        </p>
      </div>

      {/* Plan Details */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold mb-4">Plan Details</h2>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-600">Max Active Patients: </span>
            <span className="font-semibold">
              {plan.maxActivePatients === Infinity ? "∞" : plan.maxActivePatients}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Max Therapist Seats: </span>
            <span className="font-semibold">
              {plan.maxTherapistSeats === Infinity ? "∞" : plan.maxTherapistSeats}
            </span>
          </div>
          <div>
            <span className="text-gray-600">BRL Price: </span>
            <span className="font-semibold">
              {plan.monthlyPriceCents.BRL / 100} BRL/month
            </span>
          </div>
          <div>
            <span className="text-gray-600">USD Price: </span>
            <span className="font-semibold">
              ${plan.monthlyPriceCents.USD / 100}/month
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
