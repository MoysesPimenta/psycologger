/**
 * Encryption utilities — Psycologger
 * Uses Node.js built-in crypto (AES-256-GCM) for symmetric encryption
 * of sensitive data at rest (journal entries, integration credentials).
 *
 * AES-256-GCM provides authenticated encryption — both confidentiality
 * and integrity. No external dependencies (no WASM, no libsodium).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (256-bit), base64-encoded");
  }
  return key;
}

/**
 * Encrypt a string value using AES-256-GCM.
 * Returns base64-encoded: IV (12 bytes) + authTag (16 bytes) + ciphertext.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: IV + authTag + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a value previously encrypted with encrypt().
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Decryption failed — data too short");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Encrypt a JSON-serializable object.
 */
export async function encryptJson(obj: unknown): Promise<string> {
  return encrypt(JSON.stringify(obj));
}

/**
 * Decrypt and parse a JSON-serializable object.
 */
export async function decryptJson<T>(encrypted: string): Promise<T> {
  const json = await decrypt(encrypted);
  return JSON.parse(json) as T;
}

/**
 * Generate a random base64 key suitable for ENCRYPTION_KEY.
 * Usage: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export async function generateKey(): Promise<string> {
  return randomBytes(32).toString("base64");
}

/**
 * Mask a sensitive string for display (e.g., API keys).
 * Returns first 4 chars + '...' + last 4 chars.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
