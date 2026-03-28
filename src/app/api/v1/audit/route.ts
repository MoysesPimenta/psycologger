/**
 * GET /api/v1/audit — paginated audit log
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError, parsePagination, buildMeta } from "@/lib/api";
import { requirePermission, can } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "audit:view");

    const { searchParams } = new URL(req.url);
    const pagination = parsePagination(searchParams);
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const entity = searchParams.get("entity");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const exportCsv = searchParams.get("export") === "true";

    // PSY and ASST only see their own logs
    const canSeeAll = can(ctx, "audit:export"); // TA and SA
    const effectiveUserId = canSeeAll ? userId : ctx.userId;

    const where = {
      tenantId: ctx.tenantId,
      ...(action && { action }),
      ...(effectiveUserId && { userId: effectiveUserId }),
      ...(entity && { entity }),
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to && { createdAt: { lte: new Date(to) } }),
    };

    if (exportCsv) {
      requirePermission(ctx, "audit:export");
      const logs = await db.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 10000,
      });

      const rows = [
        ["Data/Hora", "Usuário", "Email", "Ação", "Entidade", "ID Entidade", "IP"].join(","),
        ...logs.map((l) => [
          l.createdAt.toISOString(),
          l.user?.name ?? "",
          l.user?.email ?? "",
          l.action,
          l.entity ?? "",
          l.entityId ?? "",
          l.ipAddress ?? "",
        ].join(",")),
      ].join("\n");

      return new NextResponse(rows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="auditoria.csv"`,
        },
      });
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      db.auditLog.count({ where }),
    ]);

    return ok(logs, buildMeta(total, pagination));
  } catch (err) {
    return handleApiError(err);
  }
}
