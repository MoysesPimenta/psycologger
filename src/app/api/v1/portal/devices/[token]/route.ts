/**
 * DELETE /api/v1/portal/devices/:token
 *
 * Patient portal version of device token revocation.
 * Patient-authenticated only.
 *
 * Response:
 *   204 No Content
 */

import { NextRequest, NextResponse } from "next/server";
import { getPatientContext } from "@/lib/patient-auth";
import { revokeDeviceToken } from "@/lib/push";
import { handleApiError, noContent, apiError } from "@/lib/api";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const patientCtx = await getPatientContext(req);
    if (!patientCtx) {
      return apiError("UNAUTHORIZED", "Patient session required", 401);
    }

    const { token } = params;

    await revokeDeviceToken({ token });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
