/**
 * POST /api/v1/patients/[id]/portal-invite — Invite patient to the portal
 * Creates a PatientAuth record with an activation token and sends an invite email.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { created, handleApiError, apiError } from "@/lib/api";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { generateActivationToken } from "@/lib/patient-auth";
import { createHash } from "crypto";
import { sendPortalInviteEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { PORTAL_INVITE_RATE_LIMIT, PORTAL_INVITE_RATE_LIMIT_WINDOW_MS } from "@/lib/constants";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    requireTenant(ctx);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Verify patient belongs to this tenant
    const patient = await db.patient.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      select: { id: true, fullName: true, email: true, tenantId: true },
    });

    if (!patient) {
      return apiError("NOT_FOUND", "Paciente não encontrado.", 404);
    }

    // Rate limit: prevent invite spam per patient
    const rl = await rateLimit(
      `portal-invite:${ctx.tenantId}:${params.id}`,
      PORTAL_INVITE_RATE_LIMIT,
      PORTAL_INVITE_RATE_LIMIT_WINDOW_MS,
    );
    if (!rl.allowed) {
      return apiError("TOO_MANY_REQUESTS", "Muitos convites enviados. Tente novamente mais tarde.", 429);
    }

    const body = bodySchema.parse(await req.json());

    // Check tenant has portal enabled
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, portalEnabled: true },
    });

    if (!tenant?.portalEnabled) {
      return apiError("FORBIDDEN", "O portal do paciente não está habilitado. Ative nas configurações.", 403);
    }

    // Check if portal auth already exists
    const existing = await db.patientAuth.findUnique({
      where: { patientId: params.id },
    });

    // If patient already activated AND email hasn't changed, no need to re-invite
    if (existing?.activatedAt && existing.email === body.email) {
      return apiError("CONFLICT", "Paciente já tem conta no portal com este email.", 409);
    }

    // If patient already activated but email changed, update email and send new magic link
    if (existing?.activatedAt && existing.email !== body.email) {
      await db.patientAuth.update({
        where: { id: existing.id },
        data: { email: body.email, emailVerified: false, emailVerifiedAt: null },
      });

      // Send a magic link to the new email so they can verify it
      const { randomBytes } = await import("crypto");
      const magicToken = randomBytes(32).toString("base64url");
      // Plaintext goes to the patient via email; DB stores SHA-256 hash so a
      // read-only DB compromise can't be used to log in.
      const magicTokenHash = createHash("sha256").update(magicToken).digest("hex");
      const magicTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

      await db.patientAuth.update({
        where: { id: existing.id },
        data: { magicToken: magicTokenHash, magicTokenExpiresAt },
      });

      const baseUrl = process.env.NEXTAUTH_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const magicUrl = `${baseUrl}/portal/magic-login/${magicToken}`;

      let emailSent = true;
      try {
        const { sendPortalMagicLinkEmail } = await import("@/lib/email");
        await sendPortalMagicLinkEmail({
          to: body.email,
          magicUrl,
          patientName: patient.fullName,
          tenantName: tenant.name,
        });
      } catch (emailErr) {
        logger.error("portal-invite", "Magic link email failed", { err: emailErr });
        emailSent = false;
      }

      await auditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "PORTAL_EMAIL_UPDATED",
        entity: "PatientAuth",
        entityId: existing.id,
        summary: { patientId: params.id, oldEmail: existing.email, newEmail: body.email },
        ipAddress,
        userAgent,
      });

      return created({
        id: existing.id,
        email: body.email,
        emailSent,
        emailUpdated: true,
      });
    }

    const activationToken = generateActivationToken();
    // Store only the SHA-256 hash; the plaintext is delivered via email.
    const activationTokenHash = createHash("sha256").update(activationToken).digest("hex");

    // Upsert: if an invite was already sent but not activated, replace it
    const patientAuth = await db.patientAuth.upsert({
      where: { patientId: params.id },
      update: {
        email: body.email,
        activationToken: activationTokenHash,
        status: "ACTIVE",
      },
      create: {
        tenantId: ctx.tenantId,
        patientId: params.id,
        email: body.email,
        activationToken: activationTokenHash,
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
