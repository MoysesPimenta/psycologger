/**
 * Pure helpers for the Resend inbound webhook. Extracted out of the route
 * handler so they can be unit-tested in isolation (no Next request, no DB).
 */

import { createHmac } from "crypto";

export function extractFromEmail(
  from: unknown
): { email: string; name: string | null } {
  if (!from) return { email: "", name: null };
  if (typeof from === "string") {
    const raw = from.trim();
    // Only try to split "Name <email@x>" if angle brackets are actually
    // present. Without this guard a greedy capture mangles plain addresses
    // like "moyses@konektera.com" into name="moyse" + email="s@konektera.com".
    const angle = raw.match(/^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
    if (angle) {
      return {
        email: angle[2].trim().toLowerCase(),
        name: angle[1]?.trim() || null,
      };
    }
    const plain = raw.replace(/^["'\s]+|["'\s]+$/g, "");
    return { email: plain.toLowerCase(), name: null };
  }
  if (typeof from === "object" && from !== null) {
    const f = from as { email?: string; name?: string };
    return {
      email: (f.email ?? "").trim().toLowerCase(),
      name: f.name?.trim() || null,
    };
  }
  return { email: "", name: null };
}

export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd?|enc)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

/**
 * Verify a Svix-signed webhook payload. Svix secrets are prefixed `whsec_`
 * and the body after the prefix is a base64 HMAC key. The signed string is
 * `<svix-id>.<svix-timestamp>.<payload>`. The signature header may contain
 * multiple space-separated `v1,<sig>` entries; we accept any match.
 */
export function verifySvixSignature(
  payload: string,
  timestamp: string,
  signature: string,
  secret: string,
  svixId: string
): boolean {
  try {
    const base64Key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    let keyBytes: Buffer;
    try {
      keyBytes = Buffer.from(base64Key, "base64");
    } catch {
      keyBytes = Buffer.from(base64Key, "utf8");
    }
    const signedContent = `${svixId}.${timestamp}.${payload}`;
    const computed = createHmac("sha256", keyBytes)
      .update(signedContent)
      .digest("base64");
    return signature
      .split(" ")
      .map((s) => s.replace(/^v1,/, ""))
      .some((s) => s === computed);
  } catch {
    return false;
  }
}
