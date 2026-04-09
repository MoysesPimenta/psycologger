/**
 * POST /api/v1/calendar/disconnect
 * Disconnects the user's Google Calendar integration.
 */

import { NextRequest } from "next/server";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { noContent, handleApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "googleCalendar:connect");
    requireTenant(ctx);

    const userId = ctx.userId;

    // Find and delete the GoogleCalendarToken
    const gcalToken = await db.googleCalendarToken.findUnique({
      where: { userId },
    });

    if (!gcalToken) {
      // Already disconnected, return success
      return noContent();
    }

    // Delete the token
    await db.googleCalendarToken.delete({
      where: { userId },
    });

    // Clear googleCalendarEventId on all user's appointments
    // (don't delete events from Google Calendar — user may want them there)
    await db.appointment.updateMany({
      where: { providerUserId: userId },
      data: {
        googleCalendarEventId: null,
        googleCalendarSynced: false,
      },
    });

    // Audit log
    await auditLog({
      userId,
      tenantId: ctx.tenantId,
      action: "GOOGLE_CALENDAR_DISCONNECT",
      summary: {
        calendarTokenId: gcalToken.id,
      },
      ...extractRequestMeta(req),
    });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
