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
import { ok, created, noContent, handleApiError, apiError, tooManyRequests } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import {
  getPatientContext,
  createPortalSession,
  setPortalCookieOnResponse,
  clearPortalCookieOnResponse,
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
import { randomBytes, createHash } from "crypto";

// Hash a magic-link / activation token before storing it. The plaintext goes
// to the patient via email; the DB only ever sees the SHA-256 digest. This
// limits the blast radius of a read-only DB compromise.
function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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
  // Rate limit by IP + email. Use email as sole key if IP is unavailable,
  // preventing all IP-unknown requests from sharing one bucket.
  const rlKey = ipAddress
    ? `portal-magic:${ipAddress}:${input.email}`
    : `portal-magic:noip:${input.email}`;
  const rl = await rateLimit(rlKey, PORTAL_MAGIC_LINK_RATE_LIMIT, PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return tooManyRequests("Muitas solicitações. Aguarde antes de tentar novamente.", PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS / 1000);
  }

  // Constant-time floor: every magic-link-request takes at least this long
  // regardless of whether the email exists. Combined with the always-success
  // response shape, this prevents timing-based email enumeration.
  const MIN_MS = 350;
  const startedAt = Date.now();
  const padTiming = async () => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_MS) {
      await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
    }
  };

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
    await padTiming();
    return successResponse;
  }

  const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  // Generate a magic token per clinic and send one email each.
  // Plaintext goes in the URL; only the SHA-256 hash is stored in the DB.
  for (const auth of eligibleAuths) {
    const magicToken = randomBytes(32).toString("base64url");
    const magicTokenHash = hashLinkToken(magicToken);
    const magicTokenExpiresAt = new Date(Date.now() + PORTAL_MAGIC_LINK_EXPIRY_MS);

    await db.patientAuth.update({
      where: { id: auth.id },
      data: { magicToken: magicTokenHash, magicTokenExpiresAt },
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

  await padTiming();
  return successResponse;
}

// ─── Magic Link Verify ──────────────────────────────────────────────────────

async function handleMagicLinkVerify(
  input: z.infer<typeof magicLinkVerifySchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  // Rate limit by IP + token prefix to prevent brute-force per-token
  const tokenPrefix = input.token.substring(0, 8);
  const rlKey = ipAddress
    ? `portal-magic-verify:${ipAddress}:${tokenPrefix}`
    : `portal-magic-verify:noip:${tokenPrefix}`;
  const rl = await rateLimit(rlKey, PORTAL_MAGIC_LINK_RATE_LIMIT, PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return tooManyRequests("Muitas tentativas. Aguarde antes de tentar novamente.", PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS / 1000);
  }

  // Atomic token consumption via transaction.
  // We look up by SHA-256 hash; the plaintext token never hits storage.
  const tokenHash = hashLinkToken(input.token);
  const result = await db.$transaction(async (tx) => {
    const patientAuth = await tx.patientAuth.findUnique({
      where: { magicToken: tokenHash },
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
  const sessionToken = await createPortalSession(patientAuth.id, ipAddress, userAgent);

  await auditLog({
    tenantId: patientAuth.tenant.id,
    action: "PORTAL_LOGIN",
    entity: "PatientAuth",
    entityId: patientAuth.id,
    summary: { method: "magic-link" },
    ipAddress,
    userAgent,
  });

  // Set cookie directly on the response — cookies() from next/headers
  // conflicts with NextResponse.json() in Route Handlers (causes 500)
  const response = ok({ success: true });
  setPortalCookieOnResponse(response, sessionToken);
  return response;
}

// ─── Activate (first-time account setup — no password) ─────────────────────

async function handleActivate(
  input: z.infer<typeof activateSchema>,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  const tokenPrefix = input.token.substring(0, 8);
  const rlKey = ipAddress
    ? `portal-activate:${ipAddress}:${tokenPrefix}`
    : `portal-activate:noip:${tokenPrefix}`;
  const rl = await rateLimit(rlKey, PORTAL_ACTIVATION_RATE_LIMIT, PORTAL_ACTIVATION_RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return tooManyRequests("Muitas tentativas. Aguarde antes de tentar novamente.", PORTAL_ACTIVATION_RATE_LIMIT_WINDOW_MS / 1000);
  }

  // Atomic token consumption — DB stores SHA-256 hash, not plaintext.
  const activationTokenHash = hashLinkToken(input.token);
  const result = await db.$transaction(async (tx) => {
    const patientAuth = await tx.patientAuth.findUnique({
      where: { activationToken: activationTokenHash },
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
  const sessionToken = await createPortalSession(patientAuth.id, ipAddress, userAgent);

  await auditLog({
    tenantId: patientAuth.tenant.id,
    action: "PORTAL_ACCOUNT_ACTIVATED",
    entity: "PatientAuth",
    entityId: patientAuth.id,
    ipAddress,
    userAgent,
  });

  const response = created({ success: true });
  setPortalCookieOnResponse(response, sessionToken);
  return response;
}

// ─── Logout ──────────────────────────────────────────────────────────────────

async function handleLogout(
  req: NextRequest,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  // Logout is the only portal/auth action that has an existing session and
  // therefore must be CSRF-protected. The middleware bypasses CSRF for the
  // whole portal/auth prefix because magic-link/activate fire from cold
  // visits with no cookie yet — so we re-enforce it in-handler for logout.
  const cookieMatch = req.headers.get("cookie")?.match(/psycologger-csrf=([^;]+)/);
  const cookieToken = cookieMatch?.[1];
  const headerToken = req.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken.length < 32 || cookieToken !== headerToken) {
    return apiError("CSRF_FAILED", "Token CSRF inválido ou ausente.", 403);
  }
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

  const response = noContent();
  clearPortalCookieOnResponse(response);
  return response;
}
