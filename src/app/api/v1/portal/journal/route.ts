/**
 * GET  /api/v1/portal/journal — Patient's journal entries (paginated)
 * POST /api/v1/portal/journal — Create journal entry
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, created, handleApiError, apiError } from "@/lib/api";
import { parsePagination, buildMeta } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";
import { containsCrisisKeywords } from "@/lib/safety";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { PORTAL_JOURNAL_RATE_LIMIT, PORTAL_JOURNAL_RATE_LIMIT_WINDOW_MS } from "@/lib/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const createSchema = z.object({
  entryType: z.enum([
    "MOOD_CHECKIN",
    "REFLECTION",
    "SESSION_PREP",
    "QUESTION",
    "IMPORTANT_EVENT",
    "GRATITUDE",
  ]),
  visibility: z.enum(["PRIVATE", "SHARED", "DRAFT"]).default("PRIVATE"),
  moodScore: z.number().int().min(1).max(10).nullable().optional(),
  anxietyScore: z.number().int().min(1).max(10).nullable().optional(),
  energyScore: z.number().int().min(1).max(10).nullable().optional(),
  sleepScore: z.number().int().min(1).max(10).nullable().optional(),
  emotionTags: z.array(z.string().max(50)).max(10).default([]),
  noteText: z.string().max(5000).nullable().optional(),
  discussNextSession: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    if (!ctx.tenant.portalJournalEnabled) {
      return ok([]);
    }

    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(searchParams);

    const where = {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      deletedAt: null,
    };

    const [total, entries] = await Promise.all([
      db.journalEntry.count({ where }),
      db.journalEntry.findMany({
        where,
        select: {
          id: true,
          entryType: true,
          visibility: true,
          moodScore: true,
          anxietyScore: true,
          energyScore: true,
          sleepScore: true,
          emotionTags: true,
          // noteText excluded — it's encrypted at rest and decrypting many
          // entries is expensive. Use GET /journal/[id] for full decrypted text.
          discussNextSession: true,
          flaggedForSupport: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" as const },
        skip,
        take: pageSize,
      }),
    ]);

    return ok(entries, buildMeta(total, { page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    if (!ctx.tenant.portalJournalEnabled) {
      return apiError("FORBIDDEN", "Diário não está habilitado.", 403);
    }

    // Rate limit journal creation per patient
    const rl = await rateLimit(
      `portal-journal:${ctx.patientId}`,
      PORTAL_JOURNAL_RATE_LIMIT,
      PORTAL_JOURNAL_RATE_LIMIT_WINDOW_MS,
    );
    if (!rl.allowed) {
      return apiError("TOO_MANY_REQUESTS", "Limite de entradas atingido. Aguarde um pouco.", 429);
    }

    const body = createSchema.parse(await req.json());

    // Get assigned therapist for this patient
    const patient = await db.patient.findFirst({
      where: { id: ctx.patientId, tenantId: ctx.tenantId },
      select: { assignedUserId: true },
    });

    // Safety check
    const flaggedForSupport = body.noteText
      ? containsCrisisKeywords(body.noteText)
      : false;

    // Encrypt noteText at rest
    const encryptedNote = body.noteText ? await encrypt(body.noteText) : null;

    const entry = await db.journalEntry.create({
      data: {
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
        therapistId: patient?.assignedUserId ?? null,
        entryType: body.entryType,
        visibility: body.visibility,
        moodScore: body.moodScore ?? null,
        anxietyScore: body.anxietyScore ?? null,
        energyScore: body.energyScore ?? null,
        sleepScore: body.sleepScore ?? null,
        emotionTags: body.emotionTags,
        noteText: encryptedNote,
        discussNextSession: body.discussNextSession,
        flaggedForSupport,
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "PORTAL_JOURNAL_CREATE",
      entity: "JournalEntry",
      entityId: entry.id,
      summary: {
        entryType: body.entryType,
        visibility: body.visibility,
        flaggedForSupport,
      },
      ipAddress,
      userAgent,
    });

    if (flaggedForSupport) {
      await auditLog({
        tenantId: ctx.tenantId,
        action: "PORTAL_JOURNAL_FLAGGED",
        entity: "JournalEntry",
        entityId: entry.id,
        summary: { reason: "crisis_keywords" },
        ipAddress,
        userAgent,
      });
    }

    return created({
      id: entry.id,
      flaggedForSupport,
      crisisResources: flaggedForSupport
        ? {
            phone: ctx.tenant.portalSafetyCrisisPhone ?? "188",
            text:
              ctx.tenant.portalSafetyText ??
              "Você não está sozinho(a). Se precisar de apoio imediato, ligue 188 (CVV).",
          }
        : undefined,
    });
  } catch (err) {
    console.error("[portal-journal] POST failed:", {
      name: (err as Error)?.name,
      message: (err as Error)?.message,
      stack: (err as Error)?.stack?.slice(0, 500),
    });
    return handleApiError(err);
  }
}
