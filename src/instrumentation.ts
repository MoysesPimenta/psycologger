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
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Skip during `next build` — env vars from Vercel marketplace integrations
  // (e.g. Upstash) are only injected at runtime, not during the build phase.
  // Validating then would fail builds even though prod runtime is healthy.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { validateEnv } = await import("@/lib/env-check");
  validateEnv();
}
