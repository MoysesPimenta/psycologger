/**
 * GET /api/v1/calendar/callback
 * OAuth2 callback from Google. Exchanges the authorization code for tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/tenant";
import { handleApiError, BadRequestError } from "@/lib/api";
import { exchangeCode } from "@/lib/google-calendar";
import { encryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // User denied access
    if (error) {
      console.warn("[calendar] User denied Google Calendar access:", error);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/app/settings?tab=integrations&gcal=denied`
      );
    }

    if (!code) {
      throw new BadRequestError("Missing authorization code");
    }

    // Get the authenticated user
    const ctx = await getAuthContext(req);
    const userId = ctx.userId;

    // Exchange the code for tokens
    const tokenResponse = await exchangeCode(code);

    // Prepare the token data with expiry timestamp
    const now = Math.floor(Date.now() / 1000);
    const tokenData = {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || null,
      expires_in: tokenResponse.expires_in,
      token_type: tokenResponse.token_type,
      scope: tokenResponse.scope,
      expires_at: now + tokenResponse.expires_in,
    };

    // Encrypt the tokens
    const encryptedTokenJson = await encryptJson(tokenData);

    // Upsert the GoogleCalendarToken record
    const gcalToken = await db.googleCalendarToken.upsert({
      where: { userId },
      update: {
        encryptedTokenJson,
        syncEnabled: true,
        updatedAt: new Date(),
      },
      create: {
        userId,
        encryptedTokenJson,
        syncEnabled: true,
      },
    });

    // Audit log
    await auditLog({
      userId,
      tenantId: ctx.tenantId,
      action: "GOOGLE_CALENDAR_CONNECT",
      summary: {
        calendarTokenId: gcalToken.id,
        scope: tokenResponse.scope,
      },
      ...extractRequestMeta(req),
    });

    // Redirect to settings with success indicator
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/app/settings?tab=integrations&gcal=connected`
    );
  } catch (err) {
    console.error("[calendar] Callback error:", err);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/app/settings?tab=integrations&gcal=error`
    );
  }
}
