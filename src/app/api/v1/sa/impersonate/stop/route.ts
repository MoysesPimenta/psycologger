/**
 * POST /api/v1/sa/impersonate/stop
 * Stop impersonating the current user and return to the dashboard.
 * SuperAdmin only.
 *
 * SECURITY:
 * - Clears the impersonation cookie server-side
 * - Audited via SA_IMPERSONATE_END action
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import { verifyImpersonationToken } from "@/lib/impersonation";
import { headers as nextHeaders } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // Guard: SuperAdmin only
    const superAdminId = await requireSuperAdmin();

    // Extract impersonation token from cookie to get the target user info
    let targetUserId: string | undefined;
    let targetTenantId: string | undefined;

    try {
      const headers = nextHeaders();
      const impersonateCookie = headers.get("cookie")?.split("; ").find(c => c.startsWith("psycologger-impersonate="));
      if (impersonateCookie) {
        const token = impersonateCookie.substring("psycologger-impersonate=".length);
        const payload = await verifyImpersonationToken(token);
        targetUserId = payload.impersonatedUserId;
        targetTenantId = payload.impersonatedTenantId;
      }
    } catch {
      // Token invalid or missing — that's okay, we'll just clear the cookie
    }

    // Audit log
    if (targetUserId && targetTenantId) {
      await auditLog({
        tenantId: targetTenantId,
        userId: superAdminId,
        action: "IMPERSONATION_END",
        entityId: targetUserId,
        summary: {
          targetUserId,
          targetTenantId,
        },
      });
    }

    // Create response redirecting to dashboard
    const response = NextResponse.json(
      { success: true },
      { status: 200 }
    );

    // Clear the impersonation cookie server-side
    response.cookies.set("psycologger-impersonate", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[/api/v1/sa/impersonate/stop] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
