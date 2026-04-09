/**
 * Mobile Bearer Token Authentication — Psycologger
 * JWT-based authentication for Expo/React Native clients.
 * Uses HS256 with MOBILE_JWT_SECRET (or falls back to NEXTAUTH_SECRET).
 *
 * Token format: Bearer <JWT>
 * Token payload: { userId, tenantId, kind: "staff" | "patient", iat, exp }
 */

import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export interface MobileTokenPayload {
  userId: string;
  tenantId: string;
  kind: "staff" | "patient";
  iat: number;
  exp: number;
}

/**
 * Get the JWT secret for mobile bearer tokens.
 * Falls back to NEXTAUTH_SECRET if MOBILE_JWT_SECRET is not set.
 * Logs a warning if using the fallback.
 */
function getJwtSecret(): string {
  let secret = process.env.MOBILE_JWT_SECRET;
  if (!secret) {
    secret = process.env.NEXTAUTH_SECRET;
    if (secret) {
      console.warn(
        "[bearer-auth] MOBILE_JWT_SECRET not set; falling back to NEXTAUTH_SECRET"
      );
    }
  }
  if (!secret) {
    throw new Error(
      "Bearer token signing requires MOBILE_JWT_SECRET or NEXTAUTH_SECRET"
    );
  }
  return secret;
}

/**
 * Create a signing key from the secret string.
 * jose requires a Uint8Array for HS256.
 */
function getSigningKey(): Uint8Array {
  const secret = getJwtSecret();
  return new TextEncoder().encode(secret);
}

/**
 * Sign and return a mobile bearer token.
 * Token is valid for `ttlSec` seconds from now.
 *
 * @param userId - User ID (from User or PatientAuth)
 * @param tenantId - Tenant ID
 * @param kind - "staff" or "patient"
 * @param ttlSec - Time-to-live in seconds (e.g., 30 * 24 * 60 * 60 = 30 days)
 * @returns JWT string (without "Bearer " prefix)
 */
export async function signMobileToken(
  userId: string,
  tenantId: string,
  kind: "staff" | "patient",
  ttlSec: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: MobileTokenPayload = {
    userId,
    tenantId,
    kind,
    iat: now,
    exp: now + ttlSec,
  };

  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .sign(getSigningKey());

  return token;
}

/**
 * Verify a Bearer token from an Authorization header.
 * Reads `Authorization: Bearer <jwt>` and verifies the JWT signature and expiration.
 *
 * @param req - Next.js Request object
 * @returns MobileTokenPayload if valid, null if missing/invalid
 */
export async function verifyBearer(
  req: NextRequest
): Promise<MobileTokenPayload | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]!.toLowerCase() !== "bearer") {
    return null;
  }

  const token = parts[1]!;

  try {
    const secret = getJwtSecret();
    const key = new TextEncoder().encode(secret);
    const verified = await jwtVerify(token, key);
    return verified.payload as MobileTokenPayload;
  } catch (err) {
    // Token is invalid or expired
    console.debug("[bearer-auth] Token verification failed:", err);
    return null;
  }
}
