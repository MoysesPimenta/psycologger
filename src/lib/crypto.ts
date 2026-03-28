/**
 * Encryption utilities — Psycologger
 * Uses libsodium (secretbox) for symmetric encryption of integration credentials
 * and other sensitive data at rest.
 */

// We load libsodium lazily since it requires wasm init
let _sodium: typeof import("libsodium-wrappers") | null = null;

async function getSodium() {
  if (!_sodium) {
    const sodium = await import("libsodium-wrappers");
    await sodium.ready;
    _sodium = sodium;
  }
  return _sodium;
}

function getEncryptionKey(): Uint8Array {
  const keyBase64 = process.env.ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (256-bit), base64-encoded");
  }
  return new Uint8Array(key);
}

/**
 * Encrypt a string value using secretbox.
 * Returns base64-encoded nonce+ciphertext.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const sodium = await getSodium();
  const key = getEncryptionKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    key
  );
  // Prepend nonce to ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return Buffer.from(combined).toString("base64");
}

/**
 * Decrypt a value previously encrypted with encrypt().
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  const sodium = await getSodium();
  const key = getEncryptionKey();
  const combined = new Uint8Array(Buffer.from(encryptedBase64, "base64"));
  const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
  const nonce = combined.slice(0, nonceLength);
  const ciphertext = combined.slice(nonceLength);
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  if (!plaintext) throw new Error("Decryption failed — invalid key or corrupted data");
  return sodium.to_string(plaintext);
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
 * Usage: node -e "require('./src/lib/crypto').generateKey().then(console.log)"
 */
export async function generateKey(): Promise<string> {
  const sodium = await getSodium();
  const key = sodium.randombytes_buf(32);
  return Buffer.from(key).toString("base64");
}

/**
 * Mask a sensitive string for display (e.g., API keys).
 * Returns first 4 chars + '...' + last 4 chars.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
