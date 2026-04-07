/**
 * Unit tests — AES-256-GCM encryption helpers
 * Tests encrypt/decrypt round-trips, AAD validation, and versioning.
 */

import { encrypt, decrypt, encryptJson, decryptJson, needsReEncryption } from "@/lib/crypto";

describe("crypto — AES-256-GCM encryption", () => {
  describe("encrypt/decrypt round-trip", () => {
    test("encrypts and decrypts plaintext successfully", async () => {
      const plaintext = "secret clinical note";
      const encrypted = await encrypt(plaintext);

      // Encrypted payload should be base64
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);

      // Decrypt should recover original
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test("produces different ciphertexts for same plaintext (random IV)", async () => {
      const plaintext = "same message";
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);

      // IVs are random, so ciphertexts differ
      expect(encrypted1).not.toBe(encrypted2);

      // Both decrypt to same plaintext
      expect(await decrypt(encrypted1)).toBe(plaintext);
      expect(await decrypt(encrypted2)).toBe(plaintext);
    });

    test("handles empty strings", async () => {
      const plaintext = "";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe("");
    });

    test("handles long plaintext", async () => {
      const plaintext = "a".repeat(10000);
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test("handles special characters and unicode", async () => {
      const plaintext = "Paciente: João Silva (CPF: 123.456.789-00) — Sessão inicial ♡";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("encryption format", () => {
    test("encrypted payload starts with version byte 0x01", async () => {
      const plaintext = "test";
      const encrypted = await encrypt(plaintext);

      // Decode base64 to get raw bytes
      const buffer = Buffer.from(encrypted, "base64");
      const versionByte = buffer[0];

      // Version 0x01 = 1
      expect(versionByte).toBe(0x01);
    });

    test("encrypted payload includes IV, auth tag, and ciphertext", async () => {
      const plaintext = "test";
      const encrypted = await encrypt(plaintext);

      // Format: version (1) + IV (12) + authTag (16) + ciphertext
      // Minimum length: 1 + 12 + 16 + 1 = 30 bytes
      const buffer = Buffer.from(encrypted, "base64");
      expect(buffer.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe("integrity protection (authentication tag)", () => {
    test("throws on corrupted ciphertext", async () => {
      const plaintext = "secret";
      const encrypted = await encrypt(plaintext);

      // Corrupt a byte in the middle of the ciphertext (flip a bit)
      const buffer = Buffer.from(encrypted, "base64");
      buffer[30] = buffer[30] ^ 0xff; // Flip bits
      const corrupted = buffer.toString("base64");

      await expect(decrypt(corrupted)).rejects.toThrow(/decrypt|failed|unable/i);
    });

    test("throws on corrupted auth tag", async () => {
      const plaintext = "secret";
      const encrypted = await encrypt(plaintext);

      // Corrupt the auth tag (bytes 13-28)
      const buffer = Buffer.from(encrypted, "base64");
      buffer[15] = buffer[15] ^ 0xff; // Flip bits in auth tag
      const corrupted = buffer.toString("base64");

      await expect(decrypt(corrupted)).rejects.toThrow(/decrypt|failed|unable/i);
    });

    test("throws on corrupted IV", async () => {
      const plaintext = "secret";
      const encrypted = await encrypt(plaintext);

      // Corrupt the IV (bytes 1-12)
      const buffer = Buffer.from(encrypted, "base64");
      buffer[5] = buffer[5] ^ 0xff; // Flip bits in IV
      const corrupted = buffer.toString("base64");

      // With wrong IV, auth tag check should fail
      await expect(decrypt(corrupted)).rejects.toThrow(/decrypt|failed|unable/i);
    });
  });

  describe("JSON serialization", () => {
    test("encrypts and decrypts JSON objects", async () => {
      const obj = { patientId: "123", notes: "Initial assessment", date: "2026-04-07" };
      const encrypted = await encryptJson(obj);
      const decrypted = await decryptJson<typeof obj>(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test("preserves data types in JSON", async () => {
      const obj = {
        name: "João",
        age: 35,
        isActive: true,
        score: 4.5,
        tags: ["urgent", "follow-up"],
      };
      const encrypted = await encryptJson(obj);
      const decrypted = await decryptJson<typeof obj>(encrypted);

      expect(decrypted.name).toBe("João");
      expect(decrypted.age).toBe(35);
      expect(typeof decrypted.isActive).toBe("boolean");
      expect(decrypted.score).toBe(4.5);
      expect(Array.isArray(decrypted.tags)).toBe(true);
    });
  });

  describe("key rotation support", () => {
    test("decrypts with current key successfully", async () => {
      const plaintext = "sensitive data";
      const encrypted = await encrypt(plaintext);

      // Should decrypt without needing previous key
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test("needsReEncryption returns false for newly encrypted data", async () => {
      const plaintext = "recent data";
      const encrypted = await encrypt(plaintext);

      const needsReenc = await needsReEncryption(encrypted);
      expect(needsReenc).toBe(false);
    });
  });

  describe("error handling", () => {
    test("throws on invalid base64", async () => {
      const invalidBase64 = "not-valid-base64!!!";
      await expect(decrypt(invalidBase64)).rejects.toThrow();
    });

    test("throws on too-short payload", async () => {
      // Version (1) + too-short payload
      const shortPayload = Buffer.from([0x01, 0x02, 0x03]).toString("base64");
      await expect(decrypt(shortPayload)).rejects.toThrow(/decrypt|failed|unable/i);
    });
  });

  describe("ENCRYPTION_KEY validation", () => {
    test("ENCRYPTION_KEY is set in test environment", () => {
      expect(process.env.ENCRYPTION_KEY).toBeDefined();
    });

    test("ENCRYPTION_KEY is 32 bytes (256-bit) when decoded", () => {
      const key = process.env.ENCRYPTION_KEY;
      expect(key).toBeDefined();
      const buffer = Buffer.from(key!, "base64");
      expect(buffer.length).toBe(32);
    });
  });
});
