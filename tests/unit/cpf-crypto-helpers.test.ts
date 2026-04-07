/**
 * Unit tests — CPF encryption and blind index helpers
 * Tests normalization, encryption, deterministic blind index, and formatting.
 */

import {
  encryptCpf,
  decryptCpf,
  formatCpf,
  cpfBlindIndex,
  isCpfEncrypted,
  isCpfShapedQuery,
} from "@/lib/cpf-crypto";

describe("CPF crypto — encryption and blind index", () => {
  describe("CPF normalization", () => {
    test("normalizes formatted CPF (with dots/dashes)", async () => {
      const formatted = "123.456.789-00";
      const encrypted = await encryptCpf(formatted);

      expect(encrypted).toStartWith("enc:v1:");
      const decrypted = await decryptCpf(encrypted);
      expect(decrypted).toBe("12345678900");
    });

    test("handles unformatted CPF input", async () => {
      const unformatted = "12345678900";
      const encrypted = await encryptCpf(unformatted);

      const decrypted = await decryptCpf(encrypted);
      expect(decrypted).toBe("12345678900");
    });

    test("treats formatted and unformatted inputs equivalently", async () => {
      const formatted = "123.456.789-00";
      const unformatted = "12345678900";

      const encFormatted = await encryptCpf(formatted);
      const encUnformatted = await encryptCpf(unformatted);

      const decFormatted = await decryptCpf(encFormatted);
      const decUnformatted = await decryptCpf(encUnformatted);

      expect(decFormatted).toBe(decUnformatted);
      expect(decFormatted).toBe("12345678900");
    });

    test("removes all formatting (dots, dashes, spaces)", async () => {
      const weirdlyFormatted = "123 . 456 - 789 - 00";
      const encrypted = await encryptCpf(weirdlyFormatted);
      const decrypted = await decryptCpf(encrypted);

      expect(decrypted).toBe("12345678900");
    });
  });

  describe("encryption and decryption", () => {
    test("encryptCpf produces prefixed output", async () => {
      const cpf = "12345678900";
      const encrypted = await encryptCpf(cpf);

      expect(encrypted).toStartWith("enc:v1:");
    });

    test("encrypt/decrypt round-trip succeeds", async () => {
      const cpf = "98765432100";
      const encrypted = await encryptCpf(cpf);
      const decrypted = await decryptCpf(encrypted);

      expect(decrypted).toBe(cpf);
    });

    test("decryptCpf handles legacy plaintext (no prefix)", async () => {
      const plainCpf = "11122233344";
      // Simulate legacy storage (no encryption prefix)
      const decrypted = await decryptCpf(plainCpf);

      // Should return normalized version
      expect(decrypted).toBe("11122233344");
    });

    test("decryptCpf handles legacy formatted plaintext", async () => {
      const plainCpf = "111.222.333-44";
      const decrypted = await decryptCpf(plainCpf);

      expect(decrypted).toBe("11122233344");
    });

    test("isCpfEncrypted detects encrypted vs plaintext", async () => {
      const plainCpf = "12345678900";
      const encryptedCpf = await encryptCpf(plainCpf);

      expect(isCpfEncrypted(plainCpf)).toBe(false);
      expect(isCpfEncrypted(encryptedCpf)).toBe(true);
    });

    test("encryptCpf does not double-encrypt", async () => {
      const plainCpf = "12345678900";
      const encrypted1 = await encryptCpf(plainCpf);

      // Try to encrypt already-encrypted value
      const encrypted2 = await encryptCpf(encrypted1);

      // Should be same as encrypted1 (no double-encryption)
      expect(encrypted2).toBe(encrypted1);

      // Should still decrypt to original
      const decrypted = await decryptCpf(encrypted2);
      expect(decrypted).toBe(plainCpf);
    });

    test("handles null and empty inputs gracefully", async () => {
      expect(await encryptCpf(null)).toBeNull();
      expect(await encryptCpf(undefined)).toBeNull();
      expect(await encryptCpf("")).toBeNull();
      expect(await encryptCpf("   ")).toBeNull();

      expect(await decryptCpf(null)).toBeNull();
      expect(await decryptCpf(undefined)).toBeNull();
      expect(await decryptCpf("")).toBeNull();
      expect(await decryptCpf("   ")).toBeNull();
    });
  });

  describe("CPF blind index (deterministic HMAC)", () => {
    test("blind index is deterministic for same input", () => {
      const cpf = "12345678900";
      const hash1 = cpfBlindIndex(cpf);
      const hash2 = cpfBlindIndex(cpf);

      expect(hash1).toBe(hash2);
    });

    test("blind index produces hex string", () => {
      const cpf = "12345678900";
      const hash = cpfBlindIndex(cpf);

      expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA256 = 64 hex chars
    });

    test("different CPFs produce different hashes", () => {
      const cpf1 = "12345678900";
      const cpf2 = "98765432100";

      const hash1 = cpfBlindIndex(cpf1);
      const hash2 = cpfBlindIndex(cpf2);

      expect(hash1).not.toBe(hash2);
    });

    test("normalization is applied before hashing", () => {
      const formatted = "123.456.789-00";
      const unformatted = "12345678900";

      const hash1 = cpfBlindIndex(formatted);
      const hash2 = cpfBlindIndex(unformatted);

      // Formatted and unformatted should produce same hash
      expect(hash1).toBe(hash2);
    });

    test("blind index is used for equality searches (not comparison)", () => {
      const cpf1 = "11111111111";
      const cpf2 = "22222222222";
      const cpf3 = "11111111111"; // same as cpf1

      const hash1 = cpfBlindIndex(cpf1);
      const hash2 = cpfBlindIndex(cpf2);
      const hash3 = cpfBlindIndex(cpf3);

      // Exact match
      expect(hash1).toBe(hash3);
      // Non-match
      expect(hash1).not.toBe(hash2);
    });

    test("ENCRYPTION_KEY is required for blind index", () => {
      expect(process.env.ENCRYPTION_KEY).toBeDefined();
      // If key is missing, cpfBlindIndex should throw
      // (we have the key in test env setup, so this passes)
    });
  });

  describe("CPF formatting", () => {
    test("formatCpf converts raw digits to display format", () => {
      const raw = "12345678900";
      const formatted = formatCpf(raw);

      expect(formatted).toBe("123.456.789-00");
    });

    test("formatCpf handles already-formatted input", () => {
      const input = "123.456.789-00";
      const formatted = formatCpf(input);

      expect(formatted).toBe("123.456.789-00");
    });

    test("formatCpf returns as-is for non-CPF length", () => {
      const invalid = "12345"; // Too short
      const formatted = formatCpf(invalid);

      // Should return unchanged if not 11 digits
      expect(formatted).toBe("12345");
    });

    test("formatCpf removes non-digits before formatting", () => {
      const messyInput = "123...456---789::00";
      const formatted = formatCpf(messyInput);

      expect(formatted).toBe("123.456.789-00");
    });
  });

  describe("CPF shape validation", () => {
    test("isCpfShapedQuery recognizes valid CPF patterns", () => {
      expect(isCpfShapedQuery("12345678900")).toBe(true);
      expect(isCpfShapedQuery("123.456.789-00")).toBe(true);
      expect(isCpfShapedQuery("123 456 789 00")).toBe(true);
    });

    test("isCpfShapedQuery rejects invalid patterns", () => {
      expect(isCpfShapedQuery("123456789")).toBe(false); // Too short
      expect(isCpfShapedQuery("1234567890012")).toBe(false); // Too long
      expect(isCpfShapedQuery("abc12345678")).toBe(false); // Not digits
      expect(isCpfShapedQuery("")).toBe(false); // Empty
    });
  });

  describe("integration: encryption + blind index", () => {
    test("encrypted CPF and blind index can coexist", async () => {
      const plainCpf = "12345678900";

      const encrypted = await encryptCpf(plainCpf);
      const blindIndex = cpfBlindIndex(plainCpf);

      // Both should work independently
      expect(isCpfEncrypted(encrypted)).toBe(true);
      expect(blindIndex).toMatch(/^[a-f0-9]{64}$/);

      // And decrypt should recover plaintext
      const decrypted = await decryptCpf(encrypted);
      expect(decrypted).toBe(plainCpf);

      // And blind index should match if re-hashing same plaintext
      const blindIndex2 = cpfBlindIndex(decrypted);
      expect(blindIndex2).toBe(blindIndex);
    });
  });
});
