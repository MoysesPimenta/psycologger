/**
 * Magic-byte MIME type validation — Psycologger
 *
 * Verifies that a file's actual content matches its declared MIME type
 * by inspecting the first few bytes (magic numbers / file signatures).
 * This prevents MIME-type spoofing on uploads.
 */

interface MagicSignature {
  mime: string;
  bytes: number[];
  offset?: number;
}

/**
 * Known file signatures for the types we accept.
 * Each entry maps a byte sequence (at an optional offset) to a MIME type.
 */
const SIGNATURES: MagicSignature[] = [
  // PDF: %PDF
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },

  // JPEG: FF D8 FF
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },

  // GIF: GIF87a or GIF89a
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },

  // WebP: RIFF....WEBP
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },

  // HEIC/HEIF: ....ftyp at offset 4
  { mime: "image/heic", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },

  // MS Word (legacy .doc): D0 CF 11 E0 (OLE2)
  { mime: "application/msword", bytes: [0xd0, 0xcf, 0x11, 0xe0] },

  // DOCX/XLSX/PPTX (ZIP-based Office): PK (50 4B 03 04)
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
];

/**
 * Detect the MIME type of a file from its first bytes.
 * Returns the detected MIME type, or null if unrecognised.
 */
export function detectMimeType(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;

    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mime;
  }
  return null;
}

/**
 * Check whether a buffer's magic bytes are consistent with the declared MIME type.
 *
 * Rules:
 * - If we can detect the MIME from bytes and it doesn't match declared → reject
 * - DOCX detection is fuzzy (all Office Open XML are ZIP), so we accept any
 *   Office type if the magic matches PK
 * - If we can't detect (unknown format) → accept (conservative; allow through)
 */
export function validateMimeType(buffer: Buffer, declaredMime: string): boolean {
  const detected = detectMimeType(buffer);

  // Could not detect — allow through (conservative approach)
  if (!detected) return true;

  // Exact match
  if (detected === declaredMime) return true;

  // JPEG variants
  if (detected === "image/jpeg" && declaredMime === "image/jpg") return true;

  // HEIC variants
  if (detected === "image/heic" && declaredMime === "image/heif") return true;

  // Office Open XML: all are ZIP-based, so PK signature is shared
  const officeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  if (
    detected === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    officeTypes.includes(declaredMime)
  ) {
    return true;
  }

  // WebP: RIFF header is shared with AVI, WAV, etc. Verify the "WEBP" tag at offset 8.
  if (detected === "image/webp") {
    if (buffer.length >= 12) {
      const webpTag = buffer.slice(8, 12).toString("ascii");
      if (webpTag !== "WEBP") return false; // RIFF file but not WebP (e.g., AVI, WAV)
    } else {
      return false; // Buffer too short to confirm WebP
    }
    // After confirming it's actually WebP, accept if declared as image/webp
    return declaredMime === "image/webp";
  }

  return false;
}
