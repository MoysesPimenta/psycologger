/**
 * POST /api/v1/patients/[id]/portal-invite — Invite patient to the portal
 * Creates a PatientAuth record with an activation token and sends an invite email.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { created, handleApiError, apiError } from "@/lib/api";
import { getAuthContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { generateActivationToken } from "@/lib/patient-auth";
import { sendPortalInviteEmail } from "@/lib/email";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

const bodySchema = z.object({
  email: z.string().email().toLowerCase(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Verify patient belongs to this tenant
    const patient = await db.patient.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      select: { id: true, fullName: true, email: true, tenantId: true },
    });

    if (!patient) {
      return apiError("NOT_FOUND", "Paciente não encontrado.", 404);
    }

    const body = bodySchema.parse(await req.json());

    // Check if portal auth already exists
    const existing = await dbAny.patientAuth.findUnique({
      where: {
        tenantId_patientId: { tenantId: ctx.tenantId, patientId: params.id },
      } as never,
    });

    if (existing?.activatedAt) {
      return apiError("CONFLICT", "Paciente já tem conta no portal.", 409);
    }

    // Check tenant has portal enabled
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, portalEnabled: true } as never,
    }) as { name: string; portalEnabled: boolean } | null;

    if (!tenant?.portalEnabled) {
      return apiError("FORBIDDEN", "O portal do paciente não está habilitado. Ative nas configurações.", 403);
    }

    const activationToken = generateActivationToken();

    // Upsert: if an invite was already sent but not activated, replace it
    const patientAuth = await dbAny.patientAuth.upsert({
      where: {
        tenantId_patientId: { tenantId: ctx.tenantId, patientId: params.id },
      } as never,
      update: {
        email: body.email,
        activationToken,
        status: "ACTIVE",
      },
      create: {
        tenantId: ctx.tenantId,
        patientId: params.id,
        email: body.email,
        activationToken,
      },
    });

    // Send invite email
    const baseUrl = process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const activateUrl = `${baseUrl}/portal/activate/${activationToken}`;

    let emailSent = true;
    try {
      await sendPortalInviteEmail({
        to: body.email,
        activateUrl,
        patientName: patient.fullName,
        tenantName: tenant.name,
      });
    } catch (emailErr) {
      console.error("[portal-invite] Email send failed:", emailErr);
      emailSent = false;
    }

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PORTAL_ACCOUNT_ACTIVATED", // Re-using; could add PORTAL_INVITE_SENT
      entity: "PatientAuth",
      entityId: patientAuth.id,
      summary: { patientId: params.id },
      ipAddress,
      userAgent,
    });

    return created({
      id: patientAuth.id,
      email: body.email,
      emailSent,
      activateUrl: emailSent ? undefined : activateUrl, // Only expose URL if email failed
    });
  } catch (err) {
    return handleApiError(err);
  }
}
