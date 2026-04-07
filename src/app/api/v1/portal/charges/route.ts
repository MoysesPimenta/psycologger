/**
 * GET /api/v1/portal/charges — Patient's payment history (paginated)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ok, handleApiError, parsePagination, buildMeta } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    if (!ctx.tenant.portalPaymentsVisible) {
      return ok([]);
    }

    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(searchParams);
    const tab = searchParams.get("tab") ?? "all"; // "pending" | "paid" | "all"

    const where: Prisma.ChargeWhereInput = {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      ...(tab === "pending"
        ? { status: { in: ["PENDING", "OVERDUE"] } }
        : tab === "paid"
          ? { status: "PAID" }
          : {}),
    };

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

    // Audit charges view
    await auditLog({
      tenantId: ctx.tenantId,
      action: "PORTAL_CHARGES_VIEW",
      entity: "Charge",
      summary: { tab, page, pageSize, total },
      ipAddress,
      userAgent,
    });

    return ok(charges, buildMeta(total, { page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}
