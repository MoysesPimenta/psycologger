/**
 * Patient notes encryption helpers — Psycologger
 *
 * `Patient.notes` (non-clinical header notes) stores plaintext. Per security
 * invariants, patient notes must be encrypted at rest with AES-256-GCM,
 * the same primitive used for clinical notes and journal entries.
 *
 * Migration strategy (same as clinical-notes.ts):
 *   - Encrypted values are written with a known sentinel prefix `enc:v1:`
 *     followed by the base64 GCM payload produced by `crypto.encrypt()`.
 *   - Reads detect the prefix and decrypt; legacy plaintext rows are
 *     returned unchanged so existing data keeps rendering during the
 *     online backfill.
 *   - A backfill job (cron route) encrypts every legacy row and writes it back.
 *   - Once all rows are encrypted, optionally set PATIENT_NOTES_REJECT_PLAINTEXT=1
 *     to harden after the cron confirms zero remaining rows.
 */

import { encrypt, decrypt } from "./crypto";

const SENTINEL = "enc:v1:";

export function isEncryptedPatientNotes(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(SENTINEL);
}

/** Encrypt a patient note for storage. Returns the sentinel-prefixed payload. */
export async function encryptPatientNotes(plaintext: string | null | undefined): Promise<string | null> {
  if (plaintext == null) return null;
  // Defense-in-depth: never double-encrypt.
  if (isEncryptedPatientNotes(plaintext)) return plaintext;
  const ciphertext = await encrypt(plaintext);
  return `${SENTINEL}${ciphertext}`;
}

/**
 * Decrypt a patient note for read. Legacy plaintext rows (no sentinel) are
 * returned unchanged so the system stays online during backfill. If the
 * sentinel is present but decryption fails, the error is propagated — we do
 * not silently surface a corrupted record as plaintext.
 */
export async function decryptPatientNotes(stored: string | null | undefined): Promise<string | null> {
  if (stored == null) return null;
  if (!isEncryptedPatientNotes(stored)) {
    // Legacy plaintext rows are returned unchanged so the system stays online
    // during backfill. In production, log a structured warning so we can drive
    // the encryption migration to completion.
    if (process.env.NODE_ENV === "production") {
      console.warn("[patient-notes] plaintext note read in production", {
        sentinel: SENTINEL,
      });
      if (process.env.PATIENT_NOTES_REJECT_PLAINTEXT === "1") {
        throw new Error(
          "Plaintext patient note encountered after migration cutoff. Run the encrypt-patient-notes cron and retry.",
        );
      }
    }
    return stored;
  }
  return decrypt(stored.slice(SENTINEL.length));
}

/** Map a record's notes field through decryptPatientNotes, returning a shallow copy. */
export async function withDecryptedPatientNotes<T extends { notes: string | null }>(
  record: T,
): Promise<T> {
  return { ...record, notes: await decryptPatientNotes(record.notes) };
}
