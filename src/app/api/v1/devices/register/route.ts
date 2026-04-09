/**
 * POST /api/v1/devices/register
 *
 * Staff-authenticated endpoint for registering device tokens for push notifications.
 * Mobile clients call this after obtaining a token from APNs/FCM.
 *
 * Request body:
 *   {
 *     platform: "IOS" | "ANDROID" | "WEB",
 *     token: string,
 *     pushProvider: "APNS" | "FCM" | "WEBPUSH",
 *     appVersion?: string,
 *     locale?: string
 *   }
 *
 * Response:
 *   {
 *     deviceId: string (UUID),
 *     registered: true
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { registerDeviceToken } from "@/lib/push";
import { handleApiError, created, apiError } from "@/lib/api";

const schema = z.object({
  platform: z.enum(["IOS", "ANDROID", "WEB"]),
  token: z.string().min(1),
  pushProvider: z.enum(["APNS", "FCM", "WEBPUSH"]),
  appVersion: z.string().optional(),
  locale: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    const membership = await db.membership.findFirst({
      where: { userId },
    });
    if (!membership) return apiError("UNAUTHORIZED", "User not found", 401);

    const body = await req.json();
    const { platform, token, pushProvider, appVersion, locale } =
      schema.parse(body);

    const deviceId = await registerDeviceToken({
      kind: "staff",
      actorId: userId,
      tenantId: membership.tenantId,
      platform: platform as "IOS" | "ANDROID" | "WEB",
      token,
      pushProvider: pushProvider as "APNS" | "FCM" | "WEBPUSH",
      appVersion,
      locale,
    });

    return created({
      deviceId,
      registered: true,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
