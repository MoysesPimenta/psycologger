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

  // TODO(P1-5): Wire @sentry/nextjs here.
  // 1. npm install @sentry/nextjs
  // 2. npx @sentry/wizard@latest -i nextjs
  // 3. Add SENTRY_DSN to Vercel env vars.
  // Until then, errors are only logged via src/lib/logger.ts.
  if (process.env.SENTRY_DSN) {
    // eslint-disable-next-line no-console
    console.warn("[instrumentation] SENTRY_DSN set but @sentry/nextjs not installed");
  }
}
