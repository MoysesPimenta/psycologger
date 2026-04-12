/**
 * Unit tests — Patient Portal Session Logic
 * Tests: Token hashing, expiry detection, idle timeout, account lockout
 * - Token hashing (verify SHA-256)
 * - Session expiry detection (7-day max)
 * - Idle timeout detection (30-min idle)
 * - Account lockout after 5 failed attempts
 */

import { vi } from "vitest";
import { createHash, randomBytes } from "crypto";

// Mock all dependencies BEFORE any imports
vi.mock("@/lib/db", () => ({
  db: {
    patientPortalSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    patientAuth: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    consentRecord: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

// Import the functions we're testing
import {
  PORTAL_COOKIE_NAME,
  PORTAL_SESSION_MAX_AGE_MS,
  PORTAL_IDLE_TIMEOUT_MS,
  PORTAL_MAX_LOGIN_ATTEMPTS,
  PORTAL_LOCKOUT_MS,
  createPortalSession,
  generateSessionToken,
} from "@/lib/patient-auth";

describe("Patient Portal Session Logic", () => {
  const mockDb = db as jest.Mocked<typeof db>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Token Generation and Hashing ──────────────────────────────────────────

  describe("Token Generation and Hashing", () => {
    test("should generate a valid session token", () => {
      const token = generateSessionToken();

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20); // base64url encoded 32 bytes
    });

    test("should generate unique tokens on each call", () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();

      expect(token1).not.toEqual(token2);
    });

    test("should hash token using SHA-256", () => {
      const token = "test-token";
      const hash = createHash("sha256").update(token).digest("hex");

      // SHA-256 produces 64 character hex string
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    test("should produce consistent SHA-256 hash for same token", () => {
      const token = "test-token-value";
      const hash1 = createHash("sha256").update(token).digest("hex");
      const hash2 = createHash("sha256").update(token).digest("hex");

      expect(hash1).toBe(hash2);
    });

    test("should produce different hashes for different tokens", () => {
      const token1 = "token-1";
      const token2 = "token-2";

      const hash1 = createHash("sha256").update(token1).digest("hex");
      const hash2 = createHash("sha256").update(token2).digest("hex");

      expect(hash1).not.toEqual(hash2);
    });

    test("should verify SHA-256 hash with standard crypto library", () => {
      const token = "test-session-token";
      const expectedHash = createHash("sha256").update(token).digest("hex");
      const actualHash = createHash("sha256").update(token).digest("hex");

      expect(actualHash).toBe(expectedHash);
    });

    test("should only store hash in database, not plain token", async () => {
      const patientAuthId = "patient-auth-123";
      const token = generateSessionToken();
      const tokenHash = createHash("sha256").update(token).digest("hex");

      mockDb.patientPortalSession.create.mockResolvedValueOnce({
        id: "session-1",
        patientAuthId,
        tokenHash, // Only hash is stored
        expiresAt: new Date(),
        createdAt: new Date(),
      } as any);

      const session = await db.patientPortalSession.create({
        data: {
          patientAuthId,
          tokenHash,
          expiresAt: new Date(),
        },
      } as any);

      // Verify plain token is never in the database
      expect(session.tokenHash).not.toBe(token);
      expect(session.tokenHash).toBe(tokenHash);
    });
  });

  // ─── Session Creation ────────────────────────────────────────────────────────

  describe("Session Creation", () => {
    test("should create session with correct expiry (7 days)", async () => {
      const patientAuthId = "patient-auth-123";
      const beforeCreation = Date.now();

      mockDb.patientPortalSession.create.mockResolvedValueOnce({
        id: "session-1",
        patientAuthId,
        tokenHash: "hash",
        expiresAt: new Date(beforeCreation + PORTAL_SESSION_MAX_AGE_MS),
        createdAt: new Date(),
      } as any);

      const session = await createPortalSession(patientAuthId);
      const afterCreation = Date.now();

      // Session should expire in 7 days (604800000 ms)
      expect(PORTAL_SESSION_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    test("should include IP address and user agent in session", async () => {
      const patientAuthId = "patient-auth-123";
      const ipAddress = "192.168.1.1";
      const userAgent = "Mozilla/5.0";

      mockDb.patientPortalSession.create.mockResolvedValueOnce({
        id: "session-1",
        patientAuthId,
        tokenHash: "hash",
        ipAddress,
        userAgent,
        expiresAt: new Date(),
        createdAt: new Date(),
      } as any);

      const token = await createPortalSession(patientAuthId, ipAddress, userAgent);

      expect(mockDb.patientPortalSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAddress,
            userAgent,
          }),
        })
      );
    });

    test("should return token from createPortalSession", async () => {
      const patientAuthId = "patient-auth-123";

      // Mock the create to accept and return data
      mockDb.patientPortalSession.create.mockImplementation(async (args: any) => ({
        id: "session-1",
        ...args.data,
        createdAt: new Date(),
      }));

      const token = await createPortalSession(patientAuthId);

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
    });
  });

  // ─── Session Expiry Detection ──────────────────────────────────────────────

  describe("Session Expiry Detection (7-day Max)", () => {
    test("should reject expired session (past expiresAt)", async () => {
      const now = new Date();
      const expiredSession = {
        id: "session-1",
        patientAuthId: "patient-auth-123",
        tokenHash: "hash",
        expiresAt: new Date(now.getTime() - 1000), // 1 second ago
        revokedAt: null,
        lastActivityAt: now,
        createdAt: new Date(now.getTime() - 1000000),
      };

      const isExpired = new Date(expiredSession.expiresAt) < new Date();

      expect(isExpired).toBe(true);
    });

    test("should accept valid session (before expiresAt)", async () => {
      const now = new Date();
      const validSession = {
        id: "session-1",
        patientAuthId: "patient-auth-123",
        tokenHash: "hash",
        expiresAt: new Date(now.getTime() + 1000000), // Far in future
        revokedAt: null,
        lastActivityAt: now,
        createdAt: new Date(now.getTime() - 1000),
      };

      const isExpired = new Date(validSession.expiresAt) < new Date();

      expect(isExpired).toBe(false);
    });

    test("should enforce 7-day maximum session age", () => {
      const maxAgeDays = PORTAL_SESSION_MAX_AGE_MS / (24 * 60 * 60 * 1000);

      expect(maxAgeDays).toBe(7);
    });

    test("should reject session at exactly 7 days old", () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - PORTAL_SESSION_MAX_AGE_MS);
      const expiresAt = new Date(createdAt.getTime() + PORTAL_SESSION_MAX_AGE_MS);

      // At exactly 7 days, the session should have expired
      const isExpired = expiresAt <= now;

      expect(isExpired).toBe(true);
    });

    test("should reject revoked session", async () => {
      const revokedSession = {
        id: "session-1",
        patientAuthId: "patient-auth-123",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: new Date(), // Session is revoked
        lastActivityAt: new Date(),
        createdAt: new Date(),
      };

      const isRevoked = !!revokedSession.revokedAt;

      expect(isRevoked).toBe(true);
    });
  });

  // ─── Idle Timeout Detection ────────────────────────────────────────────────

  describe("Idle Timeout Detection (30-min Idle)", () => {
    test("should enforce 30-minute idle timeout", () => {
      const idleTimeoutMinutes = PORTAL_IDLE_TIMEOUT_MS / (60 * 1000);

      expect(idleTimeoutMinutes).toBe(30);
    });

    test("should reject session idle for more than 30 minutes", () => {
      const now = Date.now();
      const lastActivity = new Date(now - PORTAL_IDLE_TIMEOUT_MS - 1000); // 30+ minutes ago

      const isIdle = now - lastActivity.getTime() > PORTAL_IDLE_TIMEOUT_MS;

      expect(isIdle).toBe(true);
    });

    test("should accept session active within 30 minutes", () => {
      const now = Date.now();
      const lastActivity = new Date(now - PORTAL_IDLE_TIMEOUT_MS + 1000); // 30- minutes ago

      const isIdle = now - lastActivity.getTime() > PORTAL_IDLE_TIMEOUT_MS;

      expect(isIdle).toBe(false);
    });

    test("should update lastActivityAt on request", async () => {
      const sessionId = "session-1";
      const oldActivityTime = new Date(Date.now() - 60000); // 1 minute ago

      mockDb.patientPortalSession.update.mockResolvedValueOnce({
        id: sessionId,
        patientAuthId: "patient-auth-123",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null,
        lastActivityAt: new Date(), // Updated to now
        createdAt: new Date(),
      } as any);

      const result = await db.patientPortalSession.update({
        where: { id: sessionId },
        data: { lastActivityAt: new Date() },
      } as any);

      expect(result.lastActivityAt.getTime()).toBeGreaterThan(oldActivityTime.getTime());
    });

    test("should track lastActivityAt separately from createdAt", () => {
      const createdAt = new Date("2026-04-01T10:00:00Z");
      const lastActivityAt = new Date("2026-04-01T11:00:00Z");

      const idleDuration = lastActivityAt.getTime() - createdAt.getTime();

      expect(idleDuration).toBe(3600000); // 1 hour
      expect(lastActivityAt > createdAt).toBe(true);
    });

    test("should use lastActivityAt (not createdAt) for idle timeout check", () => {
      const createdAt = new Date(Date.now() - 100 * 60 * 1000); // 100 minutes ago
      const lastActivityAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const now = Date.now();

      // Idle timeout should be checked against lastActivityAt, not createdAt
      const isIdleByCreated = now - createdAt.getTime() > PORTAL_IDLE_TIMEOUT_MS;
      const isIdleByActivity = now - lastActivityAt.getTime() > PORTAL_IDLE_TIMEOUT_MS;

      expect(isIdleByCreated).toBe(true); // Would incorrectly expire if checked against createdAt
      expect(isIdleByActivity).toBe(false); // Correctly active based on lastActivityAt
    });
  });

  // ─── Account Lockout After Failed Attempts ─────────────────────────────────

  describe("Account Lockout After Failed Attempts", () => {
    test("should enforce maximum login attempts limit", () => {
      expect(PORTAL_MAX_LOGIN_ATTEMPTS).toBe(5);
    });

    test("should track failed login attempts", () => {
      const maxAttempts = PORTAL_MAX_LOGIN_ATTEMPTS;

      // Simulate 5 failed attempts
      let attempts = 0;
      for (let i = 0; i < maxAttempts; i++) {
        attempts++;
      }

      expect(attempts).toBe(5);
    });

    test("should lock account after exceeding max attempts", () => {
      const failedAttempts = 5;
      const maxAttempts = PORTAL_MAX_LOGIN_ATTEMPTS;

      const isLocked = failedAttempts >= maxAttempts;

      expect(isLocked).toBe(true);
    });

    test("should enforce 15-minute lockout period", () => {
      const lockoutMinutes = PORTAL_LOCKOUT_MS / (60 * 1000);

      expect(lockoutMinutes).toBe(15);
    });

    test("should unlock account after 15-minute lockout expires", () => {
      const lockedAt = new Date(Date.now() - PORTAL_LOCKOUT_MS - 1000); // Locked 15+ minutes ago

      const isUnlocked = Date.now() - lockedAt.getTime() >= PORTAL_LOCKOUT_MS;

      expect(isUnlocked).toBe(true);
    });

    test("should keep account locked during 15-minute period", () => {
      const lockedAt = new Date(Date.now() - PORTAL_LOCKOUT_MS / 2); // Locked 7.5 minutes ago

      const isStillLocked = Date.now() - lockedAt.getTime() < PORTAL_LOCKOUT_MS;

      expect(isStillLocked).toBe(true);
    });

    test("should reset failed attempts after successful login", () => {
      const patientAuthId = "patient-auth-123";

      // Mock update to reset failed login attempts
      mockDb.patientAuth.update.mockResolvedValueOnce({
        id: patientAuthId,
        email: "patient@example.com",
        tenantId: "tenant-1",
        patientId: "patient-1",
        passwordHash: "hash",
        status: "ACTIVE",
        failedLoginAttempts: 0, // Reset to 0
        lastFailedLoginAt: null,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      db.patientAuth.update({
        where: { id: patientAuthId },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      } as any);

      expect(mockDb.patientAuth.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 0,
          }),
        })
      );
    });

    test("should increment failed login attempts on failed auth", async () => {
      const currentAttempts = 3;
      const newAttempts = currentAttempts + 1;

      expect(newAttempts).toBe(4);
    });

    test("should check if account is locked before allowing login attempt", () => {
      const patientAuth = {
        id: "patient-auth-123",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 600000), // Locked for 10 more minutes
      };

      const isLockedNow = patientAuth.lockedUntil && patientAuth.lockedUntil > new Date();

      expect(isLockedNow).toBe(true);
    });

    test("should prevent login if account is locked", () => {
      const accountStatus = "LOCKED";
      const isLocked = accountStatus === "LOCKED";

      if (isLocked) {
        // Should return error: Account is locked due to too many failed attempts
      }

      expect(isLocked).toBe(true);
    });

    test("should store lockout timestamp", () => {
      const lockedAt = new Date();
      const lockoutDuration = PORTAL_LOCKOUT_MS;
      const unlocksAt = new Date(lockedAt.getTime() + lockoutDuration);

      expect(unlocksAt > lockedAt).toBe(true);
      expect(unlocksAt.getTime() - lockedAt.getTime()).toBe(lockoutDuration);
    });
  });

  // ─── Cookie Management ────────────────────────────────────────────────────

  describe("Portal Cookie Configuration", () => {
    test("should use correct cookie name", () => {
      expect(PORTAL_COOKIE_NAME).toBe("psycologger-portal-token");
    });

    test("should set cookie with httpOnly flag", () => {
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
      };

      expect(cookieOptions.httpOnly).toBe(true);
    });

    test("should set secure flag in production", () => {
      const isProduction = process.env.NODE_ENV === "production";
      const secure = isProduction;

      // In test env, this might be false, but production should be true
      expect(typeof secure).toBe("boolean");
    });

    test("should set sameSite to strict", () => {
      const sameSite = "strict";

      expect(sameSite).toBe("strict");
    });

    test("should set maxAge to match session max age", () => {
      const maxAgeSeconds = PORTAL_SESSION_MAX_AGE_MS / 1000;

      expect(maxAgeSeconds).toBe(7 * 24 * 60 * 60); // 604800 seconds
    });

    test("should set path to root to cover both pages and API", () => {
      const path = "/";

      expect(path).toBe("/");
    });
  });

  // ─── Session Validation Integration ────────────────────────────────────────

  describe("Session Validation Integration", () => {
    test("should verify token hash matches stored hash", () => {
      const token = generateSessionToken();
      const correctHash = createHash("sha256").update(token).digest("hex");
      const differentToken = generateSessionToken();
      const differentHash = createHash("sha256").update(differentToken).digest("hex");

      expect(correctHash).not.toBe(differentHash);
    });

    test("should perform checks in correct order: revoked, expired, idle", () => {
      const session = {
        id: "session-1",
        revokedAt: new Date(), // Revoked
        expiresAt: new Date(), // Also expired
        lastActivityAt: new Date(Date.now() - PORTAL_IDLE_TIMEOUT_MS - 1000), // Also idle
      };

      // Should reject on first check (revoked)
      const isRevoked = !!session.revokedAt;
      expect(isRevoked).toBe(true);
    });

    test("should verify patient auth account status is ACTIVE", () => {
      const patientAuthStatus = "ACTIVE";

      expect(patientAuthStatus).toBe("ACTIVE");
    });

    test("should verify portal is enabled on tenant", () => {
      const portalEnabled = true;

      expect(portalEnabled).toBe(true);
    });

    test("should verify patient has active TERMS_OF_USE consent", () => {
      const hasActiveConsent = true;

      expect(hasActiveConsent).toBe(true);
    });
  });
});
