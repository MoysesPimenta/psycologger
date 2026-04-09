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
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { revokeDeviceToken } from "@/lib/push";
import { handleApiError, noContent, apiError } from "@/lib/api";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const userId = await requireUser(req);
    const membership = await db.membership.findFirst({
      where: { userId },
    });
    if (!membership) return apiError("UNAUTHORIZED", "User not found", 401);

    const { token } = params;

    await revokeDeviceToken({ token });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
