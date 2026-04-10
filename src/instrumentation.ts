/**
 * Next.js Instrumentation Hook — Psycologger
 *
 * Runs once when the Next.js server starts.
 * Used for environment validation and other startup checks.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Initialize Sentry on both server and edge runtimes
  if (process.env.SENTRY_DSN) {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      await import("../sentry.server.config");
    }
    if (process.env.NEXT_RUNTIME === "edge") {
      await import("../sentry.edge.config");
    }
  }

  // Only run remaining checks on the server (not Edge Runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Skip during `next build` — env vars from Vercel marketplace integrations
  // (e.g. Upstash) are only injected at runtime, not during the build phase.
  // Validating then would fail builds even though prod runtime is healthy.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Startup environment validation
  const { validateEnv, validateAllEnvVars } = await import("@/lib/env-check");

  // Log detailed validation results in development
  if (process.env.NODE_ENV === "development") {
    const result = validateAllEnvVars();
    if (!result.valid) {
      console.error("\n[env-check] Validation errors:");
      result.errors.forEach((err) => console.error(`  ✗ ${err}`));
    }
    if (result.warnings.length > 0) {
      console.warn("\n[env-check] Validation warnings:");
      result.warnings.forEach((warn) => console.warn(`  ⚠ ${warn}`));
    }
  }

  // Throw and exit if any required vars are missing
  validateEnv();
}

// Export Sentry's request error handler for Next.js 15+ (safe in Next 14.x recent versions)
export { captureRequestError as onRequestError } from "@sentry/nextjs";
