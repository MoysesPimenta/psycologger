/**
 * GET  /api/v1/portal/consents — Consent history
 * POST /api/v1/portal/consents — Accept or revoke consent
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, created, handleApiError } from "@/lib/api";
import { getPatientContext } from "@/lib/patient-auth";
import { auditLog, extractRequestMeta } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

const consentSchema = z.object({
  consentType: z.enum(["TERMS_OF_USE", "PRIVACY_POLICY", "DATA_SHARING", "JOURNAL_SHARING"]),
  version: z.string().min(1).max(20),
  action: z.enum(["accept", "revoke"]),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    const records = await dbAny.consentRecord.findMany({
      where: {
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
      },
      orderBy: { acceptedAt: "desc" as const },
    });

    return ok(records);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);
    const { ipAddress, userAgent } = extractRequestMeta(req);
    const body = consentSchema.parse(await req.json());

    if (body.action === "accept") {
      const record = await dbAny.consentRecord.create({
        data: {
          tenantId: ctx.tenantId,
          patientId: ctx.patientId,
          consentType: body.consentType,
          version: body.version,
          acceptedAt: new Date(),
          ipAddress,
          userAgent,
        },
      });

      await auditLog({
        tenantId: ctx.tenantId,
        action: "PORTAL_CONSENT_ACCEPT",
        entity: "ConsentRecord",
        entityId: record.id,
        summary: { consentType: body.consentType, version: body.version },
        ipAddress,
        userAgent,
      });

      return created(record);
    }

    // Revoke: find the latest active consent of this type and mark as revoked
    const existing = await dbAny.consentRecord.findFirst({
      where: {
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
        consentType: body.consentType,
        revokedAt: null,
      },
      orderBy: { acceptedAt: "desc" as const },
    });

    if (existing) {
      await dbAny.consentRecord.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });

      await auditLog({
        tenantId: ctx.tenantId,
        action: "PORTAL_CONSENT_REVOKE",
        entity: "ConsentRecord",
        entityId: existing.id,
        summary: { consentType: body.consentType, version: body.version },
        ipAddress,
        userAgent,
      });
    }

    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
