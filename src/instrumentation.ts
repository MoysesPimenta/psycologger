/**
 * Next.js Instrumentation Hook — Psycologger
 *
 * Runs once when the Next.js server starts.
 * Used for environment validation and other startup checks.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (not Edge Runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env-check");
    validateEnv();
  }
}
