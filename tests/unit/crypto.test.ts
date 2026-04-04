/**
 * Unit tests for encryption/decryption and key rotation — src/lib/crypto.ts
 */

import { randomBytes } from "crypto";

// Generate test keys
const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

// Set up environment before importing the module
process.env.ENCRYPTION_KEY = KEY_A;

import { encrypt, decrypt, encryptJson, decryptJson, needsReEncryption, reEncrypt, maskSecret } from "@/lib/crypto";

describe("crypto", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY_A;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
  });

  describe("encrypt/decrypt", () => {
    it("should encrypt and decrypt a simple string", async () => {
      const plaintext = "Hello, Psycologger!";
      const encrypted = await encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe("string");

      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt and decrypt an empty string", async () => {
      const encrypted = await encrypt("");
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe("");
    });

    it("should encrypt and decrypt unicode text", async () => {
      const plaintext = "Olá mundo! Psicólogo — anotações clínicas";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertexts for the same plaintext (random IV)", async () => {
      const plaintext = "same input";
      const a = await encrypt(plaintext);
      const b = await encrypt(plaintext);
      expect(a).not.toBe(b);
    });

    it("should fail to decrypt with tampered data", async () => {
      const encrypted = await encrypt("sensitive data");
      const buf = Buffer.from(encrypted, "base64");
      buf[buf.length - 1] ^= 0xff;
      const tampered = buf.toString("base64");
      await expect(decrypt(tampered)).rejects.toThrow();
    });

    it("should fail to decrypt with data that is too short", async () => {
      const shortData = Buffer.from([0x01, 0x02, 0x03]).toString("base64");
      await expect(decrypt(shortData)).rejects.toThrow();
    });

    it("should throw when ENCRYPTION_KEY is missing", async () => {
      const original = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      await expect(encrypt("test")).rejects.toThrow("ENCRYPTION_KEY");
      process.env.ENCRYPTION_KEY = original;
    });
  });

  describe("encryptJson/decryptJson", () => {
    it("should encrypt and decrypt JSON objects", async () => {
      const obj = { patientId: "123", notes: "Sessão produtiva", mood: 8 };
      const encrypted = await encryptJson(obj);
      const decrypted = await decryptJson(encrypted);
      expect(decrypted).toEqual(obj);
    });

    it("should handle arrays", async () => {
      const arr = [1, "two", { three: true }];
      const encrypted = await encryptJson(arr);
      const decrypted = await decryptJson(encrypted);
      expect(decrypted).toEqual(arr);
    });
  });

  describe("key rotation", () => {
    it("should decrypt data encrypted with previous key when ENCRYPTION_KEY_PREVIOUS is set", async () => {
      process.env.ENCRYPTION_KEY = KEY_A;
      const encrypted = await encrypt("rotated secret");

      process.env.ENCRYPTION_KEY = KEY_B;
      process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;

      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe("rotated secret");
    });

    it("should encrypt new data with the current key after rotation", async () => {
      process.env.ENCRYPTION_KEY = KEY_B;
      process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;

      const encrypted = await encrypt("new data");

      delete process.env.ENCRYPTION_KEY_PREVIOUS;
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe("new data");
    });

    it("should fail to decrypt when wrong key is used and no previous key", async () => {
      process.env.ENCRYPTION_KEY = KEY_A;
      const encrypted = await encrypt("secret");

      process.env.ENCRYPTION_KEY = KEY_B;
      delete process.env.ENCRYPTION_KEY_PREVIOUS;

      await expect(decrypt(encrypted)).rejects.toThrow();
    });

    it("needsReEncryption returns false for current-key data", async () => {
      const encrypted = await encrypt("current key data");
      const needs = await needsReEncryption(encrypted);
      expect(needs).toBe(false);
    });

    it("reEncrypt should re-encrypt data with the current key", async () => {
      process.env.ENCRYPTION_KEY = KEY_A;
      const original = await encrypt("re-encrypt me");

      process.env.ENCRYPTION_KEY = KEY_B;
      process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;

      const reEncrypted = await reEncrypt(original);

      delete process.env.ENCRYPTION_KEY_PREVIOUS;
      const decrypted = await decrypt(reEncrypted);
      expect(decrypted).toBe("re-encrypt me");
    });
  });

  describe("maskSecret", () => {
    it("should mask long secrets", () => {
      expect(maskSecret("re_1234567890abcdef")).toBe("re_1...cdef");
    });

    it("should fully mask short secrets", () => {
      expect(maskSecret("abc")).toBe("****");
      expect(maskSecret("12345678")).toBe("****");
    });
  });
});
