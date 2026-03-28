/**
 * Unit tests — Encryption utilities (src/lib/crypto.ts)
 *
 * NOTE: These tests require the ENCRYPTION_KEY env var to be set.
 * For CI, generate one with: node -e "require('./src/lib/crypto').generateKey().then(console.log)"
 * and set it as a secret.
 */

import { encrypt, decrypt, encryptJson, decryptJson, maskSecret } from "@/lib/crypto";

// Use a fixed test key (32 bytes base64) — never use in production
const TEST_KEY = Buffer.alloc(32, "psycologger-test").toString("base64");

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("Encryption — encrypt/decrypt round trip", () => {
  test("encrypts and decrypts a plain string", async () => {
    const plaintext = "123.456.789-00";
    const ciphertext = await encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    const result = await decrypt(ciphertext);
    expect(result).toBe(plaintext);
  });

  test("encrypts and decrypts a CPF with special chars", async () => {
    const cpf = "000.000.000-00";
    const enc = await encrypt(cpf);
    const dec = await decrypt(enc);
    expect(dec).toBe(cpf);
  });

  test("encrypts and decrypts a long clinical note", async () => {
    const note = "Paciente apresentou melhora significativa. ".repeat(100);
    const enc = await encrypt(note);
    const dec = await decrypt(enc);
    expect(dec).toBe(note);
  });

  test("two encryptions of the same plaintext produce different ciphertexts (random nonce)", async () => {
    const plaintext = "sensitive-value";
    const enc1 = await encrypt(plaintext);
    const enc2 = await encrypt(plaintext);
    expect(enc1).not.toBe(enc2);
    // Both should decrypt correctly
    expect(await decrypt(enc1)).toBe(plaintext);
    expect(await decrypt(enc2)).toBe(plaintext);
  });

  test("encrypted output is base64-encoded", async () => {
    const enc = await encrypt("test");
    const buf = Buffer.from(enc, "base64");
    expect(buf.length).toBeGreaterThan(0);
    // Re-encoding should match
    expect(buf.toString("base64")).toBe(enc);
  });
});

describe("Encryption — JSON helpers", () => {
  test("encryptJson/decryptJson round trip with object", async () => {
    const obj = { googleAccessToken: "ya29.xxx", refreshToken: "1//xxx", expiresAt: 1700000000 };
    const enc = await encryptJson(obj);
    const dec = await decryptJson<typeof obj>(enc);
    expect(dec).toEqual(obj);
  });

  test("encryptJson handles nested objects", async () => {
    const obj = { credentials: { apiKey: "secret-key", baseUrl: "https://api.example.com" } };
    const enc = await encryptJson(obj);
    const dec = await decryptJson<typeof obj>(enc);
    expect(dec.credentials.apiKey).toBe("secret-key");
  });

  test("encryptJson handles arrays", async () => {
    const obj = { tags: ["a", "b", "c"], count: 3 };
    const enc = await encryptJson(obj);
    const dec = await decryptJson<typeof obj>(enc);
    expect(dec.tags).toEqual(["a", "b", "c"]);
  });
});

describe("Encryption — error cases", () => {
  test("decrypt throws on tampered ciphertext", async () => {
    const enc = await encrypt("test value");
    const buf = Buffer.from(enc, "base64");
    // Flip a byte in the ciphertext portion (after the 24-byte nonce)
    buf[30] = buf[30] ^ 0xff;
    const tampered = buf.toString("base64");
    await expect(decrypt(tampered)).rejects.toThrow();
  });

  test("decrypt throws when ENCRYPTION_KEY is wrong", async () => {
    const enc = await encrypt("test value");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, "wrong-key-value-").toString("base64");
    await expect(decrypt(enc)).rejects.toThrow();
    // Restore
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  test("encrypt throws when ENCRYPTION_KEY is not set", async () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    await expect(encrypt("test")).rejects.toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = saved;
  });

  test("encrypt throws when ENCRYPTION_KEY is wrong length", async () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, "short").toString("base64"); // 16 bytes, not 32
    await expect(encrypt("test")).rejects.toThrow();
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });
});

describe("maskSecret", () => {
  test("masks a long secret", () => {
    const masked = maskSecret("sk_live_abcdefghijklmnop");
    expect(masked).toContain("...");
    expect(masked).not.toBe("sk_live_abcdefghijklmnop");
    expect(masked.startsWith("sk_l")).toBe(true);
    expect(masked.endsWith("mnop")).toBe(true);
  });

  test("masks a short secret as ****", () => {
    expect(maskSecret("abc")).toBe("****");
    expect(maskSecret("12345678")).toBe("****");
  });

  test("returns **** for exactly 8 chars", () => {
    expect(maskSecret("12345678")).toBe("****");
  });

  test("reveals first 4 and last 4 for longer secrets", () => {
    const secret = "re_eYWqe76C_BM6cxhWh6fvRknmciKnQ2TVX";
    const masked = maskSecret(secret);
    expect(masked.startsWith("re_e")).toBe(true);
    expect(masked.endsWith(secret.slice(-4))).toBe(true); // last 4 chars of original
    expect(masked).toContain("...");
    expect(masked.length).toBeLessThan(secret.length); // should be shorter
  });
});
