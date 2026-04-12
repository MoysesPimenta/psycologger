import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAuthContext } from "@/lib/tenant";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { BillingBanner } from "@/components/billing/billing-banner";
import ImpersonationBanner from "@/components/sa/impersonation-banner";
import { requireActiveSubscription } from "@/lib/billing/subscription-status";
import { getTenantQuotaUsage } from "@/lib/billing/limits";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { ThemeSync } from "@/components/theme-sync";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (err) {
    // If the user has no ACTIVE membership but does have SUSPENDED ones, send
    // them to the dedicated suspended-clinic page instead of the generic
    // error boundary.
    const suspended = await db.membership.findFirst({
      where: { userId: session.user.id, status: "SUSPENDED" },
      select: { id: true },
    });
    if (suspended) redirect("/suspended");
    throw err;
  }

  // Check subscription status (unless SUPERADMIN)
  let billingState: "FREE" | "ACTIVE" | "GRACE" | "BLOCKED" | null = null;
  if (!ctx.isSuperAdmin) {
    try {
      billingState = await requireActiveSubscription(ctx.tenantId, ctx.isSuperAdmin);
    } catch (err) {
      // BLOCKED — redirect to reactivate
      // Note: middleware.ts will catch this and allow /app/billing/reactivate through
      redirect("/app/billing/reactivate");
    }
  }

  // Fetch billing banner data
  let billingBanner = null;

  if (billingState === "GRACE") {
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { graceUntil: true },
    });
    if (tenant?.graceUntil) {
      const daysLeft = Math.ceil(
        (new Date(tenant.graceUntil).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      );
      billingBanner = { state: "GRACE" as const, graceDaysLeft: daysLeft };
    }
  }

  // Check for over-quota condition
  if (!billingBanner) {
    try {
      const quotaUsage = await getTenantQuotaUsage(ctx.tenantId);
      if (quotaUsage.patients.overQuota || quotaUsage.therapists.overQuota) {
        billingBanner = {
          state: "OVER_QUOTA" as const,
          quotaInfo: quotaUsage,
        };
      }
    } catch (err) {
      // If quota check fails, don't block rendering — just log it
      console.error(`[layout] Failed to check quota for tenant ${ctx.tenantId}:`, err);
    }
  }

  // Cross-device theme sync: pull the user's stored preference and let
  // the client adopt it if its cookie disagrees.
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { themePreference: true },
  });
  const serverTheme = (me?.themePreference === "light" || me?.themePreference === "dark"
    ? me.themePreference
    : "system") as "light" | "dark" | "system";

  return (
    <>
      <ThemeSync serverTheme={serverTheme} />
      <ServiceWorkerRegister />
      {ctx.impersonating && (
        <ImpersonationBanner
          impersonatedUserName={undefined} // TODO: fetch from context or pass through
          impersonatedUserEmail={undefined}
        />
      )}
      <div className={cn(
        "flex min-h-dvh bg-background",
        ctx.impersonating && "md:pt-16",
        billingBanner && "md:pt-16",
      )}>
        <AppSidebar userRole={ctx.role} />
        {/* Main content area — offset by sidebar width on md+ */}
        <main className="flex-1 md:ms-64 overflow-auto">
          {billingBanner && (
            <BillingBanner
              state={billingBanner.state}
              graceDaysLeft={billingBanner.graceDaysLeft}
              quotaInfo={billingBanner.quotaInfo}
            />
          )}
          <div className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 md:pt-8 pb-32 md:pb-8",
            billingBanner && "md:pt-24",
          )}>
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
