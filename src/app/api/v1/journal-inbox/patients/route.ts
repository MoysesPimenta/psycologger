import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/api";
import { getAuthContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");

    const dbAny = db as any;

    // Get aggregated stats for all shared journal entries by patient
    const stats = await dbAny.$queryRaw`
      SELECT
        "patientId",
        COUNT(*) AS "totalShared",
        COUNT(*) FILTER (WHERE "reviewedAt" IS NULL) AS "unreadCount",
        COUNT(*) FILTER (WHERE "flaggedForSupport" = true AND "reviewedAt" IS NULL) AS "flaggedCount",
        COUNT(*) FILTER (WHERE "discussNextSession" = true AND "reviewedAt" IS NULL) AS "discussCount",
        MAX("createdAt") AS "lastEntryAt"
      FROM "JournalEntry"
      WHERE "tenantId" = ${ctx.tenantId}::uuid
        AND "therapistId" = ${ctx.userId}::uuid
        AND "visibility" = 'SHARED'
        AND "deletedAt" IS NULL
      GROUP BY "patientId"
      ORDER BY
        COUNT(*) FILTER (WHERE "flaggedForSupport" = true AND "reviewedAt" IS NULL) DESC,
        MAX("createdAt") DESC
    `;

    // Extract patient IDs
    const patientIds = stats.map((s: any) => s.patientId);

    // Fetch patient info (names)
    const patients = await dbAny.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, fullName: true, preferredName: true },
    });

    // Get latest mood score per patient
    const latestMoods = await dbAny.$queryRaw`
      SELECT DISTINCT ON ("patientId") "patientId", "moodScore"
      FROM "JournalEntry"
      WHERE "tenantId" = ${ctx.tenantId}::uuid
        AND "therapistId" = ${ctx.userId}::uuid
        AND "visibility" = 'SHARED'
        AND "deletedAt" IS NULL
        AND "moodScore" IS NOT NULL
      ORDER BY "patientId", "createdAt" DESC
    `;

    // Create lookup maps
    const patientMap = new Map<string, Record<string, unknown>>(
      patients.map((p: any) => [p.id, p]),
    );
    const moodMap = new Map<string, number>(
      latestMoods.map((m: any) => [m.patientId, m.moodScore]),
    );

    // Merge and format response
    const data = stats.map((stat: any) => {
      const patient = patientMap.get(stat.patientId);
      const latestMoodScore = moodMap.get(stat.patientId);

      return {
        patientId: stat.patientId,
        fullName: (patient?.fullName as string) || "Unknown",
        preferredName: (patient?.preferredName as string) || null,
        unreadCount: Number(stat.unreadCount),
        flaggedCount: Number(stat.flaggedCount),
        discussCount: Number(stat.discussCount),
        totalShared: Number(stat.totalShared),
        lastEntryAt: stat.lastEntryAt
          ? new Date(stat.lastEntryAt).toISOString()
          : null,
        latestMoodScore: latestMoodScore ?? null,
      };
    });

    return ok(data);
  } catch (err) {
    return handleApiError(err);
  }
}
