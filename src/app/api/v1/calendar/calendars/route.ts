/**
 * GET  /api/v1/calendar/calendars — list available calendars
 * PATCH /api/v1/calendar/calendars — update selected calendar ID
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { ok, handleApiError, BadRequestError } from "@/lib/api";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { listCalendars, refreshTokens } from "@/lib/google-calendar";

interface GoogleTokenData {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  expires_at?: number;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requireTenant(ctx);

    const userId = ctx.userId;

    // Fetch the user's Google Calendar token
    const gcalToken = await db.googleCalendarToken.findUnique({
      where: { userId },
    });

    if (!gcalToken) {
      throw new BadRequestError("Google Calendar not connected");
    }

    // Decrypt and refresh token if needed
    let tokenData = await decryptJson<GoogleTokenData>(gcalToken.encryptedTokenJson);

    const now = Math.floor(Date.now() / 1000);
    if (tokenData.expires_at && tokenData.expires_at < now + 300) {
      if (!tokenData.refresh_token) {
        throw new Error("Token expired and no refresh token available");
      }

      try {
        const refreshed = await refreshTokens(tokenData.refresh_token);
        tokenData.access_token = refreshed.access_token;
        tokenData.expires_at = now + refreshed.expires_in;

        const reencrypted = await encryptJson(tokenData);
        await db.googleCalendarToken.update({
          where: { id: gcalToken.id },
          data: { encryptedTokenJson: reencrypted },
        });
      } catch (err) {
        console.error("[calendars] Failed to refresh token:", err);
        throw new BadRequestError("Failed to refresh Google Calendar token");
      }
    }

    // List calendars
    const calendars = await listCalendars(tokenData.access_token);

    return ok({
      calendars,
      selectedCalendarId: gcalToken.calendarId,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const updateSchema = z.object({
  calendarId: z.string().min(1),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requireTenant(ctx);

    const userId = ctx.userId;
    const body = await req.json();
    const { calendarId } = updateSchema.parse(body);

    // Fetch the user's Google Calendar token
    const gcalToken = await db.googleCalendarToken.findUnique({
      where: { userId },
    });

    if (!gcalToken) {
      throw new BadRequestError("Google Calendar not connected");
    }

    // Update the selected calendar ID
    const updated = await db.googleCalendarToken.update({
      where: { userId },
      data: { calendarId },
    });

    return ok({
      calendarId: updated.calendarId,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
