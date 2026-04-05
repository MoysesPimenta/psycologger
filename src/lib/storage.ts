/**
 * Supabase Storage helper — uses the REST API directly, no SDK needed.
 *
 * Required env vars (add to Vercel + .env.local):
 *   SUPABASE_URL           https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY   service_role secret key (from Supabase → Settings → API)
 *
 * Bucket: "session-files" — create it in Supabase Dashboard → Storage (private bucket).
 */

const SUPABASE_URL       = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
const BUCKET             = "session-files";

function storageBase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      "File storage not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to your environment variables."
    );
  }
  return `${SUPABASE_URL}/storage/v1`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    apikey: SUPABASE_SERVICE_KEY,
  };
}

/** Upload a file buffer to Supabase Storage. Returns the storage key (path). */
export async function uploadFile(opts: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  storageKey: string; // e.g. "tenant-id/session-id/uuid-filename.pdf"
}): Promise<string> {
  // Validate storage key to prevent path traversal
  if (
    opts.storageKey.includes("..") ||
    opts.storageKey.startsWith("/") ||
    /[<>:"|?*\x00-\x1f]/.test(opts.storageKey)
  ) {
    throw new Error("Invalid storage key: path traversal or invalid characters detected");
  }

  // Enforce maximum upload size
  const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
  if (opts.buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(
      `File exceeds maximum size of ${MAX_UPLOAD_SIZE_BYTES} bytes (got ${opts.buffer.length})`
    );
  }

  const base = storageBase();
  const res = await fetch(`${base}/object/${BUCKET}/${opts.storageKey}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": opts.mimeType,
      "x-upsert": "true",
    },
    body: opts.buffer as unknown as BodyInit,
  });

  if (!res.ok) {
    // Do not log response body — it may contain internal details or keys
    console.error(`[storage] Upload failed: HTTP ${res.status}`);
    throw new Error(`Storage upload failed: ${res.status}`);
  }

  return opts.storageKey;
}

/** Generate a signed URL for downloading a private file (valid 1 hour). */
export async function signedDownloadUrl(storageKey: string): Promise<string> {
  if (storageKey.includes("..") || storageKey.startsWith("/")) {
    throw new Error("Invalid storage key: path traversal detected");
  }
  const base = storageBase();
  const res = await fetch(`${base}/object/sign/${BUCKET}/${storageKey}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
  });

  if (!res.ok) throw new Error(`Failed to generate signed URL: ${res.status}`);
  const json = await res.json();
  return `${SUPABASE_URL}/storage/v1${json.signedURL}`;
}

/** Delete a file from Supabase Storage. */
export async function deleteFile(storageKey: string): Promise<void> {
  if (storageKey.includes("..") || storageKey.startsWith("/")) {
    throw new Error("Invalid storage key: path traversal detected");
  }
  const base = storageBase();
  const res = await fetch(`${base}/object/${BUCKET}/${storageKey}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Storage delete failed: ${res.status} ${text}`);
  }
}

/** Check whether storage is configured (used to show/hide the upload UI). */
export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}
