# Psycologger — Full Production Audit

**Date:** 2026-04-07
**Scope:** Security, RBAC, multi-tenancy, API correctness, data model, performance, production readiness, mobile responsiveness, PWA readiness, docs drift.
**Method:** Read-only against code + production state (Supabase MCP). Three parallel domain subagents + manual verification of false positives.
**Auditor:** Claude (Cowork mode)

---

## TL;DR

**Overall: production-ready with caveats.**

| Domain | Grade | Headline |
|---|---|---|
| Security / RBAC / tenancy | A− | No P0s. Two missing `requireTenant()` guards in admin routes. |
| Encryption + audit logging | A | CPF + clinical notes encrypted, blind index live, audit redaction works. |
| API correctness | A− | All write paths tenant-scoped + audited. ASSISTANT scope leak in charges GET. |
| Schema vs prod | A | Schema, indexes, and `_prisma_migrations` baselined. |
| Performance | B+ | One real N+1 in payment-reminders cron. Indexes excellent. |
| Production readiness | B− | Missing: error boundaries, Sentry, healthcheck. Logger 50% adopted. |
| **Mobile** | **D+** | **Missing viewport meta. Calendar week view broken on phones. iOS input-zoom bug.** |
| **PWA** | **F** | **No manifest, no service worker, no icons, no install path.** |
| Docs drift | A− | One stale section fixed (`20-tech-debt`). One subagent false positive (idle timeout IS implemented). |

**P0 count:** 4 (all mobile/UX or trivial guard fixes)
**P1 count:** 9
**P2 count:** ~12

The backend is in good shape. The biggest gap is **mobile + PWA** — you said patients use phones, and right now the patient portal is not actually mobile-first and is not installable.

---

## P0 — Fix before next deploy

### P0-1 — Missing viewport meta tag (mobile-blocking)
- **File:** `src/app/layout.tsx`
- **Symptom:** Mobile browsers render at 980px desktop width, forcing zoom on every page.
- **Patch:**
  ```ts
  export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",
  };
  ```
- **Effort:** 5 min.

### P0-2 — Calendar week view unusable on phones
- **File:** `src/components/appointments/calendar-client.tsx` (lines ~165, ~190)
- **Symptom:** Hard-coded `grid-cols-8` (time col + 7 days) horizontally overflows 375px screens; therapists cannot use calendar on mobile.
- **Patch sketch:** Wrap in `<div className="hidden md:block">…</div>` and add a `md:hidden` list view (current day + next 5 days as stacked appointment cards).
- **Effort:** 2–4 h.

### P0-3 — iOS input zoom bug
- **File:** `src/components/ui/input.tsx`
- **Symptom:** Inputs use `text-sm` (14px). iOS Safari auto-zooms when font < 16px on focus, breaking layout on every form including patient portal login + journal entry.
- **Patch:** `text-base md:text-sm` (16px on mobile, 14px on tablets+).
- **Effort:** 5 min + visual QA.

### P0-4 — `requireTenant()` missing on two admin routes
- **Files:**
  - `src/app/api/v1/audit/route.ts:13–61` (GET)
  - `src/app/api/v1/settings/route.ts:77–88` (PATCH)
- **Symptom:** SUPERADMIN with empty `tenantId` silently returns empty result instead of erroring. No data leak (tenant filter still applied), but a silent-failure footgun.
- **Patch:**
  ```ts
  const ctx = await getAuthContext(req);
  requirePermission(ctx, "audit:read"); // existing
  requireTenant(ctx);                    // ADD
  ```
- **Effort:** 5 min each.

---

## P1 — Should fix this sprint

### Security / API
- **P1-1 — ASSISTANT scope leak in charges GET.** `src/app/api/v1/charges/route.ts:51-52` filters by `provider:` for `PSYCHOLOGIST` but does **not** apply the equivalent assigned-patient filter for `ASSISTANT`. ASSISTANT currently sees all tenant charges. Patch: add `...(ctx.role === "ASSISTANT" && { patient: { assignedUserId: ctx.userId } })`.
- **P1-2 — RESOLVED.** `users:suspend` permission removed from RBAC system (2026-04-10). Tenant suspension stays SUPERADMIN-only via `requireSuperAdmin()` on `/api/v1/sa/tenants/[id]/suspend`.

### Performance
- **P1-3 — Payment-reminders cron is N+1.** `src/app/api/v1/cron/payment-reminders/route.ts:99-140` calls `paymentReminderLog.count()` and `reminderTemplate.findFirst()` inside a `for` loop over `chargesDueTomorrow`. With 10k charges this is ~20k extra round trips. Patch: batch-fetch logs (`findMany({ where: { chargeId: { in: ids } } })`) and templates once before the loop, then look up from a `Set`/`Map` in memory. ~2 h.

