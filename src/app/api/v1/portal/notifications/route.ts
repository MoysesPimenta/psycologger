/**
 * GET /api/v1/portal/notifications — Patient notifications (paginated)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, apiError, parsePagination, buildMeta } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    // Rate limit: 60 requests per minute per patient
    const rl = await rateLimit(`portal-notifications:${ctx.patientId}`, 60, 60 * 1000);
    if (!rl.allowed) {
      return apiError("TOO_MANY_REQUESTS", "Muitas solicitações. Aguarde.", 429);
    }

    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(searchParams);

    const where = {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
    };

    const [total, notifications] = await Promise.all([
      db.patientNotification.count({ where }),
      db.patientNotification.findMany({
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
