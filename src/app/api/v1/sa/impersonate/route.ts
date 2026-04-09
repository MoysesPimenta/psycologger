/**
 * POST /api/v1/sa/impersonate
 * Start impersonating a user. SuperAdmin only.
 * Returns a signed JWT to set in the psycologger-impersonate cookie.
 *
 * SECURITY:
 * - SuperAdmin ONLY
 * - Cannot impersonate another superadmin
 * - Sets a 1-hour expiry cookie
 * - Audited via SA_IMPERSONATE_START action
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { signImpersonationToken, getImpersonationCookieMaxAge } from "@/lib/impersonation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // Guard: SuperAdmin only
    const superAdminId = await requireSuperAdmin();

    // Block impersonation chains: cannot start a new impersonation while
    // an existing impersonation cookie is set on this request.
    if (req.cookies.get("psycologger-impersonate")?.value) {
      return NextResponse.json(
        { error: "Stop current impersonation before starting a new one" },
        { status: 409 }
      );
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Find a membership for this user
    const membership = await db.membership.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "User has no active membership" },
        { status: 404 }
      );
    }

    // Security: cannot impersonate another superadmin
    if (membership.user.isSuperAdmin) {
      return NextResponse.json(
        { error: "Cannot impersonate another superadmin" },
        { status: 403 }
      );
    }

    // Create the impersonation token
    const token = await signImpersonationToken(
      userId,
      membership.tenantId,
      superAdminId
    );

    // Audit log
    await auditLog({
      tenantId: membership.tenantId,
      userId: superAdminId,
      action: "IMPERSONATION_START",
      entityId: userId,
      summary: {
        targetUserId: userId,
        targetTenantId: membership.tenantId,
        targetUserEmail: membership.user.email,
      },
    });

    // Create response with secure cookie
    const response = NextResponse.json({
      success: true,
      token,
    });

    response.cookies.set("psycologger-impersonate", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: getImpersonationCookieMaxAge(),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[/api/v1/sa/impersonate] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
