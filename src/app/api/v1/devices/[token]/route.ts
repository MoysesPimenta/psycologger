/**
 * DELETE /api/v1/devices/:token
 *
 * Staff-authenticated endpoint for revoking a device token.
 * Performs a soft-delete (revokedAt timestamp) so we can audit.
 *
 * Response:
 *   {
 *     revoked: true
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revokeDeviceToken } from "@/lib/push";
import { handleApiError, noContent, apiError } from "@/lib/api";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("UNAUTHORIZED", "Staff session required", 401);

    const { token } = params;

    await revokeDeviceToken({ token });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
