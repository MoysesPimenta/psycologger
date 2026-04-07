# ADR: CSP Nonce Migration — Parked Pending Resolution

**Status:** PARKED (2026-04-07)  
**Author:** Claude Code Agent  
**Related:** Branch `feat/csp-nonce` (commit 0cc3854)

## Context

Nonce-based Content-Security-Policy is a valuable security hardening measure. The current CSP uses `'unsafe-inline'` for scripts and styles, which weakens the defense against stored-XSS attacks.

The runbook at `docs/runbooks/CSP_NONCE_MIGRATION.md` outlines a migration to per-request nonce-based CSP:
- Generate a 16-byte nonce per request in middleware
- Inject into `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
- Forward to layouts via `x-csp-nonce` header

## What Was Attempted

Branch `feat/csp-nonce` (0cc3854a1be4c91d055cfe3f3bf3532c29f0e7f4) attempted to implement this, with core changes to:

1. **src/middleware.ts** — Added `generateNonce()` function using `crypto.getRandomValues()` (valid for Edge Runtime), nonce injection into CSP headers
2. **next.config.mjs** — Removed Sentry configuration wrapper

Deployment to Vercel (dpl_GB4ykZqHJkfXubuQXDNvTMJqkTJ1) failed with state=ERROR.

## Why It Was Blocked

### Critical Blocker: Sentry Configuration Removed

The branch **removes the Sentry SDK wrapper** from `next.config.mjs`:

```diff
- export default withSentryConfig(nextConfig, {
-   silent: true,
-   org: process.env.SENTRY_ORG,
-   project: process.env.SENTRY_PROJECT,
-   authToken: process.env.SENTRY_AUTH_TOKEN,
-   // ...
- });
+ export default nextConfig;
```

**Impact:**
- `src/instrumentation.ts` calls `await import("../sentry.server.config")` and `await import("../sentry.edge.config")` to initialize Sentry
- `src/lib/env-check.ts` validates `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` must be present
- Removing the wrapper breaks the integration: Sentry tries to initialize but the config doesn't support it
- Error tracking and crash reporting are lost in production
- This is a breaking change that requires explicit decision-making

### Secondary Issue: Removed Public Routes

The branch removed these routes from the `authorized` callback:
- `/api/health` — Needed for health checks and monitoring
- `/api/v1/cron/` — Needed for Vercel scheduled crons (payment reminders, etc.)

This breaks infrastructure that depends on these endpoints being publicly accessible.

## Current Security Headers (Main Branch)

The current `src/middleware.ts` on main provides:

- **CSP:** `script-src 'self' 'unsafe-inline'` (weak, allows inline scripts)
- **HSTS:** 63072000 seconds (2 years) with subdomains and preload
- **X-Content-Type-Options:** nosniff
- **X-Frame-Options:** DENY
- **Referrer-Policy:** strict-origin-when-cross-origin
- **Permissions-Policy:** camera, microphone, geolocation, interest-cohort, payment disabled

The weak CSP is a known risk. It was part of the decision to add a runbook for nonce-based CSP.

## What Would Need to Change for a Successful Attempt

1. **Decide on Sentry:**
   - Option A: Keep Sentry — restore `withSentryConfig` wrapper; ensure nonce generation doesn't interfere with Sentry's own instrumentation
   - Option B: Remove Sentry entirely — update `src/instrumentation.ts`, remove `@sentry/nextjs` from dependencies, update env validation, decide on alternative error tracking

2. **Restore removed routes:**
   - Add `/api/health` and `/api/v1/cron/` back to public routes in the `authorized` callback

3. **Test per runbook:**
   - Deploy to staging preview
   - Verify no blank pages on `/`, `/login`, `/app`, `/portal/login`
   - Check DevTools for CSP violations
   - Run smoke tests

4. **Verify Edge Runtime compatibility:**
   - The nonce generation itself (`crypto.getRandomValues`, `btoa`) is compatible with Next.js Edge Runtime
   - But Sentry integration (if kept) must be tested with nonce-based CSP

## Recommendation

**Do not merge `feat/csp-nonce` in current form.** The removal of Sentry is a significant architectural decision that needs explicit team discussion:

- If Sentry stays, it should be wrapped back in `withSentryConfig`
- If Sentry is removed, there should be an explicit ADR explaining why error tracking is no longer needed and what replaces it

Create a fresh `feat/csp-nonce-v2` branch after decision is made. The nonce generation logic itself is sound; the architectural mismatch is the problem.

## Related

- **Runbook:** docs/runbooks/CSP_NONCE_MIGRATION.md
- **Sentry configs:** sentry.server.config.ts, sentry.edge.config.ts, sentry.client.config.ts
- **Branch:** origin/feat/csp-nonce (parked, do not delete)
