/**
 * GET /api/v1/calendar/auth
 * Returns the OAuth2 authorization URL for Google Calendar.
 * The client will redirect the user to this URL to grant access.
 */

import { NextRequest } from "next/server";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { ok, handleApiError } from "@/lib/api";
import { generateAuthUrl } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "googleCalendar:connect");
    requireTenant(ctx);

    const authUrl = generateAuthUrl();

    return ok({ authUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
