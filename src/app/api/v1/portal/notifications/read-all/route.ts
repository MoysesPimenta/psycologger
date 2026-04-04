/**
 * POST /api/v1/portal/notifications/read-all — Mark all notifications as read
 */

import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getPatientContext } from "@/lib/patient-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

export async function POST(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    const result = await db.patientNotification.updateMany({
      where: {
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return ok({ marked: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
