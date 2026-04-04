/**
 * Unit tests for patient auth helpers — src/lib/patient-auth.ts
 * Tests password hashing/verification and token generation.
 */

// Mock Prisma before importing patient-auth (which imports db)
jest.mock("@/lib/db", () => ({ db: {} }));

import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  generateActivationToken,
  generateMagicToken,
} from "@/lib/patient-auth";

describe("patient-auth", () => {
  describe("hashPassword / verifyPassword", () => {
    it("should hash and verify a valid password", async () => {
      const password = "Senh@Forte123!";
      const hash = await hashPassword(password);

      expect(hash).toMatch(/^pbkdf2:sha256:600000:/);
      expect(await verifyPassword(password, hash)).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const hash = await hashPassword("correct-password");
      expect(await verifyPassword("wrong-password", hash)).toBe(false);
    });

    it("should produce different hashes for the same password (random salt)", async () => {
      const password = "same-password";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2);

      // Both should still verify
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });

    it("should handle unicode passwords", async () => {
      const password = "Contraseña_difícil_ñ_ü_ö";
      const hash = await hashPassword(password);
      expect(await verifyPassword(password, hash)).toBe(true);
    });

    it("should reject a malformed stored hash", async () => {
      expect(await verifyPassword("test", "not-a-valid-hash")).toBe(false);
      expect(await verifyPassword("test", "pbkdf2:sha256")).toBe(false);
      expect(await verifyPassword("test", "")).toBe(false);
    });
  });

  describe("token generation", () => {
    it("generateSessionToken should produce unique tokens", () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
      expect(tokens.size).toBe(100);
    });

    it("generateActivationToken should produce base64url strings", () => {
      const token = generateActivationToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThan(20);
    });

    it("generateMagicToken should produce base64url strings", () => {
      const token = generateMagicToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThan(20);
    });
  });
});
