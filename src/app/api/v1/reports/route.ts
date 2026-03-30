/**
 * GET /api/v1/reports?type=monthly&year=2026&month=3
 * GET /api/v1/reports?type=dashboard&year=2026&month=3
 * GET /api/v1/reports?type=cashflow&year=2026&months=6
 * GET /api/v1/reports?type=patients|appointments|charges (CSV export)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import type { ChargeStatus } from "@prisma/client";

const PENDING_STATUSES: ChargeStatus[] = ["PENDING", "OVERDUE"];

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "reports:view");

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "monthly";
    const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString());
    const month = parseInt(searchParams.get("month") ?? (new Date().getMonth() + 1).toString());
    const exportCsv = searchParams.get("export") === "true";

    // ── Monthly / Dashboard ──────────────────────────────────────────────────

    if (type === "monthly" || type === "dashboard") {
      const from = startOfMonth(new Date(year, month - 1));
      const to = endOfMonth(new Date(year, month - 1));

      const providerFilter = ctx.role === "PSYCHOLOGIST" ? { providerUserId: ctx.userId } : {};

      const [charges, payments, appointments, allPatients] = await Promise.all([
        db.charge.findMany({
          where: {
            tenantId: ctx.tenantId,
            dueDate: { gte: from, lte: to },
            ...providerFilter,
          },
          include: {
            payments: true,
            provider: { select: { id: true, name: true, email: true } },
            patient: { select: { fullName: true } },
          },
        }),
        // Cash basis: payments received in this month (regardless of charge due date)
        db.payment.findMany({
          where: {
            tenantId: ctx.tenantId,
            paidAt: { gte: from, lte: to },
            charge: { ...providerFilter },
          },
          include: {
            charge: {
              include: {
                provider: { select: { id: true, name: true } },
              },
            },
          },
        }),
        db.appointment.findMany({
          where: {
            tenantId: ctx.tenantId,
            startsAt: { gte: from, lte: to },
            ...providerFilter,
          },
          select: {
            id: true, status: true, startsAt: true,
            provider: { select: { id: true, name: true } },
          },
        }),
        // New patients this month
        db.patient.count({
          where: {
            tenantId: ctx.tenantId,
            createdAt: { gte: from, lte: to },
          },
        }),
      ]);

      // ── Competência (accrual) — charges due this month ────────────────────
      // Exclude "Saldo restante" from totalCharged: they are accounting splits of
      // original charges, not additional billed services. Including them inflates
      // the charged figure and creates a false gap vs. payments received.
      const serviceCharges = charges.filter((c) => c.description !== "Saldo restante");
      const totalCharged = serviceCharges.reduce((s, c) => s + (c.amountCents - c.discountCents), 0);
      const totalReceived_competencia = serviceCharges
        .filter((c) => c.status === "PAID")
        .reduce((s, c) => s + c.payments.reduce((ps, p) => ps + p.amountCents, 0), 0);
      const totalPending = charges
        .filter((c) => ["PENDING", "OVERDUE"].includes(c.status))
        .reduce((s, c) => {
          const net = c.amountCents - c.discountCents;
          const paid = c.payments.reduce((ps, p) => ps + p.amountCents, 0);
          return s + (net - paid);
        }, 0);
      const totalOverdue = charges
        .filter((c) => c.status === "OVERDUE")
        .reduce((s, c) => s + (c.amountCents - c.discountCents), 0);

      // ── Caixa (cash) — payments received this month ───────────────────────
      const totalCaixa = payments.reduce((s, p) => s + p.amountCents, 0);

      // ── By provider (cash basis for received, competência for pending) ──
      const byProvider: Record<string, { name: string; received: number; sessions: number; pending: number }> = {};

      // Cash basis: sum payments received this month, grouped by provider
      for (const p of payments) {
        const pid = p.charge.provider?.id;
        if (!pid) continue;
        if (!byProvider[pid]) {
          byProvider[pid] = { name: p.charge.provider.name ?? pid, received: 0, sessions: 0, pending: 0 };
        }
        byProvider[pid].received += p.amountCents;
      }

      // Count paid sessions and pending amounts from charges due this month
      for (const charge of charges) {
        if (charge.description === "Saldo restante") continue;
        const pid = charge.providerUserId;
        if (!byProvider[pid]) {
          byProvider[pid] = { name: charge.provider.name ?? charge.provider.email ?? pid, received: 0, sessions: 0, pending: 0 };
        }
        if (charge.status === "PAID") {
          byProvider[pid].sessions++;
        } else if (["PENDING", "OVERDUE"].includes(charge.status)) {
          const net = charge.amountCents - charge.discountCents;
          const paid = charge.payments.reduce((s, p) => s + p.amountCents, 0);
          byProvider[pid].pending += net - paid;
        }
      }

      // ── Appointment stats ─────────────────────────────────────────────────
      const apptStats = {
        total: appointments.length,
        completed: appointments.filter((a) => a.status === "COMPLETED").length,
        canceled: appointments.filter((a) => a.status === "CANCELED").length,
        noShow: appointments.filter((a) => a.status === "NO_SHOW").length,
        scheduled: appointments.filter((a) => ["SCHEDULED", "CONFIRMED"].includes(a.status)).length,
      };

      // ── Payment methods breakdown ─────────────────────────────────────────
      const byMethod: Record<string, number> = {};
      for (const p of payments) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountCents;
      }

      if (exportCsv) {
        const rows = [
          ["Data", "Paciente", "Profissional", "Valor", "Status", "Método de Pagamento"].join(","),
          ...charges.map((c) => [
            c.dueDate.toISOString().slice(0, 10),
            `"${c.patient.fullName}"`,
            `"${c.provider.name ?? c.provider.email ?? ""}"`,
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
          // Competência (accrual basis)
          totalCharged,
          totalReceived_competencia,
          totalPending,
          totalOverdue,
          // Caixa (cash basis)
          totalCaixa,
          // Appointments
          completedAppointments: apptStats.completed,
          chargesCount: serviceCharges.length,
          newPatients: allPatients,
        },
        apptStats,
        byProvider: Object.values(byProvider),
        byMethod,
      });
    }

    // ── Cash flow (last N months) ────────────────────────────────────────────

    if (type === "cashflow") {
      const months = parseInt(searchParams.get("months") ?? "6");
      const providerFilter = ctx.role === "PSYCHOLOGIST" ? { providerUserId: ctx.userId } : {};

      const monthlyData = await Promise.all(
        Array.from({ length: months }, (_, i) => {
          const d = subMonths(new Date(year, month - 1), months - 1 - i);
          const from = startOfMonth(d);
          const to = endOfMonth(d);
          return Promise.all([
            // Competência — exclude "Saldo restante" splits (same rule as monthly report)
            db.charge.aggregate({
              where: {
                tenantId: ctx.tenantId,
                dueDate: { gte: from, lte: to },
                description: { not: "Saldo restante" },
                ...providerFilter,
              },
              _sum: { amountCents: true, discountCents: true },
            }),
            // Caixa
            db.payment.aggregate({
              where: {
                tenantId: ctx.tenantId,
                paidAt: { gte: from, lte: to },
                charge: { ...providerFilter },
              },
              _sum: { amountCents: true },
            }),
            // Sessions count
            db.appointment.count({
              where: {
                tenantId: ctx.tenantId,
                startsAt: { gte: from, lte: to },
                status: "COMPLETED",
                ...providerFilter,
              },
            }),
          ]).then(([chargeAgg, payAgg, sessionCount]) => ({
            month: format(d, "MMM/yy"),
            year: d.getFullYear(),
            monthNum: d.getMonth() + 1,
            competencia: (chargeAgg._sum.amountCents ?? 0) - (chargeAgg._sum.discountCents ?? 0),
            caixa: payAgg._sum.amountCents ?? 0,
            sessions: sessionCount,
          }));
        })
      );

      return ok({ cashflow: monthlyData });
    }

    // ── Previsibilidade (upcoming pending charges) ────────────────────────────

    if (type === "previsibility") {
      const providerFilter = ctx.role === "PSYCHOLOGIST" ? { providerUserId: ctx.userId } : {};
      const now = new Date();
      const futureMonths = 3;

      const upcoming = await Promise.all(
        Array.from({ length: futureMonths }, async (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() + i);
          const from = startOfMonth(d);
          const to = endOfMonth(d);
          const where = {
            tenantId: ctx.tenantId,
            dueDate: { gte: from, lte: to },
            status: { in: PENDING_STATUSES },
            ...providerFilter,
          };
          const [agg, count] = await Promise.all([
            db.charge.aggregate({ where, _sum: { amountCents: true, discountCents: true } }),
            db.charge.count({ where }),
          ]);
          const sumAmount = agg._sum?.amountCents ?? 0;
          const sumDiscount = agg._sum?.discountCents ?? 0;
          return {
            month: format(d, "MMMM yyyy"),
            monthShort: format(d, "MMM/yy"),
            expected: sumAmount - sumDiscount,
            count,
          };
        })
      );

      // Also get overdue (past months)
      const overdueWhere = {
        tenantId: ctx.tenantId,
        dueDate: { lt: startOfMonth(now) },
        status: { in: PENDING_STATUSES },
        ...providerFilter,
      };
      const [overdueAgg, overdueCount] = await Promise.all([
        db.charge.aggregate({ where: overdueWhere, _sum: { amountCents: true, discountCents: true } }),
        db.charge.count({ where: overdueWhere }),
      ]);

      return ok({
        upcoming,
        overdue: {
          total: (overdueAgg._sum?.amountCents ?? 0) - (overdueAgg._sum?.discountCents ?? 0),
          count: overdueCount,
        },
      });
    }

    // ── CSV exports ──────────────────────────────────────────────────────────

    if (type === "patients") {
      const patients = await db.patient.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        select: {
          fullName: true, preferredName: true, email: true, phone: true,
          dob: true, tags: true, consentGiven: true, createdAt: true,
        },
        orderBy: { fullName: "asc" },
      });

      const rows = [
        ["Nome completo", "Nome preferido", "Email", "Telefone", "Data de nascimento", "Tags", "Consentimento", "Cadastrado em"].join(","),
        ...patients.map((p) =>
          [
            `"${p.fullName}"`,
            `"${p.preferredName ?? ""}"`,
            p.email ?? "",
            p.phone ?? "",
            p.dob ? p.dob.toISOString().slice(0, 10) : "",
            `"${p.tags.join("; ")}"`,
            p.consentGiven ? "Sim" : "Não",
            p.createdAt.toISOString().slice(0, 10),
          ].join(",")
        ),
      ].join("\n");

      return new NextResponse(rows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="pacientes.csv"',
        },
      });
    }

    if (type === "appointments") {
      const appointments = await db.appointment.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
        },
        include: {
          patient: { select: { fullName: true } },
          provider: { select: { name: true, email: true } },
          appointmentType: { select: { name: true } },
        },
        orderBy: { startsAt: "desc" },
      });

      const rows = [
        ["Data", "Horário início", "Horário fim", "Paciente", "Profissional", "Tipo", "Status", "Local"].join(","),
        ...appointments.map((a) =>
          [
            a.startsAt.toISOString().slice(0, 10),
            a.startsAt.toISOString().slice(11, 16),
            a.endsAt.toISOString().slice(11, 16),
            `"${a.patient.fullName}"`,
            `"${a.provider.name ?? a.provider.email ?? ""}"`,
            `"${a.appointmentType.name}"`,
            a.status,
            `"${a.location ?? ""}"`,
          ].join(",")
        ),
      ].join("\n");

      return new NextResponse(rows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="consultas.csv"',
        },
      });
    }

    if (type === "charges") {
      const charges = await db.charge.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
        },
        include: {
          patient: { select: { fullName: true } },
          provider: { select: { name: true, email: true } },
          payments: { select: { amountCents: true, method: true, paidAt: true } },
        },
        orderBy: { dueDate: "desc" },
      });

      const rows = [
        ["Vencimento", "Paciente", "Profissional", "Valor (R$)", "Desconto (R$)", "Status", "Descrição", "Pago em", "Método"].join(","),
        ...charges.map((c) => {
          const payment = c.payments[0];
          return [
            c.dueDate.toISOString().slice(0, 10),
            `"${c.patient.fullName}"`,
            `"${c.provider.name ?? c.provider.email ?? ""}"`,
            (c.amountCents / 100).toFixed(2).replace(".", ","),
            (c.discountCents / 100).toFixed(2).replace(".", ","),
            c.status,
            `"${c.description ?? ""}"`,
            payment?.paidAt ? payment.paidAt.toISOString().slice(0, 10) : "",
            payment?.method ?? "",
          ].join(",");
        }),
      ].join("\n");

      return new NextResponse(rows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="cobrancas.csv"',
        },
      });
    }

    return ok({ error: "Unknown report type" });
  } catch (err) {
    return handleApiError(err);
  }
}
