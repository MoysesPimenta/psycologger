/**
 * Patient Portal Authentication — Psycologger
 * Separate auth system for patients using PatientAuth table.
 * Patients authenticate via password + optional magic link.
 * Session tokens are stored as SHA-256 hashes in PatientPortalSession.
 */

import { db } from "./db";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { ForbiddenError, UnauthorizedError } from "./rbac";

// ─── Constants ───────────────────────────────────────────────────────────────

export const PORTAL_COOKIE_NAME = "psycologger-portal-token";
export const PORTAL_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PORTAL_MAGIC_LINK_EXPIRY_MS = 30 * 60 * 1000; // 30 min
export const PORTAL_PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
export const PORTAL_MAX_LOGIN_ATTEMPTS = 5;
export const PORTAL_LOCKOUT_MS = 15 * 60 * 1000; // 15 min
export const PORTAL_ACTIVATION_TOKEN_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
export const PORTAL_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PatientContext {
  patientAuthId: string;
  patientId: string;
  tenantId: string;
  email: string;
  patientName: string;
  preferredName: string | null;
  tenant: {
    portalEnabled: boolean;
    portalPaymentsVisible: boolean;
    portalJournalEnabled: boolean;
    portalRescheduleEnabled: boolean;
    portalVideoLinkAdvanceMin: number;
    portalSafetyText: string | null;
    portalSafetyCrisisPhone: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateActivationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateMagicToken(): string {
  return randomBytes(32).toString("base64url");
}

// ─── Session Management ─────────────────────────────────────────────────────

export async function createPortalSession(
  patientAuthId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PORTAL_SESSION_MAX_AGE_MS);

  await db.patientPortalSession.create({
    data: {
      patientAuthId,
      tokenHash,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
    },
  });

  return token;
}

export async function revokePortalSession(sessionId: string, patientAuthId: string): Promise<void> {
  await db.patientPortalSession.updateMany({
    where: { id: sessionId, patientAuthId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllPortalSessions(patientAuthId: string): Promise<void> {
  await db.patientPortalSession.updateMany({
    where: { patientAuthId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function setPortalCookie(token: string): void {
  const cookieStore = cookies();
  cookieStore.set(PORTAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",  // Must cover both /portal/* pages and /api/v1/portal/* endpoints
    maxAge: PORTAL_SESSION_MAX_AGE_MS / 1000,
  });
}

export function clearPortalCookie(): void {
  const cookieStore = cookies();
  cookieStore.delete(PORTAL_COOKIE_NAME);
}

// ─── Context Resolution ─────────────────────────────────────────────────────

/**
 * Resolve PatientContext from the portal session cookie.
 * Mirrors getAuthContext() for the patient side.
 */
export async function getPatientContext(req?: Request): Promise<PatientContext> {
  // Read token from cookie
  let token: string | undefined;

  if (req) {
    // API route: read from Cookie header
    const cookieHeader = req.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`${PORTAL_COOKIE_NAME}=([^;]+)`));
    token = match?.[1];
  } else {
    // Server component: use next/headers
    const cookieStore = cookies();
    token = cookieStore.get(PORTAL_COOKIE_NAME)?.value;
  }

  if (!token) {
    throw new UnauthorizedError("Portal session required");
  }

  const tokenHash = hashToken(token);

  // Find active session
  const session = await db.patientPortalSession.findUnique({
    where: { tokenHash },
    include: {
      patientAuth: {
        include: {
          patient: {
            select: { id: true, fullName: true, preferredName: true, assignedUserId: true },
          },
          tenant: {
            select: {
              id: true,
              portalEnabled: true,
              portalPaymentsVisible: true,
              portalJournalEnabled: true,
              portalRescheduleEnabled: true,
              portalVideoLinkAdvanceMin: true,
              portalSafetyText: true,
              portalSafetyCrisisPhone: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new UnauthorizedError("Invalid portal session");
  }

  // Check session validity
  if (session.revokedAt) {
    throw new UnauthorizedError("Portal session revoked");
  }
  if (new Date(session.expiresAt) < new Date()) {
    throw new UnauthorizedError("Portal session expired");
  }

  // Check idle timeout — if no activity in the last 30 minutes, expire
  const lastActivity = session.lastActivityAt ? new Date(session.lastActivityAt) : new Date(session.createdAt);
  if (Date.now() - lastActivity.getTime() > PORTAL_IDLE_TIMEOUT_MS) {
    // Auto-revoke the idle session
    await db.patientPortalSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError("Portal session expired due to inactivity");
  }

  // Touch lastActivityAt with proper error handling
  try {
    await db.patientPortalSession.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });
  } catch (err) {
    console.error("[patient-auth] Failed to update lastActivityAt:", err);
    // Continue — activity tracking failure should not block the request
  }

  const { patientAuth } = session;

  // Check account status
  if (patientAuth.status !== "ACTIVE") {
    throw new ForbiddenError("Conta do portal suspensa ou desativada.");
  }

  // Check portal enabled
  if (!patientAuth.tenant.portalEnabled) {
    throw new ForbiddenError("O portal do paciente não está habilitado nesta clínica.");
  }

  return {
    patientAuthId: patientAuth.id,
    patientId: patientAuth.patient.id,
    tenantId: patientAuth.tenant.id,
    email: patientAuth.email,
    patientName: patientAuth.patient.fullName,
    preferredName: patientAuth.patient.preferredName,
    tenant: {
      portalEnabled: patientAuth.tenant.portalEnabled,
      portalPaymentsVisible: patientAuth.tenant.portalPaymentsVisible,
      portalJournalEnabled: patientAuth.tenant.portalJournalEnabled,
      portalRescheduleEnabled: patientAuth.tenant.portalRescheduleEnabled,
      portalVideoLinkAdvanceMin: patientAuth.tenant.portalVideoLinkAdvanceMin,
      portalSafetyText: patientAuth.tenant.portalSafetyText,
      portalSafetyCrisisPhone: patientAuth.tenant.portalSafetyCrisisPhone,
    },
  };
}

// ─── Password Helpers ────────────────────────────────────────────────────────

/**
 * Hash a password using bcrypt-compatible Web Crypto (avoids native bcrypt dep).
 * We use PBKDF2 with 600k iterations as a portable alternative.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    key,
    256,
  );
  const hash = Buffer.from(derived).toString("base64url");
  const saltStr = salt.toString("base64url");
  return `pbkdf2:sha256:600000:${saltStr}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;

  const [, , iterStr, saltStr, hashStr] = parts;
  const iterations = parseInt(iterStr, 10);
  const salt = Buffer.from(saltStr, "base64url");
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  const computedBuf = Buffer.from(new Uint8Array(derived));
  const storedBuf = Buffer.from(hashStr, "base64url");

  // Use crypto.timingSafeEqual to prevent timing attacks.
  // Both buffers must be the same length; if not, compare against a
  // dummy buffer of the correct length to avoid leaking length info.
  if (computedBuf.length !== storedBuf.length) {
    timingSafeEqual(computedBuf, computedBuf); // constant-time no-op
    return false;
  }
  return timingSafeEqual(computedBuf, storedBuf);
}
