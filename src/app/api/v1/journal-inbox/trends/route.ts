import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, apiError } from "@/lib/api";
import { getAuthContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    // Get auth context and verify permissions
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");

    // Extract query parameters
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const daysParam = searchParams.get("days");

    // Validate patientId
    if (!patientId) {
      return apiError("BAD_REQUEST", "patientId is required", 400);
    }

    // Validate patientId format (UUID)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(patientId)) {
      return apiError("BAD_REQUEST", "patientId inválido", 400);
    }

    // Verify patient belongs to tenant and is assigned to this therapist
    const patient = await db.patient.findFirst({
      where: { id: patientId, tenantId: ctx.tenantId, assignedUserId: ctx.userId },
    });
    if (!patient) {
      return apiError("NOT_FOUND", "Paciente não encontrado", 404);
    }

    // Parse and validate days parameter
    let sinceDate: Date | undefined;
    if (daysParam) {
      const days = parseInt(daysParam, 10);
      const allowedValues = [7, 30, 90, 365];
      if (!allowedValues.includes(days)) {
        return apiError(
          "BAD_REQUEST",
          "days must be one of: 7, 30, 90, 365",
          400
        );
      }
      sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
    }

    // Cast db for type safety
  

    // Query journal entries with score data
    const entries = await db.journalEntry.findMany({
      where: {
        tenantId: ctx.tenantId,
        patientId,
        therapistId: ctx.userId,
        visibility: "SHARED",
        deletedAt: null,
        ...(sinceDate && { createdAt: { gte: sinceDate } }),
        OR: [
          { moodScore: { not: null } },
          { anxietyScore: { not: null } },
          { energyScore: { not: null } },
          { sleepScore: { not: null } },
        ],
      },
      select: {
        id: true,
        createdAt: true,
        moodScore: true,
        anxietyScore: true,
        energyScore: true,
        sleepScore: true,
        entryType: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 500, // Safety cap on data points
    });

    // Transform entries to response format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = entries.map((entry: any) => ({
      id: entry.id,
      date: entry.createdAt.toISOString(),
      moodScore: entry.moodScore,
      anxietyScore: entry.anxietyScore,
      energyScore: entry.energyScore,
      sleepScore: entry.sleepScore,
      entryType: entry.entryType,
    }));

    return ok(data);
  } catch (err) {
    return handleApiError(err);
  }
}
