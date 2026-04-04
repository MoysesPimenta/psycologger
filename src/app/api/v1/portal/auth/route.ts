/**
 * Patient Portal Auth APIs — Magic Link Only
 * POST /api/v1/portal/auth — { action: "magic-link-request" | "magic-link-verify" | "activate" | "logout" }
 * GET  /api/v1/portal/auth — List active sessions
 *
 * Flow:
 * 1. Patient enters email → API sends magic link(s) — one per clinic they belong to
 * 2. Patient clicks link → auto-login to that specific clinic
 * 3. First-time patients: click activation link → account activated → auto-login
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, created, noContent, handleApiError, apiError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import {
  getPatientContext,
  createPortalSession,
  setPortalCookie,
  clearPortalCookie,
  revokeAllPortalSessions,
  PORTAL_ACTIVATION_TOKEN_MAX_AGE_MS,
} from "@/lib/patient-auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  PORTAL_MAGIC_LINK_RATE_LIMIT,
  PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
  PORTAL_ACTIVATION_RATE_LIMIT,
  PORTAL_ACTIVATION_RATE_LIMIT_WINDOW_MS,
} from "@/lib/constants";
import { sendPortalMagicLinkEmail } from "@/lib/email";
import { PORTAL_MAGIC_LINK_EXPIRY_MS } from "@/lib/patient-auth";
import { randomBytes } from "crypto";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const magicLinkRequestSchema = z.object({
  action: z.literal("magic-link-request"),
  email: z.string().email().toLowerCase(),
});

const magicLinkVerifySchema = z.object({
  action: z.literal("magic-link-verify"),
  token: z.string().min(1),
});

const activateSchema = z.object({
  action: z.literal("activate"),
  token: z.string().min(1),
});

const logoutSchema = z.object({
  action: z.literal("logout"),
});

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ipAddress, userAgent } = extractRequestMeta(req);

    if (body.action === "magic-link-request") {
      return await handleMagicLinkRequest(magicLinkRequestSchema.parse(body), ipAddress, userAgent);
    }
    if (body.action === "magic-link-verify") {
      return await handleMagicLinkVerify(magicLinkVerifySchema.parse(body), ipAddress, userAgent);
    }
    if (body.action === "activate") {
      return await handleActivate(activateSchema.parse(body), ipAddress, userAgent);
    }
    if (body.action === "logout") {
      logoutSchema.parse(body);
      return await handleLogout(req, ipAddress, userAgent);
    }

    return apiError("BAD_REQUEST", "Ação inválida.", 400);
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── GET: List active sessions ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ctx = await getPatientContext(req);

    const sessions = await db.patientPortalSession.findMany({
      where: {
        patientAuthId: ctx.patientAuthId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return ok(sessions);
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── Magic Link Request (tenant-less) ──────────────────────────────────────

async function handleMagicLinkRequest(
  input: z.infer<typeof magicLinkRequestSchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  const rlKey = `portal-magic:${ipAddress ?? "unknown"}:${input.email}`;
  const rl = await rateLimit(rlKey, PORTAL_MAGIC_LINK_RATE_LIMIT, PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return apiError("TOO_MANY_REQUESTS", "Muitas solicitações. Aguarde antes de tentar novamente.", 429);
  }

  // Always return success to prevent email enumeration
  const successResponse = ok({
    success: true,
    message: "Se o email estiver cadastrado, você receberá um link de acesso.",
  });

  // Find ALL active PatientAuth records for this email (across all tenants)
  const allAuths = await db.patientAuth.findMany({
    where: {
      email: input.email,
      status: "ACTIVE",
      activatedAt: { not: null },
    },
    include: {
      patient: { select: { fullName: true } },
      tenant: { select: { id: true, name: true, portalEnabled: true } },
    },
  });

  const eligibleAuths = allAuths.filter(
    (a: { tenant: { portalEnabled: boolean } }) => a.tenant.portalEnabled,
  );

  if (eligibleAuths.length === 0) {
    return successResponse;
  }

  const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  // Generate a magic token per clinic and send one email each
  for (const auth of eligibleAuths) {
    const magicToken = randomBytes(32).toString("base64url");
    const magicTokenExpiresAt = new Date(Date.now() + PORTAL_MAGIC_LINK_EXPIRY_MS);

    await db.patientAuth.update({
      where: { id: auth.id },
      data: { magicToken, magicTokenExpiresAt },
    });

    const magicUrl = `${APP_URL}/portal/magic-login/${magicToken}`;

    try {
      await sendPortalMagicLinkEmail({
        to: input.email,
        magicUrl,
        patientName: auth.patient?.fullName ?? "",
        tenantName: auth.tenant?.name ?? "",
      });
    } catch (err) {
      console.error("[portal-auth] Failed to send magic link email:", err);
    }

    await auditLog({
      tenantId: auth.tenantId,
      action: "PORTAL_MAGIC_LINK_REQUESTED",
      entity: "PatientAuth",
      entityId: auth.id,
      ipAddress,
      userAgent,
    });
  }

  return successResponse;
}

// ─── Magic Link Verify ──────────────────────────────────────────────────────

async function handleMagicLinkVerify(
  input: z.infer<typeof magicLinkVerifySchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  const rlKey = `portal-magic-verify:${ipAddress ?? "unknown"}`;
  const rl = await rateLimit(rlKey, PORTAL_MAGIC_LINK_RATE_LIMIT, PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return apiError("TOO_MANY_REQUESTS", "Muitas tentativas. Aguarde antes de tentar novamente.", 429);
  }

  // Atomic token consumption via transaction
  const result = await db.$transaction(async (tx) => {
    const patientAuth = await tx.patientAuth.findUnique({
      where: { magicToken: input.token },
      include: {
        tenant: { select: { id: true, name: true, portalEnabled: true } },
      },
    });

    if (!patientAuth) {
      return { error: "NOT_FOUND" as const };
    }

    if (!patientAuth.magicTokenExpiresAt || new Date(patientAuth.magicTokenExpiresAt) < new Date()) {
      await tx.patientAuth.update({
        where: { id: patientAuth.id },
        data: { magicToken: null, magicTokenExpiresAt: null },
      });
      return { error: "EXPIRED" as const };
    }

    // Consume token atomically
    await tx.patientAuth.update({
      where: { id: patientAuth.id },
      data: {
        magicToken: null,
        magicTokenExpiresAt: null,
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return { patientAuth };
  });

  if (result.error === "NOT_FOUND") {
    return apiError("NOT_FOUND", "Link inválido ou expirado.", 404);
  }
  if (result.error === "EXPIRED") {
    return apiError("GONE", "Link expirado. Solicite um novo.", 410);
  }

  const { patientAuth } = result;

  // Each magic link is clinic-specific → direct login
  const token = await createPortalSession(patientAuth.id, ipAddress, userAgent);
  setPortalCookie(token);

  await auditLog({
    tenantId: patientAuth.tenant.id,
    action: "PORTAL_LOGIN",
    entity: "PatientAuth",
    entityId: patientAuth.id,
    summary: { method: "magic-link" },
    ipAddress,
    userAgent,
  });

  return ok({ success: true });
}

// ─── Activate (first-time account setup — no password) ─────────────────────

async function handleActivate(
  input: z.infer<typeof activateSchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  const rlKey = `portal-activate:${ipAddress ?? "unknown"}`;
  const rl = await rateLimit(rlKey, PORTAL_ACTIVATION_RATE_LIMIT, PORTAL_ACTIVATION_RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return apiError("TOO_MANY_REQUESTS", "Muitas tentativas. Aguarde antes de tentar novamente.", 429);
  }

  // Atomic token consumption
  const result = await db.$transaction(async (tx) => {
    const patientAuth = await tx.patientAuth.findUnique({
      where: { activationToken: input.token },
      include: {
        patient: { select: { id: true } },
        tenant: { select: { id: true, portalEnabled: true } },
      },
    });

    if (!patientAuth) {
      return { error: "NOT_FOUND" as const };
    }

    if (patientAuth.activatedAt) {
      return { error: "CONFLICT" as const };
    }

    const tokenAge = Date.now() - new Date(patientAuth.updatedAt ?? patientAuth.createdAt).getTime();
    if (tokenAge > PORTAL_ACTIVATION_TOKEN_MAX_AGE_MS) {
      await tx.patientAuth.update({
        where: { id: patientAuth.id },
        data: { activationToken: null },
      });
      return { error: "EXPIRED" as const };
    }

    // Activate — no password needed (magic-link only)
    await tx.patientAuth.update({
      where: { id: patientAuth.id },
      data: {
        activatedAt: new Date(),
        activationToken: null,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    // Create preferences if not exist
    const existingPref = await tx.patientPreference.findUnique({
      where: { patientId: patientAuth.patientId },
    });
    if (!existingPref) {
      await tx.patientPreference.create({
        data: {
          patientId: patientAuth.patientId,
          tenantId: patientAuth.tenant.id,
        },
      });
    }

    return { patientAuth };
  });

  if (result.error === "NOT_FOUND") {
    return apiError("NOT_FOUND", "Token de ativação inválido ou expirado.", 404);
  }
  if (result.error === "CONFLICT") {
    return apiError("CONFLICT", "Conta já ativada. Faça login.", 409);
  }
  if (result.error === "EXPIRED") {
    return apiError("GONE", "Token de ativação expirado. Solicite um novo convite.", 410);
  }

  const { patientAuth } = result;

  // Auto-login after activation
  const token = await createPortalSession(patientAuth.id, ipAddress, userAgent);
  setPortalCookie(token);

  await auditLog({
    tenantId: patientAuth.tenant.id,
    action: "PORTAL_ACCOUNT_ACTIVATED",
    entity: "PatientAuth",
    entityId: patientAuth.id,
    ipAddress,
    userAgent,
  });

  return created({ success: true });
}

// ─── Logout ──────────────────────────────────────────────────────────────────

async function handleLogout(
  req: NextRequest,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  try {
    const ctx = await getPatientContext(req);
    await revokeAllPortalSessions(ctx.patientAuthId);

    await auditLog({
      tenantId: ctx.tenantId,
      action: "PORTAL_LOGOUT",
      entity: "PatientAuth",
      entityId: ctx.patientAuthId,
      ipAddress,
      userAgent,
    });
  } catch {
    // If context fails, just clear cookie
  }

  clearPortalCookie();
  return noContent();
}
