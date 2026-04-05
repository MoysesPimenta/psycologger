/**
 * CPF Encryption Utilities — Psycologger
 *
 * Provides application-level encryption for Brazilian CPF (tax ID) fields.
 * Uses the existing AES-256-GCM encryption from `crypto.ts` for confidentiality
 * and HMAC-SHA256 for a blind index that supports equality searches.
 *
 * ## Storage format
 *
 * Encrypted CPFs are stored in the existing `cpf` column as:
 *   `enc:v1:<base64-encrypted-cpf>`
 *
 * The `enc:v1:` prefix distinguishes encrypted values from plaintext
 * (important during the migration period when both may exist).
 *
 * ## Blind index
 *
 * Not yet added to the schema — when CPF search is needed, add a
 * `cpfBlindIndex String?` column and populate it with the HMAC.
 * This allows `WHERE cpfBlindIndex = hmac(input)` queries without
 * exposing the actual CPF.
 *
 * ## Migration
 *
 * Run `encryptExistingCpfs()` (or the `/api/v1/cron/encrypt-cpfs` endpoint)
 * to encrypt all existing plaintext CPFs. This is idempotent — already-encrypted
 * values are skipped.
 */

import { encrypt, decrypt } from "./crypto";
import { createHmac } from "crypto";

const CPF_ENCRYPTED_PREFIX = "enc:v1:";

/**
 * Check if a CPF value is already encrypted.
 */
export function isCpfEncrypted(value: string): boolean {
  return value.startsWith(CPF_ENCRYPTED_PREFIX);
}

/**
 * Normalize a CPF string by removing formatting (dots, dashes).
 * "123.456.789-00" → "12345678900"
 */
function normalizeCpf(cpf: string): string {
  return cpf.replace(/[.\-\s]/g, "");
}

/**
 * Encrypt a CPF value for storage.
 * Input can be formatted ("123.456.789-00") or unformatted ("12345678900").
 * Returns the encrypted string with prefix, or null if input is null/empty.
 */
export async function encryptCpf(cpf: string | null | undefined): Promise<string | null> {
  if (!cpf || cpf.trim() === "") return null;

  // Don't double-encrypt
  if (isCpfEncrypted(cpf)) return cpf;

  const normalized = normalizeCpf(cpf);
  if (normalized.length === 0) return null;

  const encrypted = await encrypt(normalized);
  return `${CPF_ENCRYPTED_PREFIX}${encrypted}`;
}

/**
 * Decrypt a CPF value from storage.
 * Handles both encrypted (prefixed) and plaintext (legacy) values.
 * Returns the raw CPF digits (no formatting).
 */
export async function decryptCpf(storedValue: string | null | undefined): Promise<string | null> {
  if (!storedValue || storedValue.trim() === "") return null;

  // Legacy plaintext — return as-is (normalized)
  if (!isCpfEncrypted(storedValue)) {
    return normalizeCpf(storedValue);
  }

  // Strip prefix and decrypt
  const encryptedPayload = storedValue.slice(CPF_ENCRYPTED_PREFIX.length);
  return decrypt(encryptedPayload);
}

/**
 * Format a CPF for display: "12345678900" → "123.456.789-00"
 */
export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf; // Return as-is if not a valid CPF length
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Compute a blind index (HMAC-SHA256) for a CPF, enabling equality searches
 * without exposing the plaintext.
 *
 * Uses a separate key (ENCRYPTION_KEY) to compute the HMAC.
 * The result is a hex string suitable for indexed DB columns.
 */
export function cpfBlindIndex(cpf: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY required for CPF blind index");
  }

  const normalized = normalizeCpf(cpf);
  return createHmac("sha256", key).update(normalized).digest("hex");
}

/**
 * Decrypt a patient record's CPF field in-place.
 * Returns a new object with the cpf field decrypted (or the original if no cpf).
 */
export async function decryptPatientCpf<T extends { cpf?: string | null }>(
  patient: T,
): Promise<T> {
  if (!patient.cpf) return patient;
  const decrypted = await decryptCpf(patient.cpf);
  return { ...patient, cpf: decrypted };
}

/**
 * Decrypt CPF fields for an array of patient records.
 */
export async function decryptPatientCpfs<T extends { cpf?: string | null }>(
  patients: T[],
): Promise<T[]> {
  return Promise.all(patients.map((p) => decryptPatientCpf(p)));
}
