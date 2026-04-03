/**
 * GET /api/v1/portal/charges — Patient's payment history (paginated)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, parsePagination, buildMeta } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    if (!ctx.tenant.portalPaymentsVisible) {
      return ok([]);
    }

    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(searchParams);
    const tab = searchParams.get("tab") ?? "all"; // "pending" | "paid" | "all"

    const statusFilter =
      tab === "pending"
        ? { in: ["PENDING", "OVERDUE"] }
        : tab === "paid"
          ? { equals: "PAID" }
          : undefined;

    const where = {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      ...(statusFilter ? { status: statusFilter } : {}),
    } as never;

    const [total, charges] = await Promise.all([
      db.charge.count({ where }),
      db.charge.findMany({
        where,
        select: {
          id: true,
          amountCents: true,
          discountCents: true,
          currency: true,
          dueDate: true,
          status: true,
          description: true,
          createdAt: true,
          payments: {
            select: {
              id: true,
              amountCents: true,
              method: true,
              paidAt: true,
            },
          },
        },
        orderBy: { dueDate: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return ok(charges, buildMeta(total, { page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}
