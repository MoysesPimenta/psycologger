/**
 * Staff Mobile Bearer Token Endpoint
 * POST /api/v1/auth/mobile-token
 *
 * Requires active NextAuth staff session.
 * Returns a 30-day mobile bearer token.
 *
 * Response:
 * {
 *   "token": "<JWT>",
 *   "expiresAt": "2026-05-08T...",
 *   "tenantId": "...",
 *   "userId": "..."
 * }
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { signMobileToken } from "@/lib/bearer-auth";
import { ok, apiError, handleApiError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOBILE_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

export async function POST(req: NextRequest) {
  try {
    // Check if mobile bearer auth is enabled
    const mobileEnabled = process.env.MOBILE_BEARER_ENABLED === "true";

    // Require NextAuth session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(
        "UNAUTHORIZED",
        "Staff session required",
        401
      );
    }

    const userId = session.user.id;

    // Resolve user and tenant
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          select: { tenantId: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!user) {
      return apiError("NOT_FOUND", "User not found", 404);
    }

    const tenantId = user.memberships?.[0]?.tenantId;
    if (!tenantId) {
      return apiError("FORBIDDEN", "User has no tenant membership", 403);
    }

    // Sign token
    const token = await signMobileToken(userId, tenantId, "staff", MOBILE_TOKEN_TTL_SEC);
    const expiresAt = new Date(
      Date.now() + MOBILE_TOKEN_TTL_SEC * 1000
    ).toISOString();

    // Audit
    const { ipAddress, userAgent } = extractRequestMeta(req);
    await auditLog({
      tenantId,
      userId,
      action: "MOBILE_TOKEN_ISSUED",
      summary: {
        reason: mobileEnabled ? "mobile_auth_enabled" : "manual_request",
      },
      ipAddress,
      userAgent,
    });

    return ok({
      token,
      expiresAt,
      tenantId,
      userId,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
