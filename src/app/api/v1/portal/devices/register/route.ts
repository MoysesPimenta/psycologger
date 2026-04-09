/**
 * POST /api/v1/portal/devices/register
 *
 * Patient-portal version of device registration.
 * Patient-authenticated; tokens inferred from PatientAuth session.
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
import { getPatientContext } from "@/lib/patient-auth";
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
    const patientCtx = await getPatientContext(req);
    if (!patientCtx) {
      return apiError("UNAUTHORIZED", "Patient session required", 401);
    }

    const body = await req.json();
    const { platform, token, pushProvider, appVersion, locale } =
      schema.parse(body);

    const deviceId = await registerDeviceToken({
      kind: "patient",
      actorId: patientCtx.patientId,
      tenantId: patientCtx.tenantId,
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
