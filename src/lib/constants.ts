/**
 * Application-wide constants — Psycologger
 *
 * Centralises magic numbers and configuration values so they can be
 * understood and adjusted from a single place.
 */

// ─── Time durations ────────────────────────────────────────────────────────────

/** Session/JWT lifetime for authenticated users (30 days). */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Email-link sign-in token lifetime (24 hours). */
export const EMAIL_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60;

/** How long an invite link stays valid (7 days). */
export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Grace period before soft-deleted records are hard-deleted (30 days). */
export const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Rate limiting ─────────────────────────────────────────────────────────────

/** Signup rate-limit: max attempts per IP within the window. */
export const SIGNUP_RATE_LIMIT = 5;

/** Signup rate-limit window (1 hour). */
export const SIGNUP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Invite acceptance rate-limit: max attempts per IP within the window. */
export const INVITE_ACCEPT_RATE_LIMIT = 10;

/** Invite acceptance rate-limit window (15 minutes). */
export const INVITE_ACCEPT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Profile update rate-limit: max attempts per user within the window. */
export const PROFILE_UPDATE_RATE_LIMIT = 20;

/** Profile update rate-limit window (15 minutes). */
export const PROFILE_UPDATE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** In-memory rate-limit map cleanup interval (5 minutes). */
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum rows for CSV report exports. */
export const REPORT_CSV_MAX_ROWS = 50_000;

/** Maximum audit export date range in days. */
export const AUDIT_MAX_DATE_RANGE_DAYS = 90;

// ─── File uploads ──────────────────────────────────────────────────────────────

/** Maximum upload size per file (25 MB). */
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

// ─── CSV / Exports ─────────────────────────────────────────────────────────────

/** Maximum rows for audit CSV export. */
export const AUDIT_CSV_MAX_ROWS = 50_000;

// ─── Patient Portal ──────────────────────────────────────────────────────────

/** Portal login rate limit: max attempts per email within the window. */
export const PORTAL_LOGIN_RATE_LIMIT = 5;

/** Portal login rate-limit window (15 minutes). */
export const PORTAL_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Portal magic-link rate limit: max per email within the window. */
export const PORTAL_MAGIC_LINK_RATE_LIMIT = 10;

/** Portal magic-link rate-limit window (1 hour). */
export const PORTAL_MAGIC_LINK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Portal journal entries rate limit: max creates per hour. */
export const PORTAL_JOURNAL_RATE_LIMIT = 30;

/** Portal journal rate-limit window (1 hour). */
export const PORTAL_JOURNAL_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Portal password reset rate limit: max per email within the window. */
export const PORTAL_PASSWORD_RESET_RATE_LIMIT = 3;

/** Portal password reset rate-limit window (1 hour). */
export const PORTAL_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Portal activation rate limit: max attempts per IP within the window. */
export const PORTAL_ACTIVATION_RATE_LIMIT = 5;

/** Portal activation rate-limit window (15 minutes). */
export const PORTAL_ACTIVATION_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Portal invite rate limit: max invites per patient within the window. */
export const PORTAL_INVITE_RATE_LIMIT = 5;

/** Portal invite rate-limit window (1 hour). */
export const PORTAL_INVITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
