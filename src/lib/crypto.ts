/**
 * Encryption utilities — Psycologger
 * Uses Node.js built-in crypto (AES-256-GCM) for symmetric encryption
 * of sensitive data at rest (journal entries, integration credentials).
 *
 * AES-256-GCM provides authenticated encryption — both confidentiality
 * and integrity. No external dependencies (no WASM, no libsodium).
 *
 * ## Key rotation support
 *
 * Encrypted payloads include a 1-byte version prefix:
 *   - Version 0x01: AES-256-GCM with the current ENCRYPTION_KEY
 *
 * On decryption, the version byte determines which key to use.
 * Old keys can be provided via ENCRYPTION_KEY_PREVIOUS for rotation:
 *   1. Set ENCRYPTION_KEY to the new key, ENCRYPTION_KEY_PREVIOUS to the old key.
 *   2. New encryptions use the new key (version 0x01).
 *   3. Old data still decrypts because the previous key is tried on failure.
 *   4. Re-encrypt old data over time (e.g., via a migration script).
 *   5. Once all data is re-encrypted, remove ENCRYPTION_KEY_PREVIOUS.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const VERSION_BYTE = 0x01; // Current encryption version

function parseKey(base64Key: string, envName: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error(`${envName} must be 32 bytes (256-bit), base64-encoded`);
  }
  return key;
}

function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return parseKey(keyBase64, "ENCRYPTION_KEY");
}

function getPreviousEncryptionKey(): Buffer | null {
  const keyBase64 = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (!keyBase64) return null;
  try {
    return parseKey(keyBase64, "ENCRYPTION_KEY_PREVIOUS");
  } catch {
    console.warn("[crypto] ENCRYPTION_KEY_PREVIOUS is set but invalid — ignoring");
    return null;
  }
}

/**
 * Check if an encrypted payload uses the versioned format.
 * Versioned payloads start with version byte 0x01.
 * Legacy payloads (pre-rotation) start with the raw IV bytes.
 */
function isVersionedPayload(combined: Buffer): boolean {
  return combined.length > 0 && combined[0] === VERSION_BYTE;
}

/**
 * Core encryption with a specific key.
 */
function encryptWithKey(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: version (1 byte) + IV (12 bytes) + authTag (16 bytes) + ciphertext
  return Buffer.concat([Buffer.from([VERSION_BYTE]), iv, authTag, encrypted]);
}

/**
 * Core decryption with a specific key.
 */
function decryptWithKey(combined: Buffer, key: Buffer, hasVersionByte: boolean): string {
  const offset = hasVersionByte ? 1 : 0;
  const minLength = offset + IV_LENGTH + AUTH_TAG_LENGTH;

  if (combined.length < minLength) {
    throw new Error("Decryption failed — data too short");
  }

  const iv = combined.subarray(offset, offset + IV_LENGTH);
  const authTag = combined.subarray(offset + IV_LENGTH, offset + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(offset + IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Encrypt a string value using AES-256-GCM.
 * Returns base64-encoded: version (1 byte) + IV (12 bytes) + authTag (16 bytes) + ciphertext.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = getEncryptionKey();
  const combined = encryptWithKey(plaintext, key);
  return combined.toString("base64");
}

/**
 * Decrypt a value previously encrypted with encrypt().
 * Supports both versioned (new) and legacy (old) formats.
 * If decryption with the current key fails and ENCRYPTION_KEY_PREVIOUS is set,
 * retries with the previous key for seamless key rotation.
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  const currentKey = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  const versioned = isVersionedPayload(combined);

  // Try current key first with detected format
  try {
    return decryptWithKey(combined, currentKey, versioned);
  } catch {
    // Continue to fallbacks
  }

  // Try legacy format (no version byte) with current key
  if (versioned) {
    try {
      return decryptWithKey(combined, currentKey, false);
    } catch {
      // Continue to previous key
    }
  }

  // Try previous key (both formats)
  const previousKey = getPreviousEncryptionKey();
  if (previousKey) {
    // Try previous key with versioned format
    try {
      return decryptWithKey(combined, previousKey, versioned);
    } catch {
      // Continue
    }

    // Try previous key with legacy format
    try {
      return decryptWithKey(combined, previousKey, false);
    } catch {
      // Fall through to error
    }
  }

  throw new Error("Decryption failed — unable to decrypt with any available key");
}

/**
 * Check if an encrypted value needs re-encryption (i.e., uses the old format or old key).
 * Returns true if the value should be re-encrypted with the current key.
 */
export async function needsReEncryption(encryptedBase64: string): Promise<boolean> {
  const combined = Buffer.from(encryptedBase64, "base64");

  // If it doesn't have the version byte, it's legacy format
  if (!isVersionedPayload(combined)) return true;

  // Try to decrypt with current key — if it fails, needs re-encryption
  const currentKey = getEncryptionKey();
  try {
    decryptWithKey(combined, currentKey, true);
    return false; // Current key works
  } catch {
    return true; // Needs re-encryption with current key
  }
}

/**
 * Re-encrypt a value with the current key.
 * Decrypts with any available key, then encrypts with the current key.
 */
export async function reEncrypt(encryptedBase64: string): Promise<string> {
  const plaintext = await decrypt(encryptedBase64);
  return encrypt(plaintext);
}

/**
 * Encrypt arbitrary binary data with the current ENCRYPTION_KEY.
 * Returns the same on-the-wire format as encrypt(): version + IV + tag + ct.
 * Use this for attachments and other non-string payloads.
 */
export async function encryptBuffer(plaintext: Buffer): Promise<Buffer> {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION_BYTE]), iv, authTag, ct]);
}

/**
 * Decrypt a buffer previously encrypted with encryptBuffer(). Supports the
 * same key-rotation fallback chain as decrypt().
 */
export async function decryptBuffer(combined: Buffer): Promise<Buffer> {
  const tryWith = (key: Buffer, hasVersion: boolean): Buffer => {
    const offset = hasVersion ? 1 : 0;
    const minLength = offset + IV_LENGTH + AUTH_TAG_LENGTH;
    if (combined.length < minLength) throw new Error("ciphertext too short");
    const iv = combined.subarray(offset, offset + IV_LENGTH);
    const authTag = combined.subarray(
      offset + IV_LENGTH,
      offset + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const ciphertext = combined.subarray(offset + IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  };
  const versioned = isVersionedPayload(combined);
  const currentKey = getEncryptionKey();
  try {
    return tryWith(currentKey, versioned);
  } catch {}
  if (versioned) {
    try {
      return tryWith(currentKey, false);
    } catch {}
  }
  const prev = getPreviousEncryptionKey();
  if (prev) {
    try {
      return tryWith(prev, versioned);
    } catch {}
    try {
      return tryWith(prev, false);
    } catch {}
  }
  throw new Error("Decryption failed — unable to decrypt buffer with any available key");
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
