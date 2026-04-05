/**
 * GET    /api/v1/patients/[id]
 * PATCH  /api/v1/patients/[id]
 * DELETE /api/v1/patients/[id]  (archive)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, noContent, handleApiError, NotFoundError } from "@/lib/api";
import { requirePermission, getPatientScope } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { randomBytes } from "crypto";
import { PORTAL_MAGIC_LINK_EXPIRY_MS, generateActivationToken } from "@/lib/patient-auth";
import { encryptCpf, decryptPatientCpf } from "@/lib/cpf-crypto";

async function resolvePatient(id: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const scope = getPatientScope(ctx);
  const patient = await db.patient.findFirst({
    where: {
      id,
      tenantId: ctx.tenantId,
      ...(scope === "ASSIGNED" && { assignedUserId: ctx.userId }),
    },
    include: {
      assignedUser: { select: { id: true, name: true } },
      contacts: true,
    },
  });
  if (!patient) throw new NotFoundError("Patient");
  return patient;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");
    const patient = await resolvePatient(params.id, ctx);
    // Decrypt CPF before returning to client
    const decrypted = await decryptPatientCpf(patient);
    return ok(decrypted);
  } catch (err) {
    return handleApiError(err);
  }
}

const updateSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  preferredName: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  dob: z.string().optional().nullable(),
  cpf: z.string().max(14).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  tags: z.array(z.string()).optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  consentGiven: z.boolean().optional(),
  isActive: z.boolean().optional(),
  defaultAppointmentTypeId: z.string().uuid().optional().nullable(),
  defaultFeeOverrideCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const existingPatient = await resolvePatient(params.id, ctx);
    const body = updateSchema.parse(await req.json());

    const patient = await db.patient.update({
      where: { id: params.id, tenantId: ctx.tenantId },
      data: {
        ...(body.fullName && { fullName: body.fullName }),
        ...(body.preferredName !== undefined && { preferredName: body.preferredName }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.dob !== undefined && { dob: body.dob ? new Date(body.dob) : null }),
        ...(body.cpf !== undefined && { cpf: await encryptCpf(body.cpf) }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.assignedUserId !== undefined && { assignedUserId: body.assignedUserId }),
        ...(body.consentGiven !== undefined && {
          consentGiven: body.consentGiven,
          consentGivenAt: body.consentGiven ? new Date() : undefined,
        }),
        ...(body.isActive !== undefined && {
          isActive: body.isActive,
          archivedAt: body.isActive ? null : new Date(),
          archivedBy: body.isActive ? null : ctx.userId,
        }),
        ...(body.defaultAppointmentTypeId !== undefined && {
          defaultAppointmentTypeId: body.defaultAppointmentTypeId,
        }),
        ...(body.defaultFeeOverrideCents !== undefined && {
          defaultFeeOverrideCents: body.defaultFeeOverrideCents,
        }),
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: body.isActive !== undefined
        ? (body.isActive ? "PATIENT_RESTORE" : "PATIENT_ARCHIVE")
        : "PATIENT_UPDATE",
      entity: "Patient",
      entityId: patient.id,
      summary: { patientId: patient.id, fields: Object.keys(body) },
      ipAddress,
      userAgent,
    });

    // ── Auto-sync PatientAuth when email is set or changed ──
    let portalEmailSynced = false;
    const newEmail = body.email;
    const emailChanged = newEmail !== undefined && newEmail !== null && newEmail !== existingPatient.email;

    if (emailChanged) {
      try {
        const tenant = await db.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: { name: true, portalEnabled: true },
        });

        if (tenant?.portalEnabled) {
          const existingAuth = await db.patientAuth.findUnique({
            where: { patientId: params.id },
          });

          const baseUrl = process.env.NEXTAUTH_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

          if (existingAuth) {
            // ── Existing PatientAuth: update email + send magic link ──
            const oldEmail = existingAuth.email;

            await db.patientAuth.update({
              where: { id: existingAuth.id },
              data: {
                email: newEmail,
                emailVerified: false,
                emailVerifiedAt: null,
              },
            });

            const magicToken = randomBytes(32).toString("base64url");
            const magicTokenExpiresAt = new Date(Date.now() + PORTAL_MAGIC_LINK_EXPIRY_MS);

            await db.patientAuth.update({
              where: { id: existingAuth.id },
              data: { magicToken, magicTokenExpiresAt },
            });

            const magicUrl = `${baseUrl}/portal/magic-login/${magicToken}`;

            try {
              const { sendPortalMagicLinkEmail } = await import("@/lib/email");
              await sendPortalMagicLinkEmail({
                to: newEmail,
                magicUrl,
                patientName: patient.fullName,
                tenantName: tenant.name,
              });
              portalEmailSynced = true;
            } catch (emailErr) {
              console.error("[patient-patch] Magic link email failed:", emailErr);
            }

            await auditLog({
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              action: "PORTAL_EMAIL_UPDATED",
              entity: "PatientAuth",
              entityId: existingAuth.id,
              summary: { patientId: params.id, oldEmail, newEmail },
              ipAddress,
              userAgent,
            });
          } else {
            // ── No PatientAuth yet: create one + send activation invite ──
            const activationToken = generateActivationToken();

            const newAuth = await db.patientAuth.create({
              data: {
                tenantId: ctx.tenantId,
                patientId: params.id,
                email: newEmail,
                activationToken,
              },
            });

            const activateUrl = `${baseUrl}/portal/activate/${activationToken}`;

            try {
              const { sendPortalInviteEmail } = await import("@/lib/email");
              await sendPortalInviteEmail({
                to: newEmail,
                activateUrl,
                patientName: patient.fullName,
                tenantName: tenant.name,
              });
              portalEmailSynced = true;
            } catch (emailErr) {
              console.error("[patient-patch] Portal invite email failed:", emailErr);
            }

            await auditLog({
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              action: "PORTAL_ACCOUNT_ACTIVATED",
              entity: "PatientAuth",
              entityId: newAuth.id,
              summary: { patientId: params.id, email: newEmail, autoInvite: true },
              ipAddress,
              userAgent,
            });
          }
        }
      } catch (portalErr) {
        // Portal sync failures must never break the main patient update
        console.error("[patient-patch] Portal email sync failed:", portalErr);
      }
    }

    return ok({ ...patient, portalEmailSynced });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:archive");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    await resolvePatient(params.id, ctx);

    await db.patient.update({
      where: { id: params.id, tenantId: ctx.tenantId },
      data: {
        isActive: false,
        archivedAt: new Date(),
        archivedBy: ctx.userId,
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PATIENT_ARCHIVE",
      entity: "Patient",
      entityId: params.id,
      ipAddress,
      userAgent,
    });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
