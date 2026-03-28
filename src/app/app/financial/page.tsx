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

export const metadata = { title: "Financeiro" };

export default async function FinancialPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);

  const charges = await db.charge.findMany({
    where: {
      tenantId: ctx.tenantId,
      dueDate: { gte: from, lte: to },
      ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
    },
    include: { payments: { select: { amountCents: true } } },
  });

  const totalCharged = charges.reduce((s, c) => s + (c.amountCents - c.discountCents), 0);
  const totalReceived = charges
    .filter((c) => c.status === "PAID")
    .reduce((s, c) => s + c.payments.reduce((ps, p) => ps + p.amountCents, 0), 0);
  const totalPending = charges
    .filter((c) => ["PENDING", "OVERDUE"].includes(c.status))
    .reduce((s, c) => s + (c.amountCents - c.discountCents), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-1">Mês atual</p>
        </div>
        <Button asChild>
          <Link href="/app/financial/charges/new">
            <Plus className="h-4 w-4" /> Nova cobrança
          </Link>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs font-medium text-gray-500">Total cobrado</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(totalCharged)}</p>
          <p className="text-xs text-gray-400 mt-1">{charges.length} cobranças</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs font-medium text-gray-500">Recebido</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{formatCurrency(totalReceived)}</p>
          <p className="text-xs text-gray-400 mt-1">{charges.filter((c) => c.status === "PAID").length} pagas</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs font-medium text-gray-500">Pendente</p>
          <p className="text-3xl font-bold text-yellow-600 mt-2">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-gray-400 mt-1">{charges.filter((c) => c.status === "PENDING" || c.status === "OVERDUE").length} em aberto</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/app/financial/charges" className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow flex items-center justify-between group">
          <div>
            <p className="font-semibold text-gray-900">Cobranças</p>
            <p className="text-sm text-gray-500 mt-0.5">Gerencie cobranças e pagamentos</p>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600" />
        </Link>
        <Link href="/app/reports" className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow flex items-center justify-between group">
          <div>
            <p className="font-semibold text-gray-900">Relatórios</p>
            <p className="text-sm text-gray-500 mt-0.5">Exportar e analisar dados</p>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600" />
        </Link>
      </div>
    </div>
  );
}
