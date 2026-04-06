/**
 * Clinical note encryption helpers — Psycologger
 *
 * `ClinicalSession.noteText` (and `SessionRevision.noteText`) historically
 * stored plaintext. Per the documented security invariants, clinical notes
 * must be encrypted at rest with AES-256-GCM, the same primitive used for
 * Journal entries.
 *
 * To migrate without a destructive schema change:
 *   - Encrypted values are written with a known sentinel prefix `enc:v1:`
 *     followed by the base64 GCM payload produced by `crypto.encrypt()`.
 *   - Reads detect the prefix and decrypt; legacy plaintext rows are
 *     returned unchanged so existing data keeps rendering during the
 *     online backfill.
 *   - A backfill job (or a one-shot script) can call `encryptNote` on every
 *     legacy row and write it back.
 */

import { encrypt, decrypt } from "./crypto";

const SENTINEL = "enc:v1:";

export function isEncryptedNote(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(SENTINEL);
}

/** Encrypt a clinical note for storage. Returns the sentinel-prefixed payload. */
export async function encryptNote(plaintext: string): Promise<string> {
  // Defense-in-depth: never double-encrypt.
  if (isEncryptedNote(plaintext)) return plaintext;
  const ciphertext = await encrypt(plaintext);
  return `${SENTINEL}${ciphertext}`;
}

/**
 * Decrypt a clinical note for read. Legacy plaintext rows (no sentinel) are
 * returned unchanged so the system stays online during backfill. If the
 * sentinel is present but decryption fails, the error is propagated — we do
 * not silently surface a corrupted record as plaintext.
 */
export async function decryptNote(stored: string | null | undefined): Promise<string> {
  if (stored == null) return "";
  if (!isEncryptedNote(stored)) return stored; // legacy plaintext passthrough
  return decrypt(stored.slice(SENTINEL.length));
}

/** Map a record's noteText field through decryptNote, returning a shallow copy. */
export async function withDecryptedNote<T extends { noteText: string | null }>(
  record: T,
): Promise<T> {
  return { ...record, noteText: await decryptNote(record.noteText) };
}
