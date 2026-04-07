/**
 * GET /api/v1/audit — paginated audit log
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { ok, handleApiError, parsePagination, buildMeta, BadRequestError } from "@/lib/api";
import { requirePermission, can } from "@/lib/rbac";
import { csvSafe } from "@/lib/utils";
import { AUDIT_CSV_MAX_ROWS, AUDIT_MAX_DATE_RANGE_DAYS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "audit:view");
    requireTenant(ctx);

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

    // Validate date range for exports — max 90 days to prevent memory exhaustion
    if (exportCsv && from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (fromDate > toDate) {
        throw new BadRequestError("A data inicial não pode ser posterior à data final.");
      }
      const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > AUDIT_MAX_DATE_RANGE_DAYS) {
        throw new BadRequestError(
          `Intervalo máximo para exportação: ${AUDIT_MAX_DATE_RANGE_DAYS} dias. Refine o filtro de datas.`
        );
      }
    }
    // For CSV exports, require at least a "from" date to prevent unbounded queries
    if (exportCsv && !from) {
      throw new BadRequestError("Informe uma data inicial para a exportação.");
    }

    // Build WHERE — handle combined from+to on the same field (createdAt)
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const where = {
      tenantId: ctx.tenantId,
      ...(action && { action }),
      ...(effectiveUserId && { userId: effectiveUserId }),
      ...(entity && { entity }),
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    };

    if (exportCsv) {
      requirePermission(ctx, "audit:export");
      // Cap at 50,000 rows; callers should filter by date range for large exports.
      const logs = await db.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: AUDIT_CSV_MAX_ROWS,
      });

      const rows = [
        ["Data/Hora", "Usuário", "Email", "Ação", "Entidade", "ID Entidade", "IP"].join(","),
        ...logs.map((l) => [
          l.createdAt.toISOString(),
          csvSafe(l.user?.name ?? ""),
          csvSafe(l.user?.email ?? ""),
          csvSafe(l.action),
          csvSafe(l.entity ?? ""),
          l.entityId ?? "",
          csvSafe(l.ipAddress ?? ""),
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
