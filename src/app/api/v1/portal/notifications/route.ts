/**
 * GET /api/v1/portal/notifications — Patient notifications (paginated)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, parsePagination, buildMeta } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);
    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(searchParams);

    const where = {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
    };

    const [total, notifications] = await Promise.all([
      dbAny.patientNotification.count({ where }),
      dbAny.patientNotification.findMany({
        where,
        orderBy: { createdAt: "desc" as const },
        skip,
        take: pageSize,
      }),
    ]);

    return ok(notifications, buildMeta(total, { page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}
