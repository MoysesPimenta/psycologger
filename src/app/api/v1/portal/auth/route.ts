/**
 * Patient Portal Auth APIs
 * POST /api/v1/portal/auth — { action: "login" | "activate" | "magic-link" | "forgot" | "reset" | "logout" }
 * GET  /api/v1/portal/auth — List active sessions
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
  hashPassword,
  verifyPassword,
  generateActivationToken,
  PORTAL_MAX_LOGIN_ATTEMPTS,
  PORTAL_LOCKOUT_MS,
  PORTAL_ACTIVATION_TOKEN_MAX_AGE_MS,
  PORTAL_PASSWORD_RESET_EXPIRY_MS,
} from "@/lib/patient-auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  PORTAL_LOGIN_RATE_LIMIT,
  PORTAL_LOGIN_RATE_LIMIT_WINDOW_MS,
  PORTAL_PASSWORD_RESET_RATE_LIMIT,
  PORTAL_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  PORTAL_MAGIC_LINK_RATE_LIMIT,
  PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
} from "@/lib/constants";
import { sendPortalPasswordResetEmail, sendPortalMagicLinkEmail } from "@/lib/email";
import { PORTAL_MAGIC_LINK_EXPIRY_MS } from "@/lib/patient-auth";
import { randomBytes } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

// ─── Schemas ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  action: z.literal("login"),
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  tenantId: z.string().uuid(),
});

const activateSchema = z.object({
  action: z.literal("activate"),
  token: z.string().min(1),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  name: z.string().optional(),
});

const logoutSchema = z.object({
  action: z.literal("logout"),
});

const forgotSchema = z.object({
  action: z.literal("forgot"),
  email: z.string().email().toLowerCase(),
  tenantId: z.string().uuid(),
});

const resetSchema = z.object({
  action: z.literal("reset"),
  token: z.string().min(1),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});

const magicLinkRequestSchema = z.object({
  action: z.literal("magic-link-request"),
  email: z.string().email().toLowerCase(),
  tenantId: z.string().uuid(),
});

const magicLinkVerifySchema = z.object({
  action: z.literal("magic-link-verify"),
  token: z.string().min(1),
});

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Route by action
    if (body.action === "login") {
      return await handleLogin(loginSchema.parse(body), ipAddress, userAgent);
    }
    if (body.action === "activate") {
      return await handleActivate(activateSchema.parse(body), ipAddress, userAgent);
    }
    if (body.action === "logout") {
      logoutSchema.parse(body);
      return await handleLogout(req, ipAddress, userAgent);
    }
    if (body.action === "forgot") {
      return await handleForgotPassword(forgotSchema.parse(body), ipAddress, userAgent);
    }
    if (body.action === "reset") {
      return await handleResetPassword(resetSchema.parse(body), ipAddress, userAgent);
    }
    if (body.action === "magic-link-request") {
      return await handleMagicLinkRequest(magicLinkRequestSchema.parse(body), ipAddress, userAgent);
    }
    if (body.action === "magic-link-verify") {
      return await handleMagicLinkVerify(magicLinkVerifySchema.parse(body), ipAddress, userAgent);
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

    const sessions = await dbAny.patientPortalSession.findMany({
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
      orderBy: { createdAt: "desc" as const },
    });

    return ok(sessions);
  } catch (err) {
    return handleApiError(err);
  }
}

// ─── Login Handler ───────────────────────────────────────────────────────────

async function handleLogin(
  input: z.infer<typeof loginSchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  // Rate limit by IP + email combo to prevent distributed brute-force
  const rlKey = `portal-login:${ipAddress ?? "unknown"}:${input.email}`;
  const rl = await rateLimit(rlKey, PORTAL_LOGIN_RATE_LIMIT, PORTAL_LOGIN_RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return apiError("TOO_MANY_REQUESTS", "Muitas tentativas. Aguarde alguns minutos.", 429);
  }

  // Find patient auth
  const patientAuth = await dbAny.patientAuth.findUnique({
    where: {
      tenantId_email: { tenantId: input.tenantId, email: input.email },
    } as never,
    include: {
      tenant: { select: { portalEnabled: true } },
    },
  });

  if (!patientAuth) {
    return apiError("UNAUTHORIZED", "Email ou senha incorretos.", 401);
  }

  // Check portal enabled
  if (!patientAuth.tenant.portalEnabled) {
    return apiError("FORBIDDEN", "O portal do paciente não está habilitado.", 403);
  }

  // Check account status
  if (patientAuth.status !== "ACTIVE") {
    return apiError("FORBIDDEN", "Conta suspensa ou desativada.", 403);
  }

  // Check lockout
  if (patientAuth.lockedUntil && new Date(patientAuth.lockedUntil) > new Date()) {
    return apiError("TOO_MANY_REQUESTS", "Conta bloqueada. Tente novamente mais tarde.", 429);
  }

  // Verify password
  if (!patientAuth.passwordHash) {
    return apiError("BAD_REQUEST", "Conta não ativada. Use o link de ativação.", 400);
  }

  const valid = await verifyPassword(input.password, patientAuth.passwordHash);
  if (!valid) {
    // Increment attempts
    const newAttempts = patientAuth.loginAttempts + 1;
    const updateData: Record<string, unknown> = { loginAttempts: newAttempts };

    if (newAttempts >= PORTAL_MAX_LOGIN_ATTEMPTS) {
      updateData.lockedUntil = new Date(Date.now() + PORTAL_LOCKOUT_MS);
      await auditLog({
        tenantId: input.tenantId,
        action: "PORTAL_ACCOUNT_LOCKED",
        entity: "PatientAuth",
        entityId: patientAuth.id,
        ipAddress,
        userAgent,
      });
    }

    await dbAny.patientAuth.update({
      where: { id: patientAuth.id },
      data: updateData,
    });

    await auditLog({
      tenantId: input.tenantId,
      action: "PORTAL_LOGIN_FAILED",
      entity: "PatientAuth",
      entityId: patientAuth.id,
      ipAddress,
      userAgent,
    });

    return apiError("UNAUTHORIZED", "Email ou senha incorretos.", 401);
  }

  // Reset attempts + update last login
  await dbAny.patientAuth.update({
    where: { id: patientAuth.id },
    data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  // Create session
  const token = await createPortalSession(patientAuth.id, ipAddress, userAgent);
  setPortalCookie(token);

  await auditLog({
    tenantId: input.tenantId,
    action: "PORTAL_LOGIN",
    entity: "PatientAuth",
    entityId: patientAuth.id,
    ipAddress,
    userAgent,
  });

  return ok({ success: true });
}

// ─── Activate Handler ────────────────────────────────────────────────────────

async function handleActivate(
  input: z.infer<typeof activateSchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  const patientAuth = await dbAny.patientAuth.findUnique({
    where: { activationToken: input.token } as never,
    include: {
      patient: { select: { id: true, fullName: true } },
      tenant: { select: { id: true, portalEnabled: true } },
    },
  });

  if (!patientAuth) {
    return apiError("NOT_FOUND", "Token de ativação inválido ou expirado.", 404);
  }

  if (patientAuth.activatedAt) {
    return apiError("CONFLICT", "Conta já ativada. Faça login.", 409);
  }

  // Check token expiry (based on createdAt + max age)
  const tokenAge = Date.now() - new Date(patientAuth.createdAt).getTime();
  if (tokenAge > PORTAL_ACTIVATION_TOKEN_MAX_AGE_MS) {
    return apiError("GONE", "Token de ativação expirado. Solicite um novo convite.", 410);
  }

  // Hash password and activate
  const passwordHash = await hashPassword(input.password);

  await dbAny.patientAuth.update({
    where: { id: patientAuth.id },
    data: {
      passwordHash,
      activatedAt: new Date(),
      activationToken: null,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Create preferences if not exist
  const existingPref = await dbAny.patientPreference.findUnique({
    where: { patientId: patientAuth.patientId } as never,
  });
  if (!existingPref) {
    await dbAny.patientPreference.create({
      data: {
        patientId: patientAuth.patientId,
        tenantId: patientAuth.tenant.id,
      },
    });
  }

  // Auto-login
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

  return created({ success: true, patientName: patientAuth.patient.fullName });
}

// ─── Logout Handler ──────────────────────────────────────────────────────────

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

// ─── Forgot Password Handler ────────────────────────────────────────────────

async function handleForgotPassword(
  input: z.infer<typeof forgotSchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  // Rate limit
  const rlKey = `portal-forgot:${ipAddress ?? "unknown"}:${input.email}`;
  const rl = await rateLimit(rlKey, PORTAL_PASSWORD_RESET_RATE_LIMIT, PORTAL_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return apiError("TOO_MANY_REQUESTS", "Muitas solicitações. Aguarde antes de tentar novamente.", 429);
  }

  // Always return success to avoid email enumeration
  const successResponse = ok({ success: true, message: "Se o email estiver cadastrado, você receberá um link de redefinição." });

  const patientAuth = await dbAny.patientAuth.findUnique({
    where: {
      tenantId_email: { tenantId: input.tenantId, email: input.email },
    } as never,
    include: {
      patient: { select: { fullName: true } },
      tenant: { select: { name: true, portalEnabled: true } },
    },
  });

  if (!patientAuth || !patientAuth.tenant.portalEnabled || patientAuth.status !== "ACTIVE" || !patientAuth.activatedAt) {
    // Don't reveal whether account exists
    return successResponse;
  }

  // Generate reset token
  const resetToken = randomBytes(32).toString("base64url");
  const resetTokenExpiresAt = new Date(Date.now() + PORTAL_PASSWORD_RESET_EXPIRY_MS);

  await dbAny.patientAuth.update({
    where: { id: patientAuth.id },
    data: { resetToken, resetTokenExpiresAt },
  });

  // Send email
  const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const resetUrl = `${APP_URL}/portal/reset-password/${resetToken}`;

  try {
    await sendPortalPasswordResetEmail({
      to: input.email,
      resetUrl,
      patientName: patientAuth.patient.fullName,
      tenantName: patientAuth.tenant.name,
    });
  } catch (err) {
    console.error("[portal-auth] Failed to send reset email:", err);
    // Don't fail the request — the token is saved, user can retry
  }

  await auditLog({
    tenantId: input.tenantId,
    action: "PORTAL_PASSWORD_RESET_REQUESTED",
    entity: "PatientAuth",
    entityId: patientAuth.id,
    ipAddress,
    userAgent,
  });

  return successResponse;
}

// ─── Reset Password Handler ─────────────────────────────────────────────────

async function handleResetPassword(
  input: z.infer<typeof resetSchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  const patientAuth = await dbAny.patientAuth.findUnique({
    where: { resetToken: input.token } as never,
    include: {
      tenant: { select: { id: true, portalEnabled: true } },
    },
  });

  if (!patientAuth) {
    return apiError("NOT_FOUND", "Token inválido ou expirado.", 404);
  }

  if (!patientAuth.resetTokenExpiresAt || new Date(patientAuth.resetTokenExpiresAt) < new Date()) {
    // Clear expired token
    await dbAny.patientAuth.update({
      where: { id: patientAuth.id },
      data: { resetToken: null, resetTokenExpiresAt: null },
    });
    return apiError("GONE", "Token expirado. Solicite uma nova redefinição.", 410);
  }

  // Hash new password
  const passwordHash = await hashPassword(input.password);

  // Update password and clear token + unlock account
  await dbAny.patientAuth.update({
    where: { id: patientAuth.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
      loginAttempts: 0,
      lockedUntil: null,
    },
  });

  // Revoke all existing sessions for security
  await revokeAllPortalSessions(patientAuth.id);

  await auditLog({
    tenantId: patientAuth.tenant.id,
    action: "PORTAL_PASSWORD_RESET",
    entity: "PatientAuth",
    entityId: patientAuth.id,
    ipAddress,
    userAgent,
  });

  return ok({ success: true });
}

// ─── Magic Link Request Handler ─────────────────────────────────────────────

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

  const successResponse = ok({ success: true, message: "Se o email estiver cadastrado, você receberá um link de acesso." });

  const patientAuth = await dbAny.patientAuth.findUnique({
    where: {
      tenantId_email: { tenantId: input.tenantId, email: input.email },
    } as never,
    include: {
      patient: { select: { fullName: true } },
      tenant: { select: { name: true, portalEnabled: true } },
    },
  });

  if (!patientAuth || !patientAuth.tenant.portalEnabled || patientAuth.status !== "ACTIVE" || !patientAuth.activatedAt) {
    return successResponse;
  }

  const magicToken = randomBytes(32).toString("base64url");
  const magicTokenExpiresAt = new Date(Date.now() + PORTAL_MAGIC_LINK_EXPIRY_MS);

  await dbAny.patientAuth.update({
    where: { id: patientAuth.id },
    data: { magicToken, magicTokenExpiresAt },
  });

  const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const magicUrl = `${APP_URL}/portal/magic-login/${magicToken}`;

  try {
    await sendPortalMagicLinkEmail({
      to: input.email,
      magicUrl,
      patientName: patientAuth.patient.fullName,
      tenantName: patientAuth.tenant.name,
    });
  } catch (err) {
    console.error("[portal-auth] Failed to send magic link email:", err);
  }

  await auditLog({
    tenantId: input.tenantId,
    action: "PORTAL_MAGIC_LINK_REQUESTED",
    entity: "PatientAuth",
    entityId: patientAuth.id,
    ipAddress,
    userAgent,
  });

  return successResponse;
}

// ─── Magic Link Verify Handler ──────────────────────────────────────────────

async function handleMagicLinkVerify(
  input: z.infer<typeof magicLinkVerifySchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  const patientAuth = await dbAny.patientAuth.findUnique({
    where: { magicToken: input.token } as never,
    include: {
      tenant: { select: { id: true, portalEnabled: true } },
    },
  });

  if (!patientAuth) {
    return apiError("NOT_FOUND", "Link inválido ou expirado.", 404);
  }

  if (!patientAuth.magicTokenExpiresAt || new Date(patientAuth.magicTokenExpiresAt) < new Date()) {
    await dbAny.patientAuth.update({
      where: { id: patientAuth.id },
      data: { magicToken: null, magicTokenExpiresAt: null },
    });
    return apiError("GONE", "Link expirado. Solicite um novo.", 410);
  }

  // Clear token (single use)
  await dbAny.patientAuth.update({
    where: { id: patientAuth.id },
    data: {
      magicToken: null,
      magicTokenExpiresAt: null,
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

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
