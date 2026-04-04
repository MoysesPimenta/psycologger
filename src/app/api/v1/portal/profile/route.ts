/**
 * GET   /api/v1/portal/profile — Get patient profile + preferences
 * PATCH /api/v1/portal/profile — Update preferences
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";
import { auditLog, extractRequestMeta } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const updateSchema = z.object({
  notifySessionReminder: z.boolean().optional(),
  notifyPaymentReminder: z.boolean().optional(),
  notifyPreSessionPrompt: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(72).optional(),
  defaultJournalVisibility: z.enum(["PRIVATE", "SHARED", "DRAFT"]).optional(),
  timezone: z.string().max(50).optional(),
  emergencyContactName: z.string().max(100).nullable().optional(),
  emergencyContactPhone: z.string().max(20).nullable().optional(),
  emergencyContactRelation: z.string().max(50).nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    const [patient, preference] = await Promise.all([
      db.patient.findFirst({
        where: { id: ctx.patientId, tenantId: ctx.tenantId },
        select: {
          id: true,
          fullName: true,
          preferredName: true,
          email: true,
          phone: true,
          dob: true,
        },
      }),
      db.patientPreference.findUnique({
        where: { patientId: ctx.patientId } as never,
      }),
    ]);

    return ok({
      patient,
      preferences: preference ?? null,
      portalFlags: {
        paymentsVisible: ctx.tenant.portalPaymentsVisible,
        journalEnabled: ctx.tenant.portalJournalEnabled,
        rescheduleEnabled: ctx.tenant.portalRescheduleEnabled,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);
    const { ipAddress, userAgent } = extractRequestMeta(req);
    const body = updateSchema.parse(await req.json());

    // Upsert preference
    const preference = await db.patientPreference.upsert({
      where: { patientId: ctx.patientId } as never,
      update: body,
      create: {
        patientId: ctx.patientId,
        tenantId: ctx.tenantId,
        ...body,
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "PORTAL_PROFILE_UPDATE",
      entity: "PatientPreference",
      entityId: preference.id,
      summary: { fields: Object.keys(body) },
      ipAddress,
      userAgent,
    });

    return ok(preference);
  } catch (err) {
    return handleApiError(err);
  }
}
