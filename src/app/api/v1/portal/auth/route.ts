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
} from "@/lib/patient-auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  PORTAL_LOGIN_RATE_LIMIT,
  PORTAL_LOGIN_RATE_LIMIT_WINDOW_MS,
} from "@/lib/constants";

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