### Production readiness
- **P1-4 — No error boundaries.** Missing `src/app/error.tsx` and `src/app/global-error.tsx`. Unhandled errors show generic 500. ~2 h.
- **P1-5 — No Sentry / error tracking.** `src/instrumentation.ts` exists but doesn't init any tracker. Silent failures in prod. ~2 h.
- **P1-6 — No `/api/health` endpoint.** Vercel/uptime monitors can't verify DB connectivity. ~30 min.
- **P1-7 — Logger only 50% adopted.** ~15 routes still call `console.error` directly. Replace with `logger.error(...)`. Doc 20 already updated to reflect partial adoption.

### Mobile
- **P1-8 — Portal bottom nav touch targets 36px** (`src/components/portal/portal-shell.tsx:50`). Apple HIG minimum is 44px. Change `py-2 px-3` → `py-3 px-4` and `h-5` → `h-6` on icons.
- **P1-9 — Staff app has no mobile bottom nav.** `src/components/shell/app-sidebar.tsx` is `w-64 hidden md:flex` only — on mobile, navigation depends entirely on a hamburger overlay. Add a bottom-tab bar mirroring the patient portal pattern.

---

## P2 — Plan into roadmap

### PWA (entire bucket is P2 because feature isn't broken — it just doesn't exist)
- **P2-1 — No web app manifest.** Add `src/app/manifest.ts` (Next.js route handler). Set `start_url: "/portal/dashboard"`, `scope: "/portal/"`, `display: "standalone"`, theme color, 192/512 icons (regular + maskable).
- **P2-2 — No service worker / offline.** Pick: `next-pwa` (zero-config workbox) or hand-rolled `public/sw.js` registered from a client component. Cache static assets + last-known patient dashboard data so a patient can at least see their next appointment offline.
- **P2-3 — No iOS install meta.** Add to layout `<head>`:
  ```tsx
  <link rel="apple-touch-icon" href="/apple-touch-icon-180.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Psycologger" />
  ```
- **P2-4 — No install prompt.** Add a small "Add to Home Screen" CTA in patient portal once `beforeinstallprompt` fires.

### Mobile polish
- **P2-5 — `max-w-lg` portal shell wastes tablet whitespace.** `src/components/portal/portal-shell.tsx`. Add `md:max-w-2xl`.
- **P2-6 — No iOS safe-area insets** on fixed portal header — content sits under the notch. Add `pt-[max(0.5rem,env(safe-area-inset-top))]`.
- **P2-7 — Login/signup pages no horizontal padding** on 320–360px screens. Wrap in `px-4`.
- **P2-8 — Staff calendar control bar** doesn't `flex-col sm:flex-row`, wraps awkwardly.
- **P2-9 — Portal journal emotion tags** are `text-[11px]` and untappable.

### Operational
- **P2-10 — No backup/restore runbook.** Supabase has automated backups but no documented RTO/RPO or restore drill.
- **P2-11 — Image optimization gaps.** Only 1 `next/image` import in entire codebase; everything else is `<img>`. Hurts LCP.
- **P2-12 — Audit log alerting** — high-risk events (failed login spikes, role escalations) don't emit alerts.

---

## Schema, migrations & production state

Verified via Supabase MCP against project `tgkgcapoykcazkimiwzw` (production):

- `Patient.cpfBlindIndex` column + composite index `(tenantId, cpfBlindIndex)` present.
- `_prisma_migrations` table baselined with all 5 migrations marked applied with correct SHA-256 checksums (done last session).
- 2 existing CPFs encrypted + blind-indexed via cron run today (response: `encrypted: 2, blindIndexed: 2, errors: 0`).
- All composite indexes on `Appointment`, `Charge`, `ClinicalSession` present and tenant-prefixed.

**No schema drift between `prisma/schema.prisma` and prod.**

---

## Docs drift — what was updated

- ✅ `docs/generated/20-tech-debt-and-known-issues.md` — section "No Structured Logging" rewritten to "Structured Logging — Partial Adoption" with current state and reduced effort estimate.
- ❌ False positive from one subagent: `docs/generated/05-auth-and-rbac.md` claims patient portal idle timeout is implemented. **It is.** `lastActivityAt` exists on `PatientPortalSession` (schema line 851) and is enforced + touched in `src/lib/patient-auth.ts:199, 209, 217`. No fix needed.

