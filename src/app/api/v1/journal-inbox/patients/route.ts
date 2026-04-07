import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/api";
import { getAuthContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");

  

    // Get aggregated stats for all shared journal entries by patient
    // NOTE: $queryRaw with tagged template literals (backticks) is safe — Prisma parameterizes
    // the query automatically. Parameters like ctx.tenantId and ctx.userId are safely escaped.
    interface PatientStats {
      patientId: string;
      totalShared: bigint;
      unreadCount: bigint;
      flaggedCount: bigint;
      discussCount: bigint;
      lastEntryAt: Date | null;
    }

    interface LatestMood {
      patientId: string;
      moodScore: number;
    }

    const stats = await db.$queryRaw<PatientStats[]>`
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
    const patientIds = stats.map((s) => s.patientId);

    // Fetch patient info (names)
    const patients = await db.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, fullName: true, preferredName: true },
    });

    // Get latest mood score per patient
    // NOTE: $queryRaw with tagged template literals (backticks) is safe — Prisma parameterizes
    // the query automatically. Parameters like ctx.tenantId and ctx.userId are safely escaped.
    const latestMoods = await db.$queryRaw<LatestMood[]>`
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
      patients.map((p) => [p.id, p]),
    );
    const moodMap = new Map<string, number>(
      latestMoods.map((m) => [m.patientId, m.moodScore]),
    );

    // Merge and format response
    const data = stats.map((stat) => {
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
