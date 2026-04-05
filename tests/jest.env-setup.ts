/**
 * Jest environment setup — sets required environment variables
 * before any test modules are loaded.
 *
 * This runs BEFORE module-level code executes, so it satisfies
 * the NEXTAUTH_SECRET validation in src/lib/auth.ts.
 */

// Required by src/lib/auth.ts (validates at module load time)
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-characters-long-for-jest";
}

// Required by src/lib/crypto.ts for CPF encryption tests
if (!process.env.ENCRYPTION_KEY) {
  // 32 bytes (256-bit), base64-encoded — test-only key
  process.env.ENCRYPTION_KEY = "FkQ3PoifWO/yh9XaejP63+0YVb9sl8k+oyHlutz6uJE=";
}

// Database URL fallback for unit tests (not actually connected)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

// Prevent accidental emails in tests
if (!process.env.RESEND_API_KEY) {
  process.env.RESEND_API_KEY = "re_test_jest_placeholder";
}