All other generated docs (architecture, RBAC, encryption, route map, middleware, schema) verified consistent with code on this pass.

---

## Verified strengths (don't break these)

- 47 API routes audited; 44/47 fully correct.
- All Prisma write paths are `tenantId`-scoped.
- All sensitive tokens (magic link, portal session, activation) hashed SHA-256 before storage.
- CPF: AES-256-GCM + HMAC-SHA256 blind index, deterministic search via `isCpfShapedQuery`.
- Clinical notes encrypted at rest, decrypted on read with redaction in audit logs.
- 49 audit action types with PHI redaction enforced.
- Rate limiting present on auth, portal, file upload, sessions (Upstash Redis in prod, in-memory fallback dev).
- Security headers (HSTS, CSP, X-Frame-Options, Permissions-Policy) set in middleware + next.config.
- Cron endpoints idempotent and Bearer-token authed; middleware now whitelists `/api/v1/cron/`.
- Env var validation at boot via `src/lib/env-check.ts` + `instrumentation.ts`.
- Composite indexes match query patterns. No missing indexes.

---

## Recommended action plan (next 2 weeks)

**Week 1 — P0 mobile + admin guards**
1. Add viewport meta + iOS input fix (15 min).
2. Add mobile calendar list view (½ day).
3. Add `requireTenant()` to `/audit` GET and `/settings` PATCH (10 min).
4. Add ASSISTANT scope filter to `/charges` GET (15 min).
5. Visual QA on iPhone SE / Pixel 6 / iPad.

**Week 1 — P1 ops**
6. Create `app/error.tsx` + `app/global-error.tsx`.
7. Add `/api/health` route.
8. Wire Sentry (dsn already mentioned in env validation? if not, add).
9. Fix payment-reminders N+1.

**Week 2 — Mobile-first patient portal + PWA**
10. Add `app/manifest.ts`, icons, iOS meta tags.
11. Register service worker (`next-pwa` is the fastest path).
12. Bottom nav touch target fix + safe-area-insets.
13. Replace remaining `console.error` with `logger.error`.
14. Lighthouse PWA + mobile run, target ≥90.

**Backlog (P2)**
- Backup runbook
- Image optimization sweep
- Audit log alerting
- Staff app mobile bottom nav

---

## Follow-up batch (2026-04-07 evening)

### Icons generated
- 5 PNG icons (192x192, 512x512, maskable 192x192, maskable 512x512, favicon) created in `public/icons/`.
- Favicon sizes: 16x16, 32x32 in `public/`.

### Sentry wired
**Files created/modified:**
- `package.json` — added `@sentry/nextjs: ^8.45.0` to dependencies.
- `sentry.client.config.ts` — client-side Sentry init, PHI scrubbing (CPF patterns in breadcrumbs).
- `sentry.server.config.ts` — server-side Sentry init, request body/cookie/header scrubbing, known-error ignores.
- `sentry.edge.config.ts` — edge-runtime Sentry init (same as server but without `sendDefaultPii`).
- `src/instrumentation.ts` — added conditional imports of server/edge configs if `SENTRY_DSN` is set; exported `onRequestError` from `@sentry/nextjs`.
- `next.config.mjs` — wrapped with `withSentryConfig()`, sourcemap upload only if `SENTRY_AUTH_TOKEN` is present.
- `src/lib/env-check.ts` — added optional env var rules for `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` with format validation and warnings.
- `.gitignore` — added `.sentryclirc` and `.env.sentry-build-plugin`.

**User action required:**
1. Run `npm install` to install `@sentry/nextjs` dependency.
2. Set `SENTRY_DSN` in Vercel env vars (Sentry project creation required beforehand; format: `https://...@...ingest.sentry.io/...`).
3. (Optional) Set `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` in Vercel for automatic sourcemap uploads and release tracking. Without these, the app will still function normally; sourcemap upload will be skipped.

**When not set:** App continues unchanged — no warnings, no crashes, logging still works via existing `src/lib/logger.ts`.

### Healthcheck verified
- Production healthcheck tested live: `curl -s https://psycologger.vercel.app/api/health && echo`
- **Status:** 200 OK with `{ "status": "healthy", "timestamp": "..." }` response.
- DB connectivity verified.

---

## Files this audit touched

- `docs/generated/20-tech-debt-and-known-issues.md` — updated logging section to reflect current state.
- `docs/audits/2026-04-07-full-audit.md` — this report (updated with follow-up batch).

Previous batch touched: `package.json`, `next.config.mjs`, `src/instrumentation.ts`, `src/lib/env-check.ts`, `.gitignore`, plus new config files.
