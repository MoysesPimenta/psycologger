/**
 * GET /api/v1/integrations  — list integration statuses for the tenant (no secrets)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:view");

    const integrations = await db.integrationCredential.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        type: true,
        status: true,
        providerName: true,
        createdAt: true,
        updatedAt: true,
        // Never expose encryptedJson
      },
    });

    return ok(integrations);
  } catch (err) {
    return handleApiError(err);
  }
}
