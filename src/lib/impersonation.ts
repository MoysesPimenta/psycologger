/**
 * Impersonation utilities — Psycologger SuperAdmin console
 * Handles signing and verifying impersonation tokens.
 *
 * Impersonation is a security-sensitive feature:
 * - Must be auditable end-to-end
 * - Must NOT bypass tenant isolation
 * - Must NOT bypass RBAC (impersonated user's role applies)
 * - Must be time-limited (1 hour)
 * - Must be re-verified on every request
 */

import { jwtVerify, SignJWT } from "jose";

export interface ImpersonationPayload {
  impersonatedUserId: string;
  impersonatedTenantId: string;
  byUserId: string; // The superadmin doing the impersonating
  exp: number; // Unix timestamp
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback-secret-unsafe"
);

const IMPERSONATION_MAX_AGE_SECONDS = 3600; // 1 hour

/**
 * Create a signed impersonation token.
 * Returns a JWT string ready to store in a cookie.
 */
export async function signImpersonationToken(
  impersonatedUserId: string,
  impersonatedTenantId: string,
  byUserId: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + IMPERSONATION_MAX_AGE_SECONDS;

  const token = await new SignJWT({
    impersonatedUserId,
    impersonatedTenantId,
    byUserId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify an impersonation token and extract its payload.
 * Throws if token is invalid, expired, or tampered with.
 */
export async function verifyImpersonationToken(
  token: string
): Promise<ImpersonationPayload> {
  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    const payload = verified.payload as unknown as ImpersonationPayload;

    if (!payload.impersonatedUserId || !payload.impersonatedTenantId || !payload.byUserId) {
      throw new Error("Invalid impersonation token structure");
    }

    return {
      impersonatedUserId: payload.impersonatedUserId,
      impersonatedTenantId: payload.impersonatedTenantId,
      byUserId: payload.byUserId,
      exp: payload.exp || 0,
    };
  } catch (error) {
    throw new Error(`Failed to verify impersonation token: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get the max age in seconds for the impersonation cookie.
 */
export function getImpersonationCookieMaxAge(): number {
  return IMPERSONATION_MAX_AGE_SECONDS;
}
