/**
 * GET /api/v1/reports?type=monthly&year=2026&month=3
 * GET /api/v1/reports/export?type=charges&from=...&to=...
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth } from "date-fns";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    requirePermission(ctx, "reports:view");

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "monthly";
    const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString());
    const month = parseInt(searchParams.get("month") ?? (new Date().getMonth() + 1).toString());
    const exportCsv = searchParams.get("export") === "true";

    if (type === "monthly") {
      const from = startOfMonth(new Date(year, month - 1));
      const to = endOfMonth(new Date(year, month - 1));

      const [charges, appointments] = await Promise.all([
        db.charge.findMany({
          where: {
            tenantId: ctx.tenantId,
            dueDate: { gte: from, lte: to },
            ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
          },
          include: {
            payments: true,
            provider: { select: { id: true, name: true } },
          },
        }),
        db.appointment.count({
          where: {
            tenantId: ctx.tenantId,
            startsAt: { gte: from, lte: to },
            status: "COMPLETED",
            ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
          },
        }),
      ]);

      const totalCharged = charges.reduce((s, c) => s + (c.amountCents - c.discountCents), 0);
      const totalReceived = charges
        .filter((c) => c.status === "PAID")
        .reduce((s, c) => s + c.payments.reduce((ps, p) => ps + p.amountCents, 0), 0);
      const totalPending = charges
        .filter((c) => c.status === "PENDING" || c.status === "OVERDUE")
        .reduce((s, c) => s + (c.amountCents - c.discountCents), 0);

      // Revenue by provider
      const byProvider: Record<string, { name: string; received: number; sessions: number }> = {};
      for (const charge of charges) {
        const pid = charge.providerUserId;
        if (!byProvider[pid]) {
          byProvider[pid] = { name: charge.provider.name ?? pid, received: 0, sessions: 0 };
        }
        if (charge.status === "PAID") {
          byProvider[pid].received += charge.payments.reduce((s, p) => s + p.amountCents, 0);
          byProvider[pid].sessions++;
        }
      }

      if (exportCsv) {
        const rows = [
          ["Data", "Paciente", "Profissional", "Valor", "Status", "Método de Pagamento"].join(","),
          ...charges.map((c) => [
            c.dueDate.toISOString().slice(0, 10),
            c.patientId,
            c.provider.name ?? "",
            (c.amountCents / 100).toFixed(2).replace(".", ","),
            c.status,
            c.payments[0]?.method ?? "",
          ].join(",")),
        ].join("\n");

        return new NextResponse(rows, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="relatorio-${year}-${month}.csv"`,
          },
        });
      }

      return ok({
        period: { year, month, from, to },
        summary: {
          totalCharged,
          totalReceived,
          totalPending,
          completedAppointments: appointments,
          chargesCount: charges.length,
        },
        byProvider: Object.values(byProvider),
      });
    }

    return ok({ error: "Unknown report type" });
  } catch (err) {
    return handleApiError(err);
  }
}
