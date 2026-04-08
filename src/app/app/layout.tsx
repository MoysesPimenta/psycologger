import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAuthContext } from "@/lib/tenant";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { BillingBanner } from "@/components/billing/billing-banner";
import ImpersonationBanner from "@/components/sa/impersonation-banner";
import { requireActiveSubscription } from "@/lib/billing/subscription-status";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext();

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
  let graceBanner = null;
  if (billingState === "GRACE") {
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { graceUntil: true },
    });
    if (tenant?.graceUntil) {
      const daysLeft = Math.ceil(
        (new Date(tenant.graceUntil).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      );
      graceBanner = { state: "GRACE" as const, graceDaysLeft: daysLeft };
    }
  }

  return (
    <>
      <ServiceWorkerRegister />
      {ctx.impersonating && (
        <ImpersonationBanner
          impersonatedUserName={undefined} // TODO: fetch from context or pass through
          impersonatedUserEmail={undefined}
        />
      )}
      {graceBanner && <BillingBanner state={graceBanner.state} graceDaysLeft={graceBanner.graceDaysLeft} />}
      <div className={`flex h-screen bg-gray-50 ${ctx.impersonating ? "pt-16" : ""}`}>
        <AppSidebar />
        {/* Main content area — offset by sidebar width on md+ */}
        <main className="flex-1 md:ml-64 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-8 pb-28 md:pb-8">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
