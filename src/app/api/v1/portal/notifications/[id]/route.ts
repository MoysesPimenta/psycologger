/**
 * PATCH /api/v1/portal/notifications/[id] — Mark notification as read
 */

import { NextRequest } from "next/server";
import { ok, handleApiError, apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getPatientContext } from "@/lib/patient-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getPatientContext(req);

    const notif = await db.patientNotification.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
      },
    });

    if (!notif) {
      return apiError("NOT_FOUND", "Notificação não encontrada.", 404);
    }

    if (!notif.readAt) {
      await db.patientNotification.update({
        where: { id: params.id },
        data: { readAt: new Date() },
      });
    }

    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
