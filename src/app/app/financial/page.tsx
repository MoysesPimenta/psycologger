import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("pageTitle");
  return { title: t("financial") };
}

export default async function FinancialPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const t = await getTranslations("pageTitle");
  const tFinancial = await getTranslations("financial");

  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);

  const providerFilter = ctx.role === "PSYCHOLOGIST" ? { providerUserId: ctx.userId } : {};

  const [charges, receivedAgg] = await Promise.all([
    db.charge.findMany({
      where: {
        tenantId: ctx.tenantId,
        dueDate: { gte: from, lte: to },
        ...providerFilter,
      },
      include: { payments: { select: { amountCents: true } } },
    }),
    // Cash basis: all payments received this month, regardless of charge due date.
    // This correctly captures saldo restante payments whose parent charge may be
    // due in a future month.
    db.payment.aggregate({
      where: {
        tenantId: ctx.tenantId,
        paidAt: { gte: from, lte: to },
        charge: { ...providerFilter },
      },
      _sum: { amountCents: true },
    }),
  ]);

  // Exclude "Saldo restante" splits from totalCharged so the figure reflects
  // actual billed services only (not double-counted remainder carry-overs).
  const serviceCharges = charges.filter((c) => c.description !== "Saldo restante");
  const totalCharged = serviceCharges.reduce((s, c) => s + (c.amountCents - c.discountCents), 0);
  const totalReceived = receivedAgg._sum.amountCents ?? 0;
  const totalPending = charges
    .filter((c) => ["PENDING", "OVERDUE"].includes(c.status))
    .reduce((s, c) => {
      const net = c.amountCents - c.discountCents;
      const paid = c.payments.reduce((ps, p) => ps + p.amountCents, 0);
      return s + (net - paid);
    }, 0);

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h1 className="page-title">{t("financial")}</h1>
          <p className="page-subtitle">{tFinancial("currentMonth")}</p>
        </div>
        <Button asChild>
          <Link href="/app/financial/charges/new">
            <Plus className="h-4 w-4" /> {tFinancial("newCharge")}
          </Link>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="stat-card">
          <p className="text-xs font-medium text-muted-foreground">{tFinancial("totalCharged")}</p>
          <p className="text-2xl sm:text-3xl font-bold text-foreground mt-2">{formatCurrency(totalCharged)}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{serviceCharges.length} {tFinancial("chargesCount")}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-muted-foreground">{tFinancial("received")}</p>
          <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{formatCurrency(totalReceived)}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{serviceCharges.filter((c) => c.status === "PAID").length} {tFinancial("paidCount")}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-muted-foreground">{tFinancial("pending")}</p>
          <p className="text-2xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{charges.filter((c) => c.status === "PENDING" || c.status === "OVERDUE").length} {tFinancial("openCount")}</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Link href="/app/financial/charges" className="bg-card rounded-xl border border-border/50 p-4 sm:p-5 hover:shadow-sm active:bg-muted/50 transition-all flex items-center justify-between group">
          <div>
            <p className="font-semibold text-foreground">{tFinancial("chargesTitle")}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{tFinancial("chargesDesc")}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 ms-3" />
        </Link>
        <Link href="/app/reports" className="bg-card rounded-xl border border-border/50 p-4 sm:p-5 hover:shadow-sm active:bg-muted/50 transition-all flex items-center justify-between group">
          <div>
            <p className="font-semibold text-foreground">{tFinancial("reportsTitle")}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{tFinancial("reportsDesc")}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 ms-3" />
        </Link>
      </div>
    </div>
  );
}
