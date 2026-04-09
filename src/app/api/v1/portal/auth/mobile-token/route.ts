/**
 * Patient Mobile Bearer Token Endpoint
 * POST /api/v1/portal/auth/mobile-token
 *
 * Requires active patient portal session cookie.
 * Returns a 30-day mobile bearer token for the patient.
 *
 * Response:
 * {
 *   "token": "<JWT>",
 *   "expiresAt": "2026-05-08T...",
 *   "tenantId": "...",
 *   "patientAuthId": "..."
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { signMobileToken } from "@/lib/bearer-auth";
import { ok, apiError, handleApiError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { getPatientContext } from "@/lib/patient-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOBILE_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

export async function POST(req: NextRequest) {
  try {
    // Require patient portal session
    let patientContext;
    try {
      patientContext = await getPatientContext(req);
    } catch {
      return apiError(
        "UNAUTHORIZED",
        "Patient portal session required",
        401
      );
    }

    if (!patientContext) {
      return apiError(
        "UNAUTHORIZED",
        "Patient portal session required",
        401
      );
    }

    // Sign token with patientAuthId as userId (it's the auth identity)
    const token = await signMobileToken(
      patientContext.patientAuthId,
      patientContext.tenantId,
      "patient",
      MOBILE_TOKEN_TTL_SEC
    );

    const expiresAt = new Date(
      Date.now() + MOBILE_TOKEN_TTL_SEC * 1000
    ).toISOString();

    // Audit
    const { ipAddress, userAgent } = extractRequestMeta(req);
    await auditLog({
      tenantId: patientContext.tenantId,
      userId: patientContext.patientAuthId,
      action: "PORTAL_MOBILE_TOKEN_ISSUED",
      summary: {},
      ipAddress,
      userAgent,
    });

    const response = NextResponse.json(
      {
        token,
        expiresAt,
        tenantId: patientContext.tenantId,
        patientAuthId: patientContext.patientAuthId,
      },
      { status: 200 }
    );

    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
